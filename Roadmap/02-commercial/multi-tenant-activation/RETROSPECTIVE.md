# Multi-tenant activation — auth hardening, self-serve tenants, pod trials — Retrospective

_Closed 2026-07-21. **Launched**: the gate is flipped, the Supabase redirect allow-list is
configured, and a real user has signed up and received a working tenant in production without
anyone touching the database._

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

**Sprint 3 — the flip, done** (PR #14 → `bbaffd2`). The landing's §1 hero and §7 pricing/tenancy flip from
waitlist to a real "Start free" CTA and honest tiers (free pilot · pods = talk to us; no invented
prices, because there is no payment rail). Story 3.2 was **re-scoped** from "waitlist → invite
conversion" to "waitlist retirement" — the queue had 0 rows in production and the product has never
been promoted, so the original story would have shipped a converter with nothing to convert.
Story 3.3 flipped `SIGNUP_ENABLED=true` in production on 2026-07-21.

Everything customer-facing is gated on `SIGNUP_ENABLED`, born unset/OFF, checked in **four** places.

## The launch, and what was actually verified

Rollout order held: **migration → merge/deploy → env flip**. Each step was confirmed by exercising
behaviour rather than reading a status page — an invalid ingest key returning **401 rather than
500** proved schema and code agreed, and a real pre-existing key still authorizing (driven through
`/api/v1/public/self-visit`, so no credential ever entered a shell) proved the backfill held.

**The first self-serve activation, verified row by row in production:** the `miyagi` tenant has
`created_by` set, exactly 1 owner membership, 1 active API key, 1 connector token, and the
`first_integration` starter feature registered. The activation funnel shows `signup_started →
account_confirmed`, both tagged `activation`, **under the same user id, 39 seconds apart** — a real
email round-trip rather than two disconnected events. `audit_log` holds `signup_requested` then
`tenant_provisioned`, each with an actor.

**One surprise during the launch, now corrected in `AGENTS.md` and `LEARNINGS.md`:** both documents
claimed a Vercel env var takes effect on already-deployed functions with no redeploy. It doesn't —
`SIGNUP_ENABLED` stayed dark for 7+ minutes because Vercel snapshots env vars into a deployment at
build time. "Env var set" and "env var live" are two different facts.

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

**All launch steps are done.** Migration pushed, PR merged and deployed, the `activation` signal
registered on the self tenant (via SQL rather than `seed:self` — a bare re-run skips the sync
because the script no longer holds the plaintext key, and fetching it would mean handling a
production credential), the redirect allow-list configured, the gate flipped, and one real user
activated end-to-end.

**The one remaining gap, stated rather than rounded off:** `first_event_ingested` — the activation
funnel's third stage — has **no real data**. Nobody has pasted the onboarding snippet, and the new
tenant's `first_event_at` is still null. Story 2.3's acceptance ("reaches their first ingested
event following only on-screen steps") is therefore **delivered but not observed**. One paste from
`/app/onboarding/miyagi` closes it, and it is the single cheapest way to finish proving the epic.

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
