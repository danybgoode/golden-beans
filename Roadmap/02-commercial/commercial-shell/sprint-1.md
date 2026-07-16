# Commercial shell — Sprint 1: Launch-ready landing

**Status:** 🟨 In progress

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
Env: preview URL pre-merge · production `https://golden-beans-gamma.vercel.app` post-merge

1. Open `/` in a private window.
   → Golden Beans landing renders; hero + sections per end-state map; 🔜 badges on E2/E3/E4 sections.
2. Scroll to the live-proof section.
   → A TARS funnel with real numbers renders inside the agent-window chrome; the Targeted caveat is visible.
3. Submit a test email to the waitlist; submit it again.
   → Confirmation state; second submit does not create a duplicate.
4. Open `/funnel` (old internal path).
   → Redirects/relocates to the internal app surface; not reachable as anonymous public content if gated.

If any step fails, note the step number + what you saw — that's the bug report.
