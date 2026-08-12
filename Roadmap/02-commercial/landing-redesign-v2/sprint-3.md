# Landing redesign v2 — Sprint 3: Ship it

**Status:** 🚧 In progress

> **Build contract.** No new product surface. This sprint reconciles everything the redesign broke,
> runs the real gate, takes two cross-family review passes, and verifies production.

## Stories

### Story 3.1 — Reconcile the coupled specs
**As a** contributor, **I want** the suite to assert the page that now exists, **so that** green
means something.

**Acceptance:**
- `e2e/design-system.browser.spec.ts` asserts the **v2** `h1` and foil text (it currently pins
  "The growth engine your agent operates." and `h1 .foil` = "your agent").
- `e2e/landing.browser.spec.ts`'s two hand-copied overflow tests are replaced by / folded into the
  Sprint 1 sweep, with no loss of coverage.
- `e2e/self-track.spec.ts` and `e2e/waitlist.spec.ts` still pass — the dogfood beacon and the
  waitlist POST are untouched behaviour and must stay that way.
- Any spec that asserted removed copy is updated to the copy that replaced it, never deleted to go
  green.
**Risk:** low

### Story 3.2 — The gate, actually run
**Acceptance:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`,
`npm run check:design-drift` and `npm run test:e2e:browser` all run and their **actual** output is
reported in the PR. No "should pass."
**Risk:** low

### Story 3.3 — Review, merge, verify
**Acceptance:**
- Two routed cross-family passes via `scripts/review-route.mjs`; rounds continue until one comes
  back clean from **both** families (memory: two rounds is a floor, not a target).
- PR declares its risk tier; merged to `main` (= the deploy).
- Production verified: the v2 hero renders, both prompts copy, `/northstar-self-serve.md` is 200,
  and 390px has no horizontal scroll — on the real production URL, not a preview.
**Risk:** low

## Smoke walkthrough (production)

1. Open the production URL → v2 hero renders.
2. `curl -sI https://<prod>/northstar-self-serve.md` → `200`, `content-type: text/markdown`.
3. DevTools device toolbar at 390px → scroll the full page → no horizontal scrollbar.
4. Click both **copy prompt** buttons → both confirm.
5. §6 → Pod Report figures present (or the honest fallback), live engine numbers present.
