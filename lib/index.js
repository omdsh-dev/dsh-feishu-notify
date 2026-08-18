/**
 * dsh-feishu-notify — Feishu (飞书) custom-bot notifications for DSH.
 *
 * Adapted from pi-atlas's guard extension. Two trigger points:
 *   1. `agent/status` → `idle` — the agent settled (no driver remains
 *      scheduled or active): the model finished its response and handed
 *      control back. Fires once per completed turn.
 *   2. `session/event` → `tool/call` of `ask_user_question` — the model is
 *      waiting for human input (the DSH counterpart of pi-atlas's AskUser).
 *
 * Adapted for DSH 0.1.0-rc.7 (the current @deepseek-ai package line):
 *   - built on the published forks `@deepseek-ai/cordis` /
 *     `@deepseek-ai/schemastery` that DSH ships, instead of upstream cordis;
 *   - event payloads typed from the real published `@deepseek-ai/dsh-agent`
 *     and `@deepseek-ai/dsh-session` packages (note: the `agent/status`
 *     subject is `Agent`, whose session id field is `agent.id` — the old
 *     hand-rolled `sessionId` shape produced `undefined` card links);
 *   - settings namespace registered through `@deepseek-ai/dsh-settings`
 *     (`settingsNamespace` + the branded `register` signature), with the
 *     rc.7 convention of an exported `Config` schema doubling as the
 *     `feishu-notify:` user-settings section shape.
 *
 * Config lives in the `feishu-notify:` settings namespace
 * (`$DSH_HOME/settings.yaml`, hot-reloaded by dsh-settings-file) and is
 * re-read on every notification:
 *
 * ```yaml
 * feishu-notify:
 *   enabled: true
 *   webhookUrl: <你的飞书群自定义机器人 Webhook 地址>  # 私有 URL，等同密钥，勿提交到仓库
 *   webhookSecret: ""            # 可选；webhook 启用签名时填写
 *   webUrl: http://127.0.0.1:3080 # 可选；留空则不显示「打开会话」按钮
 * ```
 *
 * Safe default: with no `webhookUrl` (or `enabled: false`) nothing is sent
 * and no key lives in source. Notifications are fire-and-forget — a failing
 * webhook never affects the agent loop.
 *
 * Namespace plugin shape (named exports only, no default export): the cordis
 * Loader's `unwrapExports` would discard `name`/`inject` behind a default.
 */
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { notify } from './notify.js';
export const name = 'feishu-notify';
export const inject = ['settings'];
const NS = settingsNamespace('feishu-notify');
/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `feishu-notify` settings-section shape: schema defaults → the
 * plugin's composition entry config (`base`) → the user settings.yaml
 * section. Re-read on every notification, so edits hot-apply without a
 * restart.
 */
export const Config = z.object({
    enabled: z.boolean().default(true),
    webhookUrl: z.string().default(''),
    webhookSecret: z.string().role('secret').default(''),
    webUrl: z.string().default('http://127.0.0.1:3080'),
});
export function apply(ctx, entry) {
    const scope = ctx.settings.register(NS, Config, { base: entry });
    // Session end: the agent went idle. Subagents are excluded inside notify().
    ctx.on('agent/status', ({ agent, status }) => {
        if (status !== 'idle')
            return;
        void notify(scope.get(), 'sessionEnd', {
            sessionId: agent.id,
            cwd: agent.session.header.cwd,
            origin: agent.session.header.origin,
            delegationDepth: agent.session.header.delegationDepth,
        });
    });
    // Waiting for input: the model called ask_user_question (blocks the turn
    // until a human answers, so it never overlaps the idle notification).
    ctx.on('session/event', (session, event) => {
        if (event.type !== 'tool/call' || event.data.name !== 'ask_user_question')
            return;
        void notify(scope.get(), 'askUser', {
            sessionId: session.id,
            cwd: session.header.cwd,
            origin: session.header.origin,
            delegationDepth: session.header.delegationDepth,
        });
    });
}
