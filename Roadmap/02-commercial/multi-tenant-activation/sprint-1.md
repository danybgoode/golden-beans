# Multi-tenant activation — Sprint 1: The account boundary (auth hardening core)

**Status:** ✅ **MERGED + LIVE IN PRODUCTION** (2026-07-21) — PR #13 squash-merged as `e032867`,
deployed to `https://golden-beans-gamma.vercel.app`. All 3 stories; deterministic gate green
(tsc + build + Playwright `api`, **107 passed**). Commits: 1.1 `a33a316`, 1.2 `1c7ef9d`,
1.3 `401c39b`; review fixes `77350bc` (round 1) + `151b025` (round 2).

### Production rollout — executed in the required order
1. **Vercel envs first** — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (prod, the
   legacy `anon` JWT format — the same format local/CI validated against, avoiding the
   `sb_secret`-vs-JWT confusion LEARNINGS records). Verified by **value length** via `env pull`, not
   exit code; the pulled file was shredded immediately.
2. **Migrations before code** — `supabase db push` applied `20260720120000_project_members` +
   `20260720130000_api_keys` (dry-run first; `--include-seed` is off by default, so the local test
   fixtures in `seed.sql` never touched prod). **Backfill verified: all 3 tenants
   (`miyagisanchez`, `golden-beans-demo`, `golden-beans`) have exactly 1 active key.** RLS on for
   both new tables.
3. **Merged → deployed** — production deployment `e032867` succeeded.
4. **Auth redirect allow-list — correctly a NO-OP for Sprint 1.** The only auth call is
   `signInWithPassword` (no `emailRedirectTo`, no `signUp`), which sets cookies directly and never
   round-trips through Supabase. This becomes required in Sprint 2 when signup lands.
5. **Auth account + membership — done (2026-07-21).** Daniel created his account in the Supabase
   Dashboard (`daniel@despachobonsai.com`, auto-confirmed — Sprint 1 is sign-in-only, so there is no
   self-serve path yet), and `project_members` was seeded with `role='owner'` for all three tenants
   (`golden-beans`, `golden-beans-demo`, `miyagisanchez`). Verified the prod auth endpoint accepts
   the deployed anon key and resolves the user (a deliberate wrong-password attempt returns
   `invalid_credentials`, not an apikey error — so the whole chain up to the password check is
   proven). *Note: `supabase db query --linked` must be run from `apps/web/` — the link is
   per-directory, and running it from the repo root fails with "project wasn't linked".*

### Post-deploy production smoke (all green)
| Check | Result |
|---|---|
| unauthed `/app` | 307 → `/login` |
| unauthed `/app/funnel/miyagisanchez/setup_guide` (real foreign slug) | 307 → `/login` |
| `/login` renders | 200 |
| public demo read route (allow-list intact) | 200 |
| invalid API key → **401, not 500** | 401 *(proves `api_keys` resolves in prod)* |
| **a real backfilled key authorizes** — `/api/v1/public/self-visit` → `landing_visited` landed in the self tenant | ✅ *(the migration did not break live ingest; synthetic event cleaned up after)* |
| MCP connector `tools/list` · `/install` · `/llms.txt` (prior epic) | 200 · 200 · 200 |
| `NEXT_PUBLIC_*` inlined into the deployed client bundle | ✅ verified in `app/login/page-*.js` |

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

**Owed to Daniel — the browser smoke only.** Everything else is done: the account exists, membership
is seeded as `owner` on all three tenants, and the full rollout is verified in production.

Run the walkthrough below at `https://golden-beans-gamma.vercel.app/login`. An automated `api` run
can't hold a real auth session, which is the whole reason this stays owed. The two assertions no
automated check has covered:
- a **signed-in** non-member on a foreign slug → **404** (unauthed is spec-covered; signed-in isn't);
- a **`member`** (not owner) on `/app/keys/<slug>` → **404**. *Daniel is `owner` everywhere, so
  exercising this needs a second, deliberately-`member` row — optional, and the `isOwner` predicate
  is unit-covered either way.*

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

## Sprint QA — as built
- **api specs (107 passing):** `app-auth.spec` → unauthed `/app` + foreign-slug dashboards + key
  mgmt all bounce to `/login` (using the **real** `miyagisanchez` slug, per the S4
  least-convenient-input lesson) · demo dashboard still anonymous · `safeRedirectPath` open-redirect
  guard (6 hostile inputs) · `isOwner` fails closed. `api-keys.spec` → legacy/backfilled key still
  authorizes · revoked key → 401 immediately · rotation overlap. Existing funnel/impact/experiments
  specs kept their JSON-endpoint data coverage, page assertions updated to the gated reality.
- **Deviation from the plan, deliberate:** the plan said non-member → "403/404"; as built it is
  **404, never 403** — a 403 confirms the project exists. Slug-guessing gets no oracle at all.
- **Not built here (moved, not dropped):** self-serve **sign-up** — cross-review flagged it was
  reachable ahead of its born-OFF `SIGNUP_ENABLED` gate, and it belongs to Story 2.1. Sprint 1 is
  **sign-in only**; accounts + memberships are hand-seeded.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` — green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview URL pre-merge · production `https://golden-beans-gamma.vercel.app` post-merge.
**Prerequisite:** the PR's *ordering kit* is done — migrations applied to prod Supabase **before**
the code deploys, `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set in Vercel, Supabase Auth redirect URLs
include `/auth/callback`, and your membership row seeded **as `owner`**.

1. Open `/app` in a private window.
   → You're sent to `/login`, not a dashboard.
2. Sign in with your seeded account. *(auth path — owed to Daniel)*
   → You see your project(s) only, with links to Funnel / Impact / API keys; no other tenant listed.
3. Still signed in, edit the URL to a project slug you don't belong to (use the real Miyagi slug).
   → **404** — never data, and never a 403 (a 403 would confirm the project exists).
4. Still signed in, open `/app/keys/<a project you're only a `member` of>`.
   → **404** — credential admin is owner-only. *(Skip if you're `owner` everywhere.)*
5. On your own project's `/app/keys/<slug>`, click **Issue key**.
   → The plaintext is shown **once**, with a "copy it now" warning; the row appears as `active`.
6. `curl` `/api/v1/track` with that new key:
   `curl -i -X POST <base>/api/v1/track -H "Authorization: Bearer <new-key>" -H 'Content-Type: application/json' -d '{"userId":"smoke","event":"smoke_event"}'`
   → **201**.
7. Revoke that key in the dashboard, then re-run the exact same `curl`.
   → **401**, immediately — no deploy, no cache window.
8. Confirm the **pre-existing** ingest key still works (the backfill did its job) — re-run step 6
   with the key production was already using.
   → **201**. *(This is the one that proves nothing broke for live tenants.)*
9. Open the public landing's live-proof section anonymously (private window, signed out).
   → Demo project still renders — the allow-list carve-out survived the auth boundary.
10. Sign out from `/app`.
   → You land on `/login`, and re-opening `/app` sends you back to `/login` (session really gone).

If any step fails, note the step number + what you saw — that's the bug report.
