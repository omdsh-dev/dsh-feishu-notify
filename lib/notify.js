/**
 * Feishu (飞书) custom-bot notifications for DSH, adapted from pi-atlas's
 * `extensions/guard/notify.ts`.
 *
 * Two trigger points (see `src/index.ts`):
 *   1. `agent/status` → `idle`  → "session ended" (agent settled, no driver
 *      remains scheduled or active — the model handed control back).
 *   2. `session/event` → `tool/call` of `ask_user_question` → "waiting for
 *      input".
 *
 * Exclusions (notify is a no-op):
 *   - subagent sessions (`origin: 'subagent'` or `delegationDepth > 0` in the
 *     session header — DSH subagents run in-process), and
 *   - disabled config / empty `webhookUrl` (safe default; no keys in source).
 *
 * Config is resolved from the `feishu-notify:` settings namespace
 * (`$DSH_HOME/settings.yaml`, hot-reloaded) and re-read on every call, so
 * edits take effect without a restart. Fire-and-forget from the listeners:
 * `notify` never throws and network failures only log to stderr.
 *
 * Card schema + HMAC signing mirror xbot's `feishu-notify.py` via pi-atlas.
 */
import { createHmac } from 'node:crypto';
const CARD_META = {
    askUser: { emoji: '🔔', title: 'dsh 等待输入', template: 'orange' },
    sessionEnd: { emoji: '✅', title: 'dsh 会话结束', template: 'blue' },
};
/**
 * True for subagent sessions. DSH subagents run as child agents in the same
 * process (subagent-spawn/fork), so detection reads the durable session
 * header instead of an environment variable: `origin: 'subagent'` marks a
 * child, and a persisted `delegationDepth > 0` survives restart/resume.
 */
export function isSubagentTarget(target) {
    return target.origin === 'subagent' || (target.delegationDepth ?? 0) > 0;
}
/** Keep only the last two path components (mirrors xbot's `last_two_dirs`). */
export function lastTwoDirs(cwd) {
    const parts = cwd.replace(/\/+$/, '').split('/');
    if (parts.length >= 2)
        return parts.slice(-2).join('/');
    return cwd || '/';
}
/** Feishu v1 interactive card: compact header + pwd (last two dirs) + link button. */
export function buildCard(type, cwd, sessionId, webUrl) {
    const meta = CARD_META[type];
    const elements = [
        { tag: 'div', text: { tag: 'lark_md', content: `**📁 目录**\n${lastTwoDirs(cwd)}` } },
    ];
    // Omit the "open session" button entirely when no webUrl is configured.
    if (webUrl) {
        elements.push({
            tag: 'action',
            actions: [
                {
                    tag: 'button',
                    text: { tag: 'plain_text', content: '打开会话' },
                    type: 'primary',
                    url: `${webUrl}/?session=${encodeURIComponent(sessionId)}`,
                },
            ],
        });
    }
    return {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: `${meta.emoji} ${meta.title}` },
            template: meta.template,
        },
        elements,
    };
}
/** HMAC-SHA256 signature for a signed webhook (key = `${timestamp}\n${secret}`, empty message). */
export function sign(timestamp, secret) {
    return createHmac('sha256', `${timestamp}\n${secret}`).update('', 'utf8').digest('base64');
}
/**
 * POST the card to the webhook. Never throws; failures only log to stderr.
 * Returns the parsed Feishu response (`{ code, StatusCode }`), or `null`
 * when the request failed or the response was not JSON.
 */
export async function sendFeishu(config, card) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = { msg_type: 'interactive', card };
    if (config.webhookSecret) {
        payload.timestamp = timestamp;
        payload.sign = sign(timestamp, config.webhookSecret);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        });
        const text = await res.text();
        let result = {};
        try {
            result = JSON.parse(text);
        }
        catch {
            console.error(`[dsh-feishu-notify] bad response: ${text}`);
            return null;
        }
        if (result.code !== 0 && result.StatusCode !== 0) {
            console.error(`[dsh-feishu-notify] failed: ${text}`);
        }
        return result;
    }
    catch (e) {
        console.error(`[dsh-feishu-notify] error: ${e.message}`);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Fire a Feishu notification of the given type. No-op for subagents or when
 * notifications are disabled/unconfigured. Safe to call as `void notify(...)`.
 */
export async function notify(config, type, target) {
    try {
        if (isSubagentTarget(target))
            return;
        if (!config.enabled || !config.webhookUrl)
            return;
        const cwd = target.cwd || process.cwd();
        await sendFeishu(config, buildCard(type, cwd, target.sessionId, config.webUrl));
    }
    catch (e) {
        console.error(`[dsh-feishu-notify] ${type} error: ${e.message}`);
    }
}
