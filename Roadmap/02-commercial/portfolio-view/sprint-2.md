---
epic: portfolio-view
sprint: 2
title: "The page and the front door"
risk: high
phase: Shaping
stories_total: 3
stories:
  - id: S2.1
    title: "/app/portfolio — the page in its five states"
    as_a: "the product owner"
    i_want: "one page with a row for every product in my workspace"
    so_that: "I can compare them at a glance"
    risk: high
    status: planned
  - id: S2.2
    title: "/app opens on the portfolio at 2+ products"
    as_a: "the product owner"
    i_want: "to land on the portfolio when I hold two or more products"
    so_that: "the front door shows me everything I run"
    risk: high
    status: planned
  - id: S2.3
    title: "Place a product on the loop from its row"
    as_a: "a project owner"
    i_want: "to set Consider, Operate or Exit from the product's row"
    so_that: "the portfolio reflects where I've decided each product is"
    risk: high
    status: planned
---
# Portfolio view: every product in a workspace on one page, placed on the Consider · Operate · Exit loop — Sprint 2: The page and the front door

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
Render from Sprint 1's `getPortfolio()` only. The approved sketch in the seed is the visual contract
(WAYS-OF-WORKING: an approved design IS scope) — a browser assertion must be able to fail on how the page looks.

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
