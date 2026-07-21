# Multi-tenant activation — Sprint 1: The account boundary (auth hardening core)

**Status:** 🟦 In review — PR #13. All 3 stories built; deterministic gate green (tsc + build +
Playwright `api`, **105 passed**). Commits: 1.1 `a33a316`, 1.2 `1c7ef9d`, 1.3 `401c39b`, review
fixes `77350bc`.

**Cross-review (round 1):** Codex found **4 Blocking** — an open redirect in `/auth/callback`
(`/\evil.example` defeats a naive prefix check; `new URL()` normalizes the backslash), a rule-#5
`window.location.origin` violation, sign-up reachable before its born-OFF `SIGNUP_ENABLED` gate, and
a seed-script key **cross-bind** (an `ignoreDuplicates` upsert silently succeeded when a key hash
belonged to another project, handing back a key that authenticated as *that* tenant). Gemini/Agy
found no Blocking and independently flagged the same hydration bug. All fixed in `77350bc`; the
signup finding was resolved by making Sprint 1 **sign-in only** (signup belongs to Story 2.1, dark).

**A spec-quality lesson worth promoting:** the first open-redirect spec asserted over HTTP and
**passed against a deliberately vulnerable build** — the route only reads `next` after a successful
code exchange, so the branch was unreachable to an unauthenticated request. The mutation check
caught it, not the review. Rewritten to assert the guard as a pure function
(`lib/safe-redirect.ts`, the `lib/flags.ts` precedent); re-mutating now correctly turns 3 specs red.

**Cross-review (round 2, on the round-1 fixes):** Codex found **2 more Blocking** — credential admin
was open to *any* member (`project_members.role` existed but nothing enforced it, so a member could
mint or revoke production ingest keys → now **owner-only**), and the migration's backfill still had
the bare `ON CONFLICT DO NOTHING` cross-project bind that the seed scripts had already been hardened
against (→ now aborts loudly; verified by simulating a real cross-project bind). Gemini found no
Blocking and confirmed the round-1 fixes ("open-redirect protection cleanly avoids common URL
parsing traps", "authorization gates properly fail-closed"), plus real UX gaps (the `/app` shell had
no links to the dashboards). Fixed in `151b025`.

**Owed to Daniel:** (1) the authed-session browser smoke — sign in → own dashboard; a *signed-in*
non-member on a foreign slug → 404; a *member* (not owner) on `/app/keys/<slug>` → 404; (2) the prod
migration-before-deploy ordering + Supabase Auth redirect config + a seeded membership row — **seed
yourself as `owner`**, not `member`, or the API-keys page 404s (all in the PR's ordering kit; the
migration MUST land before the code deploys, or ingest 500s).

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
