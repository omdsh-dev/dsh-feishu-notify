/**
 * Real-composition smoke test: mount the plugin on a genuine cordis Context
 * (the same load semantics the Loader uses — named exports `name`/`inject`/
 * `apply`, no default export), provide a fake `settings` service, emit the
 * two real events, and assert the webhook payloads.
 *
 * Run: pnpm smoke  (tsx scripts/smoke-test.ts)
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { name, inject, apply } from '../src/index.js'
import type { NotifyConfig } from '../src/notify.js'

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

// ── plugin export shape (the Loader's unwrapExports contract) ───────
assert(typeof name === 'string' && name === 'feishu-notify', 'name export is the plugin id')
assert(Array.isArray(inject) && inject.includes('settings'), 'inject lists the settings service')
assert(typeof apply === 'function', 'apply is a function')
assert(typeof (globalThis as any).default === 'undefined', 'no default export (namespace preserved)')

// ── fake settings service (schema defaults → user section) ──────────
const config: NotifyConfig = {
  enabled: true,
  webhookUrl: 'https://hook.example.com/v2',
  webhookSecret: '',
  webUrl: 'https://w.example.com',
}
class FakeSettings extends Service {
  constructor(ctx: Context) {
    super(ctx, 'settings')
  }
  register<T>(_ns: string, _schema: unknown): { get(): T } {
    return { get: () => config as T }
  }
}

// ── real cordis composition ─────────────────────────────────────────
const ctx = new Context()
await ctx.plugin(FakeSettings)
await ctx.plugin({ name, inject, apply })

// agent/status → idle  → sessionEnd card
captured = null
ctx.emit('agent/status', {
  agent: { id: 'smoke-main', session: { header: { cwd: '/root/Code/dsh-feishu-notify' } } },
  status: 'idle',
} as any)
await new Promise((r) => setTimeout(r, 20))
assert(captured !== null, 'idle event → fetch called')
assert(captured!.payload.msg_type === 'interactive', 'payload is an interactive card')
assert(captured!.payload.card.header.template === 'blue', 'sessionEnd card sent')
assert(
  captured!.payload.card.elements.some((e: any) => e.tag === 'action'),
  'webUrl set → button rendered',
)

// agent/status → running → no notification
captured = null
ctx.emit('agent/status', {
  agent: { id: 'smoke-main', session: { header: { cwd: '/root/Code/x' } } },
  status: 'running',
} as any)
await new Promise((r) => setTimeout(r, 20))
assert(captured === null, 'running event → no fetch')

// session/event → tool/call ask_user_question → askUser card
captured = null
ctx.emit('session/event', {
  id: 'smoke-main',
  header: { cwd: '/root/Code/dsh-feishu-notify' },
} as any, {
  type: 'tool/call',
  data: { name: 'ask_user_question' },
} as any)
await new Promise((r) => setTimeout(r, 20))
assert(captured !== null, 'ask_user_question call → fetch called')
assert(captured!.payload.card.header.template === 'orange', 'askUser card sent')
assert(/等待输入/.test(captured!.payload.card.header.title.content), 'askUser title text')

// session/event → other tool call → no notification
captured = null
ctx.emit('session/event', { id: 'smoke-main', header: {} } as any, {
  type: 'tool/call',
  data: { name: 'bash' },
} as any)
await new Promise((r) => setTimeout(r, 20))
assert(captured === null, 'other tool call → no fetch')

// subagent idle → suppressed
captured = null
ctx.emit('agent/status', {
  agent: { id: 'smoke-child', session: { header: { cwd: '/root/Code/sub', origin: 'subagent' } } },
  status: 'idle',
} as any)
await new Promise((r) => setTimeout(r, 20))
assert(captured === null, 'subagent idle → no fetch')

// teardown
await (ctx as any).fiber?.dispose()
globalThis.fetch = origFetch

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
