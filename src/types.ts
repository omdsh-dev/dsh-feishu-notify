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

import type z from 'schemastery'

/** The durable header fields the notify logic reads. */
export interface AgentHeaderLike {
  /** Absolute workspace/cwd path stamped at session creation. */
  readonly cwd?: string
  /** Present on sessions created as a subagent child. */
  readonly origin?: 'subagent'
  /** Parent depth + 1 for a subagent child; absent (zero) for a top-level session. */
  readonly delegationDepth?: number
}

/** Minimal shape of the agent-loop Agent as delivered in `agent/status`. */
export interface AgentLike {
  readonly sessionId: string
  readonly session: { readonly header: AgentHeaderLike }
}

/** `agent/status` payload: agent lifecycle state (`idle` ⇄ `running`). */
export interface AgentStatusPayload {
  readonly agent: AgentLike
  readonly status: 'idle' | 'running'
}

/** Minimal shape of the event-sourced Session delivered in `session/event`. */
export interface SessionLike {
  readonly id: string
  readonly header: AgentHeaderLike
}

/** Minimal shape of one SessionEvent as delivered in `session/event`. */
export interface SessionEventLike {
  readonly type: string
  readonly data: { readonly name?: string }
}

/** Owner-facing handle of one registered settings namespace. */
export interface SettingsScopeLike<T> {
  /** Current resolved value: schema defaults, then base, then the user layer. */
  get(): T
}

/** Minimal shape of the settings service (`ctx.settings`). */
export interface SettingsServiceLike {
  register<T>(ns: string, schema: z<T>, options?: { base?: Partial<T>; applies?: 'live' | 'restart' }): SettingsScopeLike<T>
}

declare module 'cordis' {
  interface Context {
    settings: SettingsServiceLike
  }

  interface Events {
    /** Agent status changed (`idle` ⇄ `running`). */
    'agent/status'(payload: AgentStatusPayload): void
    /** One event appended to a session's durable log. */
    'session/event'(session: SessionLike, event: SessionEventLike): void
  }
}
