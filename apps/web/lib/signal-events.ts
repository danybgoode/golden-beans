// signals-loop · Story 1.0 — the reserved event namespace, in a ZERO-IMPORT module.
//
// ── Why these three lines live alone in their own file ───────────────────────────────────────
// They started out in lib/signals.ts, next to the grouping logic, which is where they read most
// naturally. That file carries `import 'server-only'` and `import { after } from 'next/server'` —
// and the moment an e2e spec imported the constant, the whole suite failed to collect with
// "Cannot find module 'server-only'", because importing the file at all pulls in the framework
// entrypoint even though the constant itself touches nothing.
//
// Roadmap/LEARNINGS.md has this exact entry: "A unit-tested pure helper can't live in the same file
// as code that imports a framework/runtime-only module — a generic test runner that can't load that
// module throws an opaque, unrelated-looking error the moment it imports the file at all." The
// prescribed fix is the one applied here: keep the pure value in its own zero-import file and let
// the framework-touching module import IT, never the reverse.
//
// ── What the `$` prefix means ────────────────────────────────────────────────────────────────
// `$`-prefixed event names are ENGINE-DEFINED and reserved; everything else in the event namespace
// belongs to the tenant. This is what makes signal capture additive: it rides the existing
// /v1/track envelope (the `tags`/`metadata` forward-compat that growth-engine-v1 S1.1 deliberately
// left open for exactly this) instead of needing a second ingest route or a schema migration.

/** A runtime error captured by the SDK. Grouped into a `signals` row of kind 'error'. */
export const ERROR_EVENT = '$error'

/** A friction finding DERIVED server-side from funnel aggregates. Never sent by a client. */
export const FRICTION_EVENT = '$friction'

/**
 * True for any engine-reserved event name.
 *
 * Callers use this to decide whether an event needs grouping. It is deliberately an allow-list of
 * two rather than a `startsWith('$')` test: a future `$`-prefixed name should have to be added here
 * consciously, so nothing starts grouping by accident because someone chose a clever event name.
 */
export function isReservedSignalEvent(event: string): boolean {
  return event === ERROR_EVENT || event === FRICTION_EVENT
}
