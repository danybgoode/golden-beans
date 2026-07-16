# Commercial shell — Sprint 1: Launch-ready landing

**Status:** 🟦 In review — [PR #8](https://github.com/danybgoode/golden-beans/pull/8), CI green, self-QA posted

## Stories

### Story 1.1 — Public landing shell + brand v1 ✅
**As a** visitor, **I want** a Golden Beans landing at `/` (hero, section scaffold per the
end-state map, honest 🔜 badges on unlit sections), **so that** the offer is legible in 30 seconds.
**Acceptance:** renders anonymously; mobile-clean (no horizontal overflow); zero client data
anywhere; internal engine pages move under `/app` (or equivalent path-gate) and keep working;
brand v1 follows `references/design-direction.md` (dark-roast panels, kraft/foil accents,
agent-window frame device for the proof section shell) — **and `references/design/` (the Claude
Design export) if present, which supersedes the mock's skin**.
**Risk:** LOW · commit `8f93b17`

### Story 1.2 — Live-proof section on a synthetic demo project ✅
**As a** skeptical PM, **I want** the live-proof section fed by a synthetic demo project seeded
through the real SDK/API, **so that** every number on the page is real engine output.
**Acceptance:** anonymous visitor sees live TARS funnel + North Star + A/B comparison for the demo
project; the public read path can serve **only** the demo project (allow-list at the route —
assert 403 with a real Miyagi projectId, the least-convenient input); reseed is idempotent;
registry-declared-Targeted caveat displayed as a tasting note.
**Risk:** LOW · commit `117d5fd`

### Story 1.3 — Waitlist ✅
**As a** prospect, **I want** to join a waitlist, **so that** I'm queued for a hand-provisioned
pilot. **Acceptance:** email → row in gb's own Supabase; rate-limited + honeypot; duplicate-safe;
confirmation state; no third-party form service.
**Risk:** LOW (public write, guarded) · commit `34e9cb7`

### Story 1.4 — Backfill contract wiring ✅
**As the** team, **I want** the section↔epic registry in the landing code (each section declares
the epic that lights it up, driving the 🔜 badges), **so that** the WAYS-OF-WORKING backfill DoD
line (already merged 2026-07-14) has a mechanical surface to check.
**Acceptance:** registry file maps sections→epics; flipping one entry flips the badge; documented
in the epic README.
**Risk:** LOW · commit `8552e5f`

## Sprint QA
- **api spec(s):** 1.2 → demo-read endpoints (incl. the 403 allow-list assertion) · 1.3 → waitlist
  POST validation/rate-limit/duplicate
- **browser smoke owed:** yes, to Daniel — visual/brand pass on the preview (no money/auth steps)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview URL pre-merge (no per-branch Vercel preview yet — golden-beans' Vercel project isn't
provisioned, per `.github/workflows/ci.yml`'s own header comment; run locally against
`npm run dev`/`npm run start` + `supabase start` until it is) · production
`https://golden-beans-gamma.vercel.app` post-merge, **after** running `npm run seed:demo` against
prod once (owed to Daniel — needs the prod `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`).

1. Run `npm run seed:demo` (server + local Supabase already running).
   → `Seeded demo project 'golden-beans-demo' (<uuid>): 60 targeted / 39 adopted / 16 retained,
   14-day North Star trend, 160 A/B exposures.`
2. Open `/` in a private window.
   → Golden Beans landing renders; hero (waitlist as the primary working CTA, connector shown
   inert/🔜-badged) + live-proof + operate-routes + primitives-grid + footer sections fully live;
   the inverted-loop and pods-proof sections render as dashed-border teasers tagged
   `🔜 LIGHTS UP · signals-loop` / `🔜 LIGHTS UP · pod-report`; pricing section shows the waitlist
   with a `SELF-SERVE · NEXT` tag. No horizontal scroll at mobile widths (verified: `npx playwright
   test --project=browser`, `landing.browser.spec.ts`, 390px viewport).
3. Scroll to the live-proof section (`#live-proof`).
   → The `.agent-win` chat-chrome renders three real turns: `get_tars_funnel` with real
   targeted/adopted/retained counts (matches step 1's numbers) + the "registry-declared, not
   gateway-observed" caveat as a tasting note; `get_north_star` with a real value + WoW delta;
   `compare_experiment` with real control/treatment conversion rates and lift.
4. Submit a test email to the waitlist (hero or the pricing section); submit the same email again.
   → First submit: inline confirmation ("You're on the list…"), no page reload. Second submit:
   same 200/confirmation — verify via Supabase Studio (`waitlist` table) that only ONE row exists
   for that email.
5. Open `/funnel/golden-beans-demo/setup_guide` (old internal path, now redirects).
   → 307 to `/app/funnel/golden-beans-demo/setup_guide`; the internal (unstyled, no-auth) funnel
   page renders there with the same real numbers. `/impact/...` and `/experiments/...` redirect
   the same way.
6. `curl <base-url>/api/v1/public/funnel?project=golden-beans-demo&feature=setup_guide` → 200 with
   real JSON. `curl <base-url>/api/v1/public/funnel?project=miyagisanchez&feature=setup_guide` →
   **403** (the real production project is never publicly readable).

If any step fails, note the step number + what you saw — that's the bug report.

**Owed to Daniel (can't self-smoke):** the full visual/brand pass against `references/design/`
(no money/auth steps involved — this is a design-fidelity review, not a security-gated flow); the
production `npm run seed:demo` run + post-merge steps 2-6 against the real prod URL.
