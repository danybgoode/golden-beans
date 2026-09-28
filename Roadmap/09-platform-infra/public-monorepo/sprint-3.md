---
epic: public-monorepo
sprint: 3
title: "S3 Secrets and sensitive docs"
risk: low
phase: Locking architecture
stories_total: 3
stories:
  - id: S3.1
    title: "Full-history secret scan"
    as_a: "the product owner"
    i_want: "both repos' whole history scanned for secrets once"
    so_that: "anything leaked before push protection (2026-09-16) is found and rotated"
    risk: low
    status: planned
  - id: S3.2
    title: "A private repo for business-sensitive docs"
    as_a: "the product owner"
    i_want: "golden-frijoles/internal (private)"
    so_that: "client, pricing and strategy material stops accumulating in public"
    risk: low
    status: planned
  - id: S3.3
    title: "Move the approved inventory, forward-only"
    as_a: "the product owner"
    i_want: "the docs I approve moved there, with pointers left behind"
    so_that: "the public Roadmap stops carrying them, without a history rewrite (Decision 2 → A)"
    risk: low
    status: planned
---
# One public monorepo — Sprint 3: S3 Secrets and sensitive docs

**Status:** ⬜ not started

## Stories

### Story 3.1 — Full-history secret scan
**As the product owner**, **I want** both repos' whole history scanned for secrets once, **so that** anything leaked before push protection (2026-09-16) is found and rotated.
**Acceptance:** gitleaks runs over both repos' full history (CI job or `npx`, report only; no repo dependency). The report goes in `Roadmap/00-ideas/audits/`. Any live secret is named to Daniel for rotation and never printed.
**Risk:** low

### Story 3.2 — A private repo for business-sensitive docs
**As the product owner**, **I want** golden-frijoles/internal (private), **so that** client, pricing and strategy material stops accumulating in public.
**Acceptance:** The repo exists, is private, and only Daniel plus the automation have access. Its README says what belongs there.
**Risk:** low

### Story 3.3 — Move the approved inventory, forward-only
**As the product owner**, **I want** the docs I approve moved there, with pointers left behind, **so that** the public Roadmap stops carrying them, without a history rewrite (Decision 2 → A).
**Acceptance:** The builder proposes a file list with a reason for each. **Nothing moves until Daniel approves the list.** Moved files leave a one-line pointer, and the link check stays green.
**Risk:** low

## Sprint QA
- The scan report exists and every finding is dispositioned. The link check covers the pointers. No browser smoke.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` green, plus the skills checks from S1.2 on.

## Sprint 3 — Smoke walkthrough (do these in order)

1. Open the scan report under `Roadmap/00-ideas/audits/`
   → every finding has a disposition.
2. Open https://github.com/golden-frijoles/internal while signed out
   → 404 (it's private).

If any step fails, note the step number + what you saw — that's the bug report.
