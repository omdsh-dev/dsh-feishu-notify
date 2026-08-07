/**
 * dsh-feishu-notify — unit tests.
 *
 * Stubs `globalThis.fetch` to capture the payload; no network. Covers config
 * gating, subagent suppression, and card/payload structure.
 *
 * Run: pnpm test  (tsx scripts/test-notify.ts)
 */
import { buildCard, isSubagentTarget, lastTwoDirs, notify, sign } from '../src/notify.js'
import type { NotifyConfig, NotifyTarget } from '../src/notify.js'

let pass = 0
let fail = 0
function assert(cond: unknown, msg: string): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    console.error(`  ✗ ${msg}`)
  }
}

// ── fetch stub ──────────────────────────────────────────────────────
interface Captured {
  url: string
  payload: any
}
let captured: Captured | null = null
const origFetch = globalThis.fetch
globalThis.fetch = (async (url: any, init: any) => {
  captured = { url, payload: JSON.parse(init.body) }
  return new Response(JSON.stringify({ code: 0, msg: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

const sessionId = 'notify-unit'
const target: NotifyTarget = { sessionId, cwd: '/root/Code/dsh-feishu-notify' }
const enabled: NotifyConfig = { enabled: true, webhookUrl: 'https://hook.example.com/v2', webhookSecret: '', webUrl: '' }

console.log('dsh-feishu-notify\n')

// ── isSubagentTarget ─────────────────────────────────────────────────
assert(!isSubagentTarget({ sessionId }), 'plain target → not subagent');
assert(isSubagentTarget({ sessionId, origin: 'subagent' }), "origin 'subagent' → subagent")
assert(isSubagentTarget({ sessionId, delegationDepth: 1 }), 'delegationDepth 1 → subagent')
assert(!isSubagentTarget({ sessionId, delegationDepth: 0 }), 'delegationDepth 0 → not subagent')

// ── lastTwoDirs ──────────────────────────────────────────────────────
assert(lastTwoDirs('/root/Code/pi-atlas') === 'Code/pi-atlas', 'last two dirs of nested path')
assert(lastTwoDirs('/') === '/', 'root path stays "/"')
assert(lastTwoDirs('/a') === '/a', 'short path stays itself')
assert(lastTwoDirs('/a/b/') === 'a/b', 'trailing slash stripped')

// ── buildCard structure ──────────────────────────────────────────────
const card = buildCard('askUser', '/root/Code/dsh-feishu-notify', sessionId, 'https://w.example.com')
assert((card.config as any)?.wide_screen_mode === true, 'card wide_screen_mode true')
const header = card.header as any
assert(/🔔/.test(header.title.content), 'askUser header has bell emoji')
assert(header.template === 'orange', 'askUser template orange')
const div = (card.elements as any[]).find((e) => e.tag === 'div')
assert(/Code\/dsh-feishu-notify$/.test(div.text.content), 'div shows last two dirs of pwd')
const action = (card.elements as any[]).find((e) => e.tag === 'action')
const button = action.actions[0]
assert(button.tag === 'button', 'action contains a button')
assert(button.type === 'primary', 'button type primary')
assert(
  button.url === `https://w.example.com/?session=${encodeURIComponent(sessionId)}`,
  'button url has encoded session id',
)
const card2 = buildCard('sessionEnd', '/a/b', sessionId, 'https://w.example.com')
assert((card2.header as any).template === 'blue', 'sessionEnd template blue')
assert(/会话结束/.test((card2.header as any).title.content), 'sessionEnd title text')
const cardNoButton = buildCard('askUser', '/root/Code/dsh-feishu-notify', sessionId, '')
assert(
  (cardNoButton.elements as any[]).filter((e) => e.tag === 'action').length === 0,
  'no button when webUrl empty',
)

// ── sign ────────────────────────────────────────────────────────────
assert(typeof sign('1700000000', 'secret') === 'string', 'sign returns a string')
assert(sign('1700000000', 'abc') !== sign('1700000000', 'xyz'), 'sign differs by secret')
assert(sign('1', 's') !== sign('2', 's'), 'sign differs by timestamp')

// ── notify: subagent suppression ────────────────────────────────────
captured = null
await notify(enabled, 'sessionEnd', { sessionId, cwd: '/x', origin: 'subagent' })
assert(captured === null, 'subagent target → no fetch')

// ── notify: config gating ───────────────────────────────────────────
captured = null
await notify({ ...enabled, enabled: false }, 'sessionEnd', target)
assert(captured === null, 'enabled:false → no fetch')
captured = null
await notify({ ...enabled, webhookUrl: '' }, 'sessionEnd', target)
assert(captured === null, 'empty webhookUrl → no fetch')

// ── notify: happy path (unsigned webhook) ───────────────────────────
captured = null
await notify({ ...enabled, webUrl: 'https://w.example.com' }, 'sessionEnd', target)
assert(captured !== null, 'enabled config → fetch called')
assert(captured!.url === 'https://hook.example.com/v2', 'POSTs to configured webhook')
assert(captured!.payload.msg_type === 'interactive', 'msg_type interactive')
assert(captured!.payload.timestamp === undefined, 'no secret → no timestamp/sign')
assert(captured!.payload.card.header.template === 'blue', 'sessionEnd card sent')

// ── notify: signed webhook ──────────────────────────────────────────
captured = null
await notify({ ...enabled, webhookSecret: 'topsecret' }, 'askUser', target)
assert(captured!.payload.timestamp !== undefined, 'secret → timestamp present')
assert(typeof captured!.payload.sign === 'string', 'secret → sign present')
assert(captured!.payload.card.header.template === 'orange', 'askUser card sent')

// ── notify: cwd fallback ────────────────────────────────────────────
captured = null
await notify(enabled, 'sessionEnd', { sessionId })
const fallbackDiv = (captured!.payload.card.elements as any[]).find((e) => e.tag === 'div')
assert(/dsh-feishu-notify$/.test(fallbackDiv.text.content), 'missing cwd falls back to process.cwd()')

// ── cleanup ─────────────────────────────────────────────────────────
globalThis.fetch = origFetch

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
