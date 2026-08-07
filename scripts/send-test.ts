/**
 * One-time manual verification: send a real "sessionEnd" test card to the
 * Feishu webhook from environment variables, independent of installing the
 * plugin. Exits 0 only when Feishu accepts the card (`code: 0`).
 *
 *   DSH_NOTIFY_WEBHOOK_URL=<你的飞书群自定义机器人 Webhook 地址> \
 *   DSH_NOTIFY_WEBHOOK_SECRET=<可选> \
 *   DSH_NOTIFY_WEB_URL=http://127.0.0.1:3080 \
 *   pnpm send-test
 */
import { buildCard, sendFeishu } from '../src/notify.js'

const webhookUrl = process.env.DSH_NOTIFY_WEBHOOK_URL ?? ''
if (!webhookUrl) {
  console.error(
    '[dsh-feishu-notify] set DSH_NOTIFY_WEBHOOK_URL (optionally DSH_NOTIFY_WEBHOOK_SECRET / DSH_NOTIFY_WEB_URL)',
  )
  process.exit(1)
}

const config = {
  enabled: true,
  webhookUrl,
  webhookSecret: process.env.DSH_NOTIFY_WEBHOOK_SECRET ?? '',
  webUrl: process.env.DSH_NOTIFY_WEB_URL ?? '',
}
const result = await sendFeishu(
  config,
  buildCard('sessionEnd', process.cwd(), `send-test-${Date.now()}`, config.webUrl),
)
if (result !== null && (result.code === 0 || result.StatusCode === 0)) {
  console.log('[dsh-feishu-notify] ✓ Feishu accepted the card (code 0)')
  process.exit(0)
}
console.error('[dsh-feishu-notify] ✗ Feishu rejected the card — see the response logged above')
process.exit(1)
