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
export interface NotifyConfig {
    enabled: boolean;
    webhookUrl: string;
    webhookSecret: string;
    webUrl: string;
}
export type NotifyType = 'askUser' | 'sessionEnd';
/** What one notification is about: session identity + subagent lineage. */
export interface NotifyTarget {
    sessionId: string;
    cwd?: string;
    origin?: 'subagent';
    delegationDepth?: number;
}
/**
 * True for subagent sessions. DSH subagents run as child agents in the same
 * process (subagent-spawn/fork), so detection reads the durable session
 * header instead of an environment variable: `origin: 'subagent'` marks a
 * child, and a persisted `delegationDepth > 0` survives restart/resume.
 */
export declare function isSubagentTarget(target: NotifyTarget): boolean;
/** Keep only the last two path components (mirrors xbot's `last_two_dirs`). */
export declare function lastTwoDirs(cwd: string): string;
/** Feishu v1 interactive card: compact header + pwd (last two dirs) + link button. */
export declare function buildCard(type: NotifyType, cwd: string, sessionId: string, webUrl: string): Record<string, unknown>;
/** HMAC-SHA256 signature for a signed webhook (key = `${timestamp}\n${secret}`, empty message). */
export declare function sign(timestamp: string, secret: string): string;
/**
 * POST the card to the webhook. Never throws; failures only log to stderr.
 * Returns the parsed Feishu response (`{ code, StatusCode }`), or `null`
 * when the request failed or the response was not JSON.
 */
export declare function sendFeishu(config: NotifyConfig, card: Record<string, unknown>): Promise<{
    code?: number;
    StatusCode?: number;
} | null>;
/**
 * Fire a Feishu notification of the given type. No-op for subagents or when
 * notifications are disabled/unconfigured. Safe to call as `void notify(...)`.
 */
export declare function notify(config: NotifyConfig, type: NotifyType, target: NotifyTarget): Promise<void>;
