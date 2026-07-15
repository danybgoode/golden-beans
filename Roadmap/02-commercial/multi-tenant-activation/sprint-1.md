# Multi-tenant activation — Sprint 1: The account boundary (auth hardening core)

**Status:** ⬜ not started

## Stories

### Story 1.1 — Supabase Auth + membership + authed `/app` shell
**As a** tenant user, **I want** to sign in (Supabase Auth: email+password with email confirm;
magic link ok) and see only my projects, **so that** my data has a front door.
Ships: Supabase Auth wiring (`@supabase/ssr` session handling per current docs — re-verify at
build time), additive `project_members` migration (user_id · project_id · role), authed `/app`
shell listing the user's projects; Miyagi + demo memberships hand-seeded.
**Acceptance:** unauthed `/app` → login; a signed-in member sees exactly their own project(s);
session expiry behaves (one spec); RLS-on/no-policies on the new table.
**Risk:** HIGH — Daniel merges (auth + DB migration)

### Story 1.2 — Dashboards behind per-tenant authorization
**As a** tenant, **I want** the funnel/impact/experiments pages behind that boundary, **so that**
slug-guessing dies. Dashboards move under `/app`, resolving the project via membership — never
from the URL alone. E1's public live-proof stays working via an explicit demo-project allow-list.
**Acceptance:** a non-member requesting a **real** foreign projectSlug (use Miyagi's — the
least-convenient input, per the S4 LEARNINGS lesson) → 403/404; the demo project still renders
anonymously; old anonymous paths are gone or redirect.
**Risk:** HIGH — Daniel merges

### Story 1.3 — API keys as a lifecycle
**As a** tenant, **I want** API keys as first-class rows (label · created · revoked_at) with
issue/rotate/revoke in the dashboard, **so that** a leaked key is a row-delete, not a migration.
Additive `api_keys` table; `resolveProjectFromAuthHeader` reads it; existing
`projects.api_key_hash` values migrate in as each project's first key row (expand-only — the old
column retires in a later sweep); E1 connector tokens fold into the same taxonomy (scoped rows) —
coordinate with E1 story 2.1's shape.
**Acceptance:** revoked key → 401 immediately (no cache window); two active keys overlap during
rotation; Miyagi's existing ingest key keeps working through the migration, spec-verified.
**Risk:** HIGH — Daniel merges (auth + migration)

## Sprint QA
- **api spec(s):** 1.1 → unauthed `/app` redirect + session expiry · 1.2 → cross-tenant 403 with a
  real foreign slug + demo allow-list still anonymous · 1.3 → revoked-key 401 · rotation overlap ·
  legacy-key continuity
- **browser smoke owed:** yes, to Daniel — login → own dashboard; foreign slug → 403 (auth path)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview URL pre-merge · production `https://golden-beans-gamma.vercel.app` post-merge

1. Open `/app` in a private window.
   → You're sent to a login screen, not a dashboard.
2. Sign in with your seeded account. *(auth path — owed to Daniel)*
   → You see your project(s) only; no other tenant listed.
3. Edit the URL to a project slug you don't belong to (use the real Miyagi slug).
   → 403/404 — never data.
4. Open the public landing's live-proof section anonymously.
   → Demo project still renders (allow-list intact).
5. In the dashboard, revoke a test API key, then fire a `curl` `/v1/track` call with it.
   → 401 immediately.

If any step fails, note the step number + what you saw — that's the bug report.
