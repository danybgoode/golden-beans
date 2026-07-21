// multi-tenant-activation · Sprint 2, Story 2.2 — the PURE half of the ingest guardrails.
//
// Deliberately ZERO-IMPORT (no `server-only`, no DB client) — the rule lib/flags.ts, lib/roles.ts,
// lib/safe-redirect.ts and lib/tenant-slug.ts all follow (Roadmap/LEARNINGS.md): a helper a spec
// must assert directly cannot share a file with a runtime-only import, or the test runner throws
// `Cannot find module 'server-only'` just importing it. lib/quota.ts holds the DB-touching half
// and imports from here.
//
// This split is load-bearing rather than tidy: the month-window maths below is where the one real
// bug in this story was written (flooring `Date.now()` by "milliseconds in this month", which
// lands on an arbitrary multiple of that duration since the Unix epoch instead of on the 1st), and
// an HTTP-level spec could never have seen it — the counter still counts, just against the wrong
// bucket, so every quota would reset on a wandering date matching no calendar.

/** Bytes. A legitimate event is a few hundred bytes; the SDK's largest realistic payload (a
 *  metadata-heavy track call) is comfortably under 8 KB. 64 KB leaves a wide margin for an
 *  unusual-but-honest caller while making the ingest route useless as a blob store. Checked
 *  BEFORE JSON.parse — parsing a 50 MB body to discover it is too big is the bug this prevents. */
export const MAX_TRACK_PAYLOAD_BYTES = 64 * 1024

/** Midnight UTC on the 1st of `now`'s month — the quota's fixed window. */
export function monthWindowStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** The instant the window rolls over — i.e. when the tenant's quota resets. Month 12 normalizes
 *  into the next January, so December needs no special case. */
export function monthWindowEnd(windowStart: Date): Date {
  return new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 1))
}
