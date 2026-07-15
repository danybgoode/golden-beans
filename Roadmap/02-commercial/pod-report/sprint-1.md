# Pod Report + Roadmap Hub — Sprint 1: The rendering primitive + hub skateboard (internal)

**Status:** ⬜ not started

## Stories

### Story 1.1 — Report artifacts + the roadmap-push rail
**As a** tenant, **I want** to push my roadmap projection (extract-schema JSON via my API key) and
have it stored as a **versioned, immutable report artifact**, **so that** the engine renders from
data I control. Ships: additive `report_artifacts` migration (tenant-scoped, versioned, immutable;
RLS-on/no-policies pattern), `roadmap-push` command (POSTs `scripts/roadmap-to-notion.mjs
--extract` output — that JSON is the contract, version field validated on ingest), CI step pushing
gb's own roadmap on merge to `main`.
**Acceptance:** push → new queryable version; malformed/wrong-version payload → 4xx; a real
foreign API key cannot read it (S4 realistic-input lesson).
**Risk:** LOW

### Story 1.2 — Journey + epic drill-down views (gb as tenant #0)
**As a** team member, **I want** the hub's **journey view** (the build order as a path, a "you are
here" marker, shipped behind / next ahead) and **epic drill-down** (sprints + stories, ✅ ticks,
risk tiers) rendering gb's latest pushed artifact with a **freshness stamp** ("as of merge
`abc123`, 2h ago" — a design element, not fine print), **so that** "where are we" is a page, not a
doc dive.
**Acceptance:** views render the latest artifact; stamp shows source commit + age; content matches
BUILD-ORDER.md; design language = `references/design-direction.md` (roastery world, agent-window
frame device).
**Risk:** LOW

### Story 1.3 — Horizon view (progress against the desired end-state)
**As a** stakeholder, **I want** the **horizon view** — end-state destinations (generalized from
the landing section↔epic registry) as cards, each showing what's lit ✅ vs coming 🔜 and the epic
that lights it, funnel seeds rendered as deliberately-hazy "on the horizon", **so that** progress
reads against the destination, never as a backlog.
**Acceptance:** every destination shows its lighting epic + honest badge; nothing claims ✅ for
unshipped work (poster rule); seeds render hazy (un-groomed ≠ promised).
**Risk:** LOW

## Sprint QA
- **api spec(s):** 1.1 → push validation (4xx) + foreign-key 403 + version immutability · 1.2/1.3 →
  views render latest artifact; freshness stamp present
- **browser smoke owed:** no (anonymous/internal render checks; browser spec optional)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs, one action + one
expected result per step). Owed per Stage 8b: push gb's roadmap → hub views match BUILD-ORDER._
