/**
 * Local structural declarations for the cordis surfaces this plugin consumes.
 *
 * The plugin intentionally carries NO runtime dependency on the unpublished
 * `@deepseek-ai/dsh-*` packages. The real event payloads are structurally
 * compatible with the minimal shapes below (verified against the DSH
 * checkout): `agent/status` carries the agent-loop Agent (which exposes
 * `sessionId` and `session.header`), and `session/event` carries the
 * event-sourced Session plus one SessionEvent.
 *
 * Types are erased at compile time — this module emits nothing.
 */
export {};
