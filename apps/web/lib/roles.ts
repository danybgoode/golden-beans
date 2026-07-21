// multi-tenant-activation · Sprint 1 — the role predicate for credential administration.
//
// Deliberately ZERO-IMPORT (no `server-only`, no supabase client) so the e2e suite can assert it
// directly: a pure helper must not share a file with runtime-only imports, or a plain test runner
// throws an opaque unrelated error just importing it (Roadmap/LEARNINGS.md; same reason
// lib/safe-redirect.ts and lib/flags.ts are separate modules).

export type Membership = { projectId: string; role: string }

// Credential administration (issue/revoke API keys) is OWNER-only — least privilege. An ordinary
// member can read their project's dashboards but must not mint a full ingest credential or revoke
// the key production is running on (cross-review round 2, Codex 2026-07-20).
//
// Exact match, and null/unknown roles FAIL CLOSED — this predicate must never default-allow.
export function isOwner(membership: Membership | null): boolean {
  return membership?.role === 'owner'
}
