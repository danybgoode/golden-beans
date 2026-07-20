# Commercial shell — Sprint 3: Launch & dogfood

**Status:** 🟨 In progress — branch `feat/commercial-shell-sprint-3`

## Stories

### Story 3.1 — Dogfood instrumentation ✅
**As the** team, **I want** the landing instrumented by the engine itself (`golden-beans` as its
own tenant: visitor → waitlist TARS funnel via the real SDK), **so that** we sell what we use and
the epic's Grower signal is measurable.
**Acceptance:** a real visitor→waitlist funnel renders in the engine; the Grower signal (waitlist
conversion rate) is defined in the registry; landing traffic never mixes into the demo or Miyagi
projects.
**Risk:** LOW
**Build note:** the landing now dogfoods the engine as a THIRD tenant (`golden-beans`, separate
from `golden-beans-demo` and Miyagi), through the real `@golden-beans/sdk` — no parallel pipeline
(AGENTS.md rule #1). New `lib/self-track.ts` wraps `createGrowthEngineClient` (baseUrl `getSiteUrl()`,
key from `SELF_PROJECT_API_KEY`); it is **total** — no key ⇒ clean no-op, SDK errors swallowed+logged,
never throws into the request path or blocks the response (CI's `typecheck-build` runs with zero
Supabase env). Funnel identity is a `gb_vid` visitor cookie: since a Server Component can't set
cookies, the entry event fires from a new Route Handler `POST /api/v1/public/self-visit` (mints the
cookie, fires `landing_visited`), driven by an invisible client beacon `SelfTrackBeacon` on `/`; the
conversion `waitlist_joined` is fired from the existing waitlist route's **successful, non-honeypot**
insert path under the SAME cookie (the honeypot's silent-success returns before it, so a bot never
counts). Grower signal registered via a real `POST /api/v1/features/sync`: `waitlist_conversion`
(`landing_visited` → `waitlist_joined`) by new idempotent `scripts/seed-self-project.mjs`
(`npm run seed:self`), sibling to the demo seeder — project row = direct upsert, signal = real API;
it refuses to run if `SELF_PROJECT_SLUG === DEMO_PROJECT_SLUG`. Isolation is structural (tenant
resolved from the Bearer key server-side, never a slug/body field) and asserted in
`e2e/self-track.spec.ts`. Env vars for prod (owed to the integrating session): **`SELF_PROJECT_SLUG`**
(optional, default `golden-beans`) and **`SELF_PROJECT_API_KEY`** (from the seed script's printout).
**Verify gap:** `tsc --noEmit` + `npm run build` clean; the Playwright `api` project (incl. this
spec) could NOT be run here — Docker/local Supabase was unavailable in the worktree — so the e2e
gate + a real red run are owed; the spec's mutation check (removing self-track's no-op guard ⇒ 500s
⇒ first two tests red) is reasoned, not observed. Commit `c029622`.

### Story 3.2 — SEO/OG + agent-readable manifest
**As a** searcher (human or agent), **I want** correct meta/OG unfurls and an `llms.txt`-style
manifest listing the public routes and connector docs, **so that** both audiences parse the offer.
**Acceptance:** link unfurls with a correct card in a chat app; manifest served and accurate.
**Risk:** LOW

### Story 3.3 — Launch checklist
**As** Daniel, **I want** the launch executed: domain decision (**paid infra ⇒ Daniel green-lights
before provisioning; staying on `golden-beans-gamma.vercel.app` is a valid v1 outcome**),
`CONNECTOR_ENABLED` flipped ON in production (the deliberate enablement flip), waitlist live,
announce.
**Acceptance:** checklist executed and recorded in this doc; flip time-stamped; landing sections
match shipped reality (backfill check).
**Risk:** **HIGH — Daniel merges/flips.** The flip and any domain purchase are named
product-owner actions (LEARNINGS: broad wrap-up authorization never covers deploy/credential/paid
actions — each is opted into by name).

## Sprint QA
- **api spec(s):** 3.1 → landing events land in the gb tenant (and only there) · 3.2 → manifest
  route contents
- **browser smoke owed:** yes, to Daniel — production waitlist submission + unfurl check +
  post-flip connector round-trip
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · `https://golden-beans-gamma.vercel.app` (or the custom domain if 3.3 decides one)

1. Visit the landing in a private window, then join the waitlist with a disposable email.
   → Confirmation state.
2. Open the engine's funnel view for the `golden-beans` tenant.
   → Your visit and signup appear in the visitor→waitlist funnel.
3. Paste the landing URL into a chat app.
   → OG card unfurls with Golden Beans branding.
4. **(flip — Daniel)** After `CONNECTOR_ENABLED` is ON: run the story 2.1 connector round-trip
   against production.
   → Works; token revocation still kills instantly.

If any step fails, note the step number + what you saw — that's the bug report.
