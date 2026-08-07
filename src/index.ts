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
 * Config lives in the `feishu-notify:` settings namespace
 * (`$DSH_HOME/settings.yaml`, hot-reloaded by dsh-settings-local) and is
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

import z from 'schemastery'
import type { Context } from 'cordis'

import './types.js'
import { notify, type NotifyConfig } from './notify.js'

export const name = 'feishu-notify'

export const inject = ['settings']

/** Settings schema for the `feishu-notify:` namespace (defaults → base → user layer). */
const NotifySchema: z<NotifyConfig> = z.object({
  enabled: z.boolean().default(true),
  webhookUrl: z.string().default(''),
  webhookSecret: z.string().role('secret').default(''),
  webUrl: z.string().default('http://127.0.0.1:3080'),
})

export function apply(ctx: Context): void {
  const scope = ctx.settings.register<NotifyConfig>('feishu-notify', NotifySchema)

  // Session end: the agent went idle. Subagents are excluded inside notify().
  ctx.on('agent/status', (payload) => {
    if (payload.status !== 'idle') return
    const agent = payload.agent
    void notify(scope.get(), 'sessionEnd', {
      sessionId: agent.sessionId,
      cwd: agent.session.header.cwd,
      origin: agent.session.header.origin,
      delegationDepth: agent.session.header.delegationDepth,
    })
  })

  // Waiting for input: the model called ask_user_question (blocks the turn
  // until a human answers, so it never overlaps the idle notification).
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'tool/call' || event.data.name !== 'ask_user_question') return
    void notify(scope.get(), 'askUser', {
      sessionId: session.id,
      cwd: session.header.cwd,
      origin: session.header.origin,
      delegationDepth: session.header.delegationDepth,
    })
  })
}
