# Multi-tenant activation — auth hardening, self-serve tenants, pod trials — Retrospective

_Sprints 1–3 built and merged: 2026-07-21. **Not yet launched** — Story 3.3 (`SIGNUP_ENABLED` flip
in production) is Daniel's, and until it happens every signup-facing surface 404s by design._

## What shipped

**Sprint 1 — the account boundary** (PR #13 → `e032867`, live in production since 2026-07-21).
Supabase Auth via `@supabase/ssr`, `project_members`, dashboards behind per-tenant authorization
(non-member → 404, never 403, so slug-guessing gets no existence oracle; the public demo still
renders anonymously through the canonical allow-list seam), and `api_keys` as a revocable
lifecycle with every existing tenant's live key migrated in. Credential admin is owner-only.

**Sprint 2 — self-serve activation** (PR #14). A confirmed signup provisions a complete working
tenant with no human in the loop: project, owner membership, first API key, connector token, and a
starter feature so the new tenant's funnel has shape the moment their first event lands. The shared
ingest path grew three independent bounds — a payload cap enforced on the stream, a per-**key**
rate limit, and a per-**project** monthly quota — all configurable as data on the project row, so
raising a real customer's ceiling is an `UPDATE` and never a deploy. Credential and provisioning
actions land in an append-only `audit_log`.

**Sprint 3 — the flip, prepared** (PR #14). The landing's §1 hero and §7 pricing/tenancy flip from
waitlist to a real "Start free" CTA and honest tiers (free pilot · pods = talk to us; no invented
prices, because there is no payment rail). Story 3.2 was **re-scoped** from "waitlist → invite
conversion" to "waitlist retirement" — the queue had 0 rows in production and the product has never
been promoted, so the original story would have shipped a converter with nothing to convert.
Story 3.3 is the production flip, owed to Daniel.

Everything customer-facing is gated on `SIGNUP_ENABLED`, born unset/OFF, checked in **four** places.

## What went well

- **The kill-switch discipline paid for itself.** Because every signup surface is gated and the gate
  is read fresh per request, the entire epic could merge to production with zero customer-visible
  change, and the launch is a single env var with no redeploy. It also made the rollback story
  trivial to state honestly — including for confirmation links already sitting in inboxes.
- **Reusing the atomic rate-limit counter for the monthly quota** avoided both a second counter
  table and a `COUNT(*)`-per-ingest that would get slower exactly as a tenant got more valuable.
- **Extracting pure modules early** (`tenant-slug.ts`, `quota-window.ts`, on the `flags.ts` /
  `roles.ts` / `safe-redirect.ts` precedent) is what made the security-critical logic assertable at
  all — the gate is OFF in CI, so an HTTP-level spec can only ever reach the 404.
- **Delegating the UI slices to a faster model while keeping auth/DB work in-house** was the right
  split. Both delegated slices came back type-clean and idiom-matching, and one of them surfaced a
  real acceptance gap (a new tenant's funnel would render empty) that became a proper fix.

## What we learned

1. **A comment asserting a check the code doesn't perform is worse than no comment — and it can
   survive a review round.** The round-1 race fix claimed to distinguish two unique constraints by
   name; it actually just re-read membership, which is empty during exactly the window the race
   opens. Round 2 caught it. Prose in a diff reads as evidence, so reviewers spend scrutiny
   elsewhere.
2. **A silently-required tag produces an honest-looking zero, and zeros don't page anyone.** The
   third recurrence of this shape in this repo (after growth-engine-v1 S4's A/B bug). Here it was
   already live: `trackSelfEvent` never set `featureId`, `tars-query` filters on it, and the landing
   dogfood funnel shipped in commercial-shell S3 had been reading zero since launch while ingesting
   events perfectly.
3. **"Raise the ceiling" as a documented remedy has to be tested after SUSTAINED abuse, not one
   rejection.** The quota counter incremented before comparing, so rejected calls inflated it and
   the only documented fix silently failed to restore service. The original spec raised the ceiling
   after a single rejection — which the bug survived.
4. **A narrower `GRANT` revokes nothing.** Supabase's default privileges already grant `service_role`
   ALL on new public-schema tables, so `GRANT SELECT, INSERT` is purely additive. The append-only
   claim was false until an explicit `REVOKE` — caught only because a spec attempted the mutation
   with the app's own client rather than trusting the grant statement to mean what it looked like.
5. **Fixing a finding by adding a mode is a smell; fixing it by moving the code is usually right.**
   The round-1 retry lived in a Server Component, which can't set cookies, which forced a
   "provision without a key" mode, which silently skipped the starter feature too. Moving the retry
   into a Route Handler deleted the mode and its whole family of consequences.
6. **Three review rounds were not two rounds of ceremony plus one.** Round 1 found 4 Blocking,
   round 2 found 5 more (one of them a bug round 1's fix introduced), round 3 found 3 more. The
   curve was still not flat at round 3 for auth/DB/shared-ingest work.

## Gaps / follow-ups

**Owed to Daniel — the launch (Story 3.3):**
1. **Supabase Auth redirect allow-list must include the prod `/auth/callback`** before the flip.
   Sprint 1 never needed it (`signInWithPassword` sets cookies directly); signup's confirmation link
   is the first flow that leaves and comes back. **Confirmations will bounce without this.**
2. `supabase db push` **before** the deploy — `lib/auth.ts` reads the new `projects` columns.
3. Set `SIGNUP_ENABLED=true` in the Vercel production env. **No redeploy** (rule #4).
4. Run the `sprint-2.md` and `sprint-3.md` smoke walkthroughs — the real signup flow has **never
   been exercised end-to-end**, because it needs a real inbox and the gate on. This is the largest
   honest gap in the epic.
5. Re-seed the self tenant (`npm run seed:self`) so the new `activation` signal is registered in
   production — without it the Story 3.3 activation funnel has nothing to render into.

**Known limitation, written up in `sprint-2.md`:** the Supabase anon key is public, so an account
can be created by calling Supabase Auth directly, bypassing our gate/honeypot/rate limit. The
epic's actual promise holds — the gate is re-checked server-side before provisioning, so while it
is off a bypassing signup gets an inert `auth.users` row and no tenant — but closing the bypass
properly is a Supabase Dashboard change (disable public signups, or set Auth's own rate limits).

**Deliberately not built:** an owner inviting a *teammate* into an existing project.
`project_members` still only grows by hand-seeded SQL or by self-serve signup (which makes you the
owner of your own new project). Real missing capability, but team management rather than activation
— worth a seed rather than smuggling into this epic.

**Production data note:** the landing funnel's historical events (4 `landing_visited` rows on the
`golden-beans` tenant) carry `feature_id = NULL` and will never appear in the funnel. The fix is
forward-only; those rows can be backfilled with an `UPDATE` if the history matters.
