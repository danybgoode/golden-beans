// multi-tenant-activation · Sprint 1, Story 1.1 — the open-redirect guard for auth callbacks.
//
// Deliberately ZERO-IMPORT (no `server-only`, no next/*, no getSiteUrl) — the base URL is passed in
// rather than read from the environment. Two reasons, both from Roadmap/LEARNINGS.md:
//   1. A unit-testable pure helper must not share a file with framework/runtime-only imports, or a
//      plain test runner throws an opaque unrelated error just importing it.
//   2. The e2e suite can then assert this logic DIRECTLY, which matters here: the route only
//      consults `next` after a successful code exchange, so an HTTP-level spec cannot reach this
//      branch at all — an earlier version of that spec passed against a deliberately vulnerable
//      build (a false-positive tautology, caught by a mutation check, 2026-07-20).
//
// The guard itself: resolve FIRST, then compare origins. A prefix check on the raw string is not
// enough — cross-review (Codex, 2026-07-20) showed `/\evil.example` passes
// `startsWith('/') && !startsWith('//')` while `new URL()` normalizes the backslash into `//` and
// resolves off-origin. Origin comparison is the only check that can't be smuggled past.
export function safeRedirectPath(nextParam: string | null, baseUrl: string, fallbackPath = '/app'): string {
  const fallback = new URL(fallbackPath, baseUrl).toString()
  if (!nextParam) return fallback
  try {
    const resolved = new URL(nextParam, baseUrl)
    return resolved.origin === new URL(baseUrl).origin ? resolved.toString() : fallback
  } catch {
    return fallback
  }
}
