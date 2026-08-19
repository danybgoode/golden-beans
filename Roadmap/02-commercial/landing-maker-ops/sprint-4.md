# Maker ops — Sprint 4: Verify and ship

**Status:** not started

> **Build contract.** "Done" means serving on `https://goldenfrijoles.com`. Merging to `main` **is**
> the deploy (AGENTS.md rule #4) — no `vercel deploy`, ever. Nothing here is reported as passing
> that was not actually run; a green claim that was never run is the most expensive thing this
> sprint can produce (CODE-QUALITY, "the gate").

## Stories

### Story 4.1 — The specs describe the page that exists
**As a** future contributor, **I want** the landing's rendered contract to pin the new spine,
**so that** the next redesign breaks a test rather than a promise.

**Acceptance:**
- `e2e/landing.browser.spec.ts` is updated where it asserts the retired narrative: the `<h1>` text,
  the hero CTA href list, and the prompt-card count.
- New assertions for what this epic introduces: the Ops tablist is keyboard-operable and exposes
  `aria-selected`; the FinOps surface is labelled `next` wherever it appears; the primary CTA
  resolves to a real destination under both `SIGNUP_ENABLED` positions.
- The surface-note contract (every framed agent window commits to real or illustrated) still passes
  against the new frames — the new hero and operating-context frames both add one.
- `e2e/mobile-heuristics.browser.spec.ts` still passes for `/` — no horizontal scroll at 390px, no
  tap target under 44px.
- Each new spec is **mutation-checked**: break the thing it defends, observe red, revert, confirm
  `git diff HEAD` is clean (CODE-QUALITY #5 and #12).
**Risk:** low

### Story 4.2 — The full gate, actually run
**Acceptance:**
- `npm run typecheck` (four tsconfig projects), `npm run lint` (`--max-warnings=0`),
  `npm run test:unit`, `npm run test:e2e`, `npm run check:design-drift` — all run, with real output
  reported.
- `npm run test:e2e` needs `supabase start` and a freshly built server; a failure that turns out to
  be a stale server or a missing local Supabase is diagnosed, not reported as a regression.
**Risk:** low

### Story 4.3 — Cross-family review, to clean
**Acceptance:**
- Two cross-family reviewers per round (`review-route.mjs`, builder = claude → codex + agy).
- **Rounds continue until one round comes back clean from BOTH families.** Two rounds is a floor,
  not a stopping condition, and a fix gets the same suspicion as the code it replaced.
- Every finding is answered in the PR: fixed, or rejected with a reason.
**Risk:** medium

### Story 4.4 — Ship it, then prove it shipped
**Acceptance:**
- PR opened, gate green, `origin/main` merged into the branch before merging.
- Merged to `main`. The deployed SHA confirmed via
  `gh api repos/danybgoode/golden-beans/deployments` — never assumed from a green CI run.
- **Production smoke on the live site**, by exercising behaviour: the new `<h1>` renders, every CTA
  resolves to a 200, the Ops tabs switch, the SecOps badge matches the real gate state, the FinOps
  section is labelled `next`, and `/` has no horizontal scroll at 390px.
- The dogfood beacon still fires — `landing_visited` is still being ingested after the deploy.
**Risk:** medium

### Story 4.5 — Close the epic
**Acceptance:**
- `Roadmap/README.md` poster updated.
- `RETROSPECTIVE.md` written — what shipped, what worked, what didn't, the owed ledger.
- Durable learnings promoted to `Roadmap/LEARNINGS.md`, deduped against what is already there.
- README frontmatter `status: shipped`.
- `node scripts/build-order.mjs` regenerated (never hand-edited).
**Risk:** low
