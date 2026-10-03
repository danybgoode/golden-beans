---
epic: portfolio-view
sprint: 2
title: "The page and the front door"
risk: high
phase: Building
stories_total: 3
stories:
  - id: S2.1
    title: "/app/portfolio — the page in its five states"
    as_a: "the product owner"
    i_want: "one page with a row for every product in my workspace"
    so_that: "I can compare them at a glance"
    risk: high
    status: done   # PR #235
  - id: S2.2
    title: "/app opens on the portfolio at 2+ products"
    as_a: "the product owner"
    i_want: "to land on the portfolio when I hold two or more products"
    so_that: "the front door shows me everything I run"
    risk: high
    status: done   # PR #235
  - id: S2.3
    title: "Place a product on the loop from its row"
    as_a: "a project owner"
    i_want: "to set Consider, Operate or Exit from the product's row"
    so_that: "the portfolio reflects where I've decided each product is"
    risk: high
    status: done   # PR #235
---
# Portfolio view: every product in a workspace on one page, placed on the Consider · Operate · Exit loop — Sprint 2: The page and the front door

**Status:** ✅ shipped — PR #235 (`1751c8c`)

## Build contract (locked by the architect before the builder started — README § Architecture lock)
Cite, don't restate: D2, D5, D11, D12, C2, C3, C5.
Render from Sprint 1's `getPortfolio()` only. The approved sketch in the seed is the visual contract
(WAYS-OF-WORKING: an approved design IS scope) — a browser assertion must be able to fail on how the page looks.
- **Files:** `app/app/portfolio/{page,loading,error}.tsx`, `app/app/portfolio/actions.ts` (the D11 Server Action),
  a loop-stage control component, `lib/portfolio-workspace.ts` (D12's pure chooser + the D5 redirect predicate),
  the `/app` redirect in `app/app/page.tsx` (bare `/app` only — C2), the switcher's Portfolio entry,
  `design-system/route-manifest.ts` (+1 route, uncovered with a dated deferral — the `/app/finops` precedent: the
  seed's surface blocks carry no approving hash row), `e2e/portfolio.authed.spec.ts`.
- **States → triggers:** portfolio (2+ rows) · loading (`loading.tsx`) · empty (the chosen workspace holds < 2 of the
  viewer's projects) · error (`error.tsx`; `getUserWorkspaces` throws on a failed read) · loop not placed (a row whose
  stage is null shows "Not placed", and "Place it" for an owner).
- **Teeth:** the authed spec signs in a disposable person with two projects in one workspace plus a sibling project
  they are NOT a member of, and asserts the sibling's slug is absent; the redirect is asserted for 1 vs 2 products.
- **Deviations found while building (said out loud):** (a) the console's **Today tab** and two "Today" crumbs linked to
  bare `/app` — the same class as C2 — so they now carry the project in hand (`todayHrefFor`); (b) a route-level
  `loading.tsx` streamed a 200 before `notFound()` ran, so the loading state is an in-page Suspense fallback and every
  404/redirect is decided above it; (c) only a cell holding a VALUE is a link — a reason in link ink read as a figure.
- **Order:** 2.1 and 2.3 first; the `/app` redirect (2.2) is the last commit, so nobody is sent to a page that isn't there.

## Stories

### Story 2.1 — /app/portfolio — the page in its five states
**As** the product owner, **I want** one page with a row for every product in my workspace, **so that** I can compare them at a glance.
**Acceptance:**
- `/app/portfolio` renders the approved sketch (seed → Visuals): portfolio · loading · empty (one product) · error · loop not placed.
- Columns: Product · Loop · North Star · Funnel · Running · Lead time · Spend vs quote; every cell links to the project page it came from.
- Uses the console app shell and component kit — no new primitives; badges reuse existing tones.
- A non-member of the workspace gets 404.
**QA:** browser spec for the five states (replaces a browser smoke); api spec for access.
**Risk:** high

### Story 2.2 — /app opens on the portfolio at 2+ products
**As** the product owner, **I want** to land on the portfolio when I hold two or more products, **so that** the front door shows me everything I run.
**Acceptance:**
- `/app` redirects to `/app/portfolio` when the caller has 2+ projects in the workspace; with one, `/app` behaves exactly as before (D5).
- The project switcher gains a "Portfolio" entry for 2+ product users.
- Lands **after** 2.1 is live.
**QA:** api/route spec for both branches of the redirect.
**Risk:** high

### Story 2.3 — Place a product on the loop from its row
**As** a project owner, **I want** to set Consider, Operate or Exit from the product's row, **so that** the portfolio reflects where I've decided each product is.
**Acceptance:**
- An owner sees "Place it" on an unset row and a menu on a set one; choosing a stage updates the row.
- A non-owner member sees the stage read-only.
- The write goes through 1.3's guarded path only.
**QA:** browser spec (owner and member); api spec reused from 1.3.
**Risk:** high

## Sprint QA
- **browser spec:** `/app/portfolio` five states + owner/member loop control.
- **api spec:** the `/app` redirect at 1 vs 2+ products; access.
- **review:** risk HIGH → security lens; fresh `pr-reviewer`; routed external pass.
- **browser smoke owed:** the signed-in steps below are owed to Daniel (auth).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. (auth — owed to Daniel) Sign in with your account (2+ products) and go to https://goldenfrijoles.com/app
   → you land on https://goldenfrijoles.com/app/portfolio with one row per product.
2. Click a product's North Star value.
   → you're on that project's North Star page.
3. On a row showing "Not placed", click "Place it" and choose Operate.
   → the row's Loop badge reads Operate.
4. Sign in as a user with exactly one product and go to https://goldenfrijoles.com/app
   → the page you know, no redirect.

If any step fails, note the step number + what you saw — that's the bug report.

**Run 2026-10-03 (builder):** production is on `1751c8c`; unauthenticated, `/app/portfolio` answers 307 → `/login`
like every console route. Steps 1–4 are signed-in and **owed to Daniel**; their mechanical half runs in CI as
`e2e/portfolio.authed.spec.ts` (2+ products → portfolio, sibling hidden, owner places a product, member read-only,
forged ids refused, one product → Today, foreign workspace → 404).
