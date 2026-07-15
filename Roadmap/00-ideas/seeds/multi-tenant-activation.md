---
title: "E2 — Multi-tenant activation: auth hardening, self-serve tenants, pod trials"
slug: multi-tenant-activation
status: scaffolded
area: "02"
type: feature
priority: "#2"
risk: high
epic: "02-commercial/multi-tenant-activation"
build_order: "#2"
updated: 2026-07-15
---

# Scope — E2 Multi-tenant activation (credentials, signup, isolation, the CTA flip)

## Mirror-back
> Turn hand-provisioned tenants into **self-serve**: real human accounts, hardened per-tenant
> isolation, credential lifecycle, and signup that provisions a working tenant instantly — and flip
> the landing hero (§1) + pricing/tenancy (§7) from waitlist to a real signup CTA **in the same
> epic**, per the backfill contract — so pod trials start without Daniel provisioning by hand.
> Groomed single-session (Fable cadence, WoW 2026-07-14); confirmed 2026-07-15.

## Classification
**Feature / Builder** (default — production-grade auth, full DoD), with one Grower-style signal:
acceptance includes the engine dogfooding its own **signup→activated funnel** (visitor → account →
first event ingested), not just "signup works."

## Stage-2.5 bucket: genuinely new, with heavy reuse
No human-account boundary exists anywhere in golden-beans — the dashboards are **anonymous** today
(`apps/web/app/{funnel,impact,experiments}/[projectSlug]` — the impact page's own comment: "no
admin-auth system exists yet"). Not already-possible, not a light enhancement. But the tenancy
substrate shipped in S1 (Decision 8), so the epic is **credentials + accounts + authorization +
signup + the landing flip — no tenancy migration** (new *additive* tables only).

## Decisions locked (Daniel, 2026-07-15 groom session)
1. **Auth provider: Supabase Auth.** Already our stack (the engine owns its Supabase project) — no
   new vendor, RLS-native, users stay in our DB; 50K MAU free, ~$0.00325/MAU after (~16x cheaper
   than Clerk at scale; Clerk's free tier is also 50K since Feb 2026 but DX was the only pull).
2. **Signup shape: instant tenant + credentials**, with guardrails (rate limit + honeypot on
   signup, email confirmation, per-tenant event quota, payload caps). **No payment rail in E2** —
   §7 shows honest tiers (free pilot · pods = "talk to us"); billing is a later epic.
3. **Due-revisit triggers adjudicated: stay + named tripwires** (resolves SCOPE.md panel
   adjudication #5's E2 revisit). Stay on **Vercel + Supabase Postgres**. Tripwires recorded below
   (§ Scale debt); E2 trial scale is nowhere near Vercel's cost cliff or Postgres' write ceiling —
   Miyagi's Vercel exit was prod-scale cost golden-beans doesn't have.
4. **Sequencing: E2 stays #2; no E1↔E3 swap** — no live pods sales conversation needs the report
   first. E3–E6 order stands (E1 build hasn't started, so no build learnings to resequence on).

## Research (verified 2026-07-15, cited)
- **Auth providers:** Supabase Auth free to 50K MAU, ~$0.00325/MAU after (~$187/mo @100K vs Clerk
  ~$1,825); Clerk free tier raised to 50K MAU Feb 2026, $0.02/MAU after; Better Auth free to 25K.
  Sources: [makerkit.dev comparison](https://makerkit.dev/blog/tutorials/better-auth-vs-clerk),
  [merginit.com free-tier comparison](https://merginit.com/blog/13062026-free-auth-identity-providers-comparison),
  [buildmvpfast.com](https://www.buildmvpfast.com/blog/best-auth-providers-2026-clerk-supabase-comparison).
- **Vercel (Pro):** $20/seat + usage; functions bill per-invocation ($0.60/1M) + CPU-hr ($0.128) +
  GB-hr; 1TB bandwidth then $0.15–0.40/GB. Trial-scale ingest is pennies.
  Sources: [vercel.com/pricing](https://vercel.com/pricing), [vercel.com/docs/pricing](https://vercel.com/docs/pricing),
  [deploywise.dev breakdown](https://deploywise.dev/blog/vercel-pricing-explained).
- **Postgres→ClickHouse path matured:** Supabase↔ClickHouse is now a first-class partner path
  (ClickPipes/PeerDB CDC replication + `clickhouse_fdw` pushdown) — the migration story if the
  write/aggregation tripwire fires is well-trodden, another reason not to pre-build.
  Sources: [supabase.com ClickHouse partnership](https://supabase.com/blog/supabase-clickhouse-partnership),
  [ClickPipes Supabase guide](https://clickhouse.com/docs/integrations/clickpipes/postgres/source/supabase),
  [supabase clickhouse_fdw docs](https://supabase.com/docs/guides/database/extensions/wrappers/clickhouse).

## Scale debt — tripwires (Decision 3; replaces the "revisit at E2" marker)
Re-adjudicate (a build-session spike, not a groom) when **any** fires:
- Ingest exceeds **~5M events/mo** or Vercel function spend exceeds **$50/mo** → split `/v1/track`
  into a Cloud Run ingest service behind the same API keys (house pattern: Miyagi FE cutover).
- Funnel/impact aggregation **p95 > 2s** on real tenant data, or events table > ~50M rows →
  ClickHouse via ClickPipes CDC (partner path above).
- New paid infra either way ⇒ Daniel green-lights first (house rule).

## What already exists (reuse, don't rebuild)
| Capability | Where | Reuse for |
|---|---|---|
| Tenant-scoped schema + hashed API-key auth (`projects.api_key_hash`, server-resolved `project_id`, no body override) | `apps/web/lib/auth.ts` + `supabase/migrations/20260713220000_track_events.sql` | The credential model — extend to an `api_keys` table (many keys per project), don't replace |
| RLS-on/no-policies service-role pattern | same migration (mirrors mb `platform_flags`) | All new tables (`project_members`, `api_keys`, quotas/audit) |
| Supabase project + service client | `apps/web/lib/supabase.ts` | Supabase Auth lives in the same project — no new infra |
| Waitlist (emails in own Supabase) + landing section↔epic registry | E1 stories 1.3/1.4 (build pending) | Waitlist→invite conversion; the §1/§7 flip goes through the registry |
| Per-project connector tokens + revocation; install page | E1 story 2.1/2.2 (build pending) | One credential taxonomy: connector tokens and SDK keys both become revocable `api_keys` rows (scoped) |
| Enablement env-gate precedent (`CONNECTOR_ENABLED`, ships dark) | E1 Stage 6b | Same seam shape for `SIGNUP_ENABLED` |
| Signup/anti-abuse guards (rate limit + honeypot + duplicate-safe) | E1 story 1.3 waitlist | Lift for the signup route |
| Engine SDK + TARS funnel | `packages/sdk`, `apps/web/app/funnel` | Dogfood the signup→activated funnel |
| Cross-tenant-403 realistic-input lesson | LEARNINGS → Review quality (S4) | Isolation specs use a *real* foreign projectId, not a made-up one |

**UX heuristics & rails check:** frontend-design heuristics (mb skill) apply to signup/onboarding
UI; design language = `references/design-direction.md` (roastery world) extends to the auth
surfaces; no design-token guard in gb yet (debt already noted at E1, not this epic).

**Dependency:** builds after E1 (needs waitlist, install page, section registry, connector
tokens). Grooming now, building when E1 lands — if E1 slips, only Sprint 3 (the flip) re-scopes.

## v1 boundary
**In:** Supabase Auth (email+confirm; magic link ok) · `project_members` (user↔project, role) ·
dashboards moved behind auth with per-tenant authorization (anonymous slug-guessing dies) ·
`api_keys` table: issue/label/rotate/revoke per project from the dashboard (existing single-hash
keys migrated in additively) · self-serve signup → instant project + first key + onboarding
(copy MCP URL / SDK snippet) · guardrails (signup rate-limit + honeypot + email confirm; per-tenant
event quota; payload caps) · credential-action audit trail · waitlist→invite conversion · landing
§1 hero CTA flip (waitlist → "Start free") + §7 honest tiers · dogfooded signup funnel ·
`SIGNUP_ENABLED` dark-launch gate.
**Out (named, not creep):** billing/payment rail + real pricing enforcement · orgs/teams beyond
one-role membership (invite-your-PM = share membership, not an org model) · SSO/SAML · self-serve
tenant deletion/export · flag-serving (E5a) · pod report content (E3) · Cloud Run/ClickHouse moves
(tripwired above) · connector *write* tools · password-complexity/enterprise policies.

## Slicing (skateboard → car) — 3 sprints, ~3 stories each

### Sprint 1 — The account boundary (auth hardening core)
| Story | Ships | Risk |
|---|---|---|
| 1.1 As a tenant user I want to sign in (Supabase Auth: email+password, email confirm) and see only my projects, so my data has a front door. Ships `project_members` + authed `/app` shell; Miyagi + demo memberships hand-seeded. Acceptance: unauthed `/app` → login; member sees own project only. | auth wiring + membership | **HIGH — Daniel merges** (auth + DB migration) |
| 1.2 As a tenant I want the funnel/impact/experiments pages behind that boundary, so slug-guessing dies. Dashboards move under `/app`, resolve project via membership; public demo-project routes (E1 live-proof) stay explicitly allow-listed. Acceptance: non-member on a real foreign projectSlug (use Miyagi's) → 403/404; demo still renders anonymously. | dashboard authorization | **HIGH — Daniel merges** |
| 1.3 As a tenant I want API keys as first-class rows (label · created · revoked) with issue/rotate/revoke in the dashboard, so a leaked key is a row-delete, not a migration. Additive `api_keys` table; `resolveProjectFromAuthHeader` reads it; existing project hashes migrated in. Acceptance: revoked key → 401 immediately; two active keys overlap during rotation. | credential lifecycle | **HIGH — Daniel merges** (auth + migration) |

### Sprint 2 — Self-serve activation
| Story | Ships | Risk |
|---|---|---|
| 2.1 As a prospect I want signup to provision a working tenant instantly (project + first API key + membership), so I can trial without waiting. Guardrails: rate-limit + honeypot (lift E1 waitlist), email confirm before provisioning, `SIGNUP_ENABLED` gate (dark). Acceptance: confirmed signup → tenant + key; gate OFF → route 404s and hero shows waitlist. | signup → provisioning | **HIGH — Daniel merges** |
| 2.2 As the operator I want isolation guardrails (per-tenant event quota, payload caps, per-key ingest rate limit) + an audit trail of credential/signup actions, so open signup can't hurt paying-attention tenants or the bill. Acceptance: over-quota → 429 with clear body; audit rows for issue/revoke/signup. | abuse hardening + audit | **HIGH — Daniel merges** (shared ingest path) |
| 2.3 As a new tenant I want first-run onboarding — copy-your-MCP-URL ("Add to Claude") + ≤5-line SDK snippet with *my* key — so time-to-first-event is minutes. Reuses E1 install page per-tenant. Acceptance: fresh signup reaches first ingested event following only on-screen steps. | onboarding | LOW |

### Sprint 3 — The flip (landing backfill + trials live)
| Story | Ships | Risk |
|---|---|---|
| 3.1 As a visitor I want the hero CTA flipped waitlist → "Start free" and §7 showing honest tenancy tiers (free pilot · pods = talk to us; no fake pricing), so the public offer matches reality. Via E1's section registry; renders only when `SIGNUP_ENABLED`. Acceptance: gate ON → signup CTA; OFF → waitlist unchanged. | §1 + §7 backfill | LOW (public content, gated) |
| 3.2 As a waitlisted prospect I want an invite to activate, so E1's queue converts. Acceptance: invite → signup → tenant; duplicate-safe against existing accounts. | waitlist conversion | LOW |
| 3.3 As Daniel I want the activation launch: flip `SIGNUP_ENABLED`, seed the dogfood funnel (`signup_started → account_confirmed → first_event_ingested` tracked in the engine itself), run the trial checklist end-to-end, announce. Acceptance: flip recorded; funnel renders real activations; one pod-trial tenant activated self-serve. | launch + dogfood | **HIGH — Daniel flips/merges** |

## Stage 6b — kill-switch decision (`risk: high`)
Runtime seam exists → **enablement (dark-launch) gate, recommended as part of story 2.1**:
- **Gate:** `SIGNUP_ENABLED` env check at the signup route + the landing CTA registry (gb has no
  flag service by design — Decision 1 of v1; env gate + redeploy is the honest seam, precedent E1's
  `CONNECTOR_ENABLED`). **Polarity:** enablement — ships dark/**OFF**, flipped deliberately at 3.3.
- **Fine-grained kill:** revoking an `api_keys` row (or membership) cuts a tenant instantly, no
  deploy — story 1.3 makes this real for every credential, not just connector tokens.
- **Carve-out (auth boundary itself):** the login/authorization layer of 1.1/1.2 cannot sit behind
  a runtime flag — it *is* the fix for an open hole; rollback = revert on `main`. Reversible
  because migrations are additive (expand-only; no destructive change to `projects`/`events`).

## QA / smoke (Stage 8b owners)
Per story one Playwright api spec: cross-tenant 403 with a **real** foreign projectSlug (S4
lesson) · revoked-key 401 · signup validation/rate-limit/gate-OFF 404 · over-quota 429 · invite
duplicate-safety. Sprint-end fool-proof walkthroughs in each `sprint-N.md`, real URLs. **Owed to
Daniel by name:** S1 auth smoke (login → own dashboard; foreign slug → 403) · S2 full self-serve
smoke in a fresh browser (signup → confirm email → copy key → first event → funnel renders) · S3
production flip + one real pod-trial activation.

## Open risks
- **Open-signup abuse** (disposable emails, event spam): quotas + confirm + rate limits in 2.1/2.2;
  the gate stays flippable-OFF; watch the Supabase/Vercel bill during trials (tripwires above).
- **Credential taxonomy drift:** E1's connector tokens vs SDK keys must land as one `api_keys`
  model (scoped rows), not two systems — 1.3 owns this; coordinate with E1's 2.1 if it builds first.
- **E1 dependency:** Sprint 3 (and 2.3's install-page reuse) assume E1 shipped; if E1 slips,
  Sprints 1–2 still stand alone.
- **Supabase Auth + SSR session handling** (`@supabase/ssr` middleware/cookie pitfalls): follow
  current docs at build time, one spec on session expiry behavior.
- **Public demo allow-list regression:** moving dashboards behind auth must not break E1's
  anonymous live-proof — explicit allow-list, spec'd (1.2).

## Definition of Ready
- [x] Mirror-back confirmed; 4 forks decided by Daniel (2026-07-15: auth provider · signup shape ·
      scale-debt adjudication · sequencing).
- [x] Stage-2.5 bucket named (genuinely new — no human-auth boundary exists); overlap checked
      (S1 tenancy substrate + E1 guards reused, not rebuilt).
- [x] Reuse list produced (code read: `auth.ts`, migrations, dashboard routes); research cited
      (auth pricing · Vercel pricing · Supabase↔ClickHouse path, all verified 2026-07-15).
- [x] v1 in/out boundary written; scale-debt revisit resolved with named tripwires.
- [x] Stories risk-tiered (6 HIGH — Daniel merges all of Sprints 1–2 + 3.3); QA stage + smoke
      owners named.
- [x] Kill-switch decision recorded (`SIGNUP_ENABLED` enablement gate, ships OFF; per-key
      revocation as fine-grained kill; auth-boundary carve-out).
- [x] **Daniel approved this scope doc (2026-07-15)** — cross-panel offered and declined →
      scaffolded `02-commercial/multi-tenant-activation/` (sprints 1–3), kickoffs emitted. Builds
      after E1 per the dependency note.
