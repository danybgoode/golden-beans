import { createHash } from 'node:crypto'

// pod-report · Sprint 3, Story 3.1 — the one hash for every credential in the api_keys table.
//
// ── Why this is its own module ────────────────────────────────────────────────────────────────
// Ingest keys (lib/api-keys.ts) and share tokens (lib/report-shares.ts) are stored in ONE
// `key_hash` column under ONE UNIQUE index (migration 20260803100000). If the two modules each
// carried their own `createHash('sha256')…` line, they would be equal by coincidence and stay equal
// only for as long as nobody edited one of them — and the failure would be silent: two genuinely
// different secrets producing hashes the index treats as unrelated, while the application treats
// the column as a single namespace.
//
// Writing a test that asserts the two are equal was the first attempt, and it could not be done:
// lib/api-keys.ts imports 'server-only', so a unit test that imports it dies on load
// (Roadmap/LEARNINGS.md — a pure helper cannot share a file with a runtime-only import). That
// obstacle is a useful signal, not an inconvenience. Sharing ONE function is better than testing
// that two functions agree: there is nothing left to drift.
//
// Zero imports beyond node:crypto, so both server-only callers and a plain unit test can load it.

/** sha256, hex. The stored form of every credential in `api_keys.key_hash`. */
export function hashCredential(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}
