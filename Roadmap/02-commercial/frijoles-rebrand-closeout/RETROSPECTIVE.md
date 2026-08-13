# Golden Frijoles rebrand close-out — Retrospective

_Closed: 2026-08-13 · PR #96 · merge `0a0beb0`_

## What shipped

- `@golden-frijoles/sdk@0.4.0` is public on npm and clean-installs outside the monorepo. The package,
  workspace wiring, imports, install snippets, source comments, and README now use Golden Frijoles.
  OpenFeature provider identities changed deliberately to `golden-frijoles` and
  `golden-frijoles-scenarios`, with the breaking pre-1.0 minor called out and pinned by tests.
- The free public-package `golden-frijoles` npm organization now owns the scope. Only after the new
  artifact installed and imported successfully was `@golden-beans/sdk@0.1.0` deprecated with a
  pointer to the new package.
- The landing footer's mockup ledger and unused CSS are gone. Canonical public SVGs, their accessible
  text, and the live-proof display label use Golden Frijoles; the local surface notes, flag-derived
  OFF badges, and invented-content disclaimers remain asserted at their sources.
- The anonymous mobile rail now has a signed-in counterpart on the existing auth setup/teardown
  path. Its first real run found undersized sortable headers and horizontal overflow in scenario and
  destination tables; the shared table/control seams were repaired across the signed-in route set.
- PR #96 merged to `main` as `0a0beb0`. GitHub deployment `5889853438` attached that exact SHA to
  Production, and the live landing browser suite passed 15/15 on `https://goldenfrijoles.com`.

## What went well

- Treating provider names, the webhook envelope, tenant slugs, and integration addresses as separate
  decisions prevented a cosmetic rename from breaking runtime, wire, data, or deployment contracts.
- The asserted sweep failed on its first wrong expected count before writing, then proved the exact
  replacement and survivor sets. The same discipline kept stale worktree copies and the user-owned
  untracked handoff file untouched.
- Mutation checks earned their keep: provider assertions, ledger absence, and the shared mobile
  helper were all observed red. The authenticated sweep then found product defects the anonymous
  redirect could never expose.
- Release order stayed truthful: build and pack, publish, wait for first-package metadata to become
  installable, clean-install/import, deprecate the old version, merge, then verify production.
- Antigravity and Mistral Vibe both completed routed full-scope reviews with no blocking or
  should-fix findings; fresh-database CI was green after the known accumulated-local-DB false alarm.

## What we learned

- A new npm scope is an owned namespace, not a string the first publish creates. Organization
  creation, plan/ownership choice, and first-package metadata propagation belong in release planning;
  a PUT 200 or visible package page still does not replace a clean install proof.
- A mobile sweep must first prove it reached the intended authorization state. Otherwise a signed-in
  route can look clean because the anonymous browser measured the login redirect instead of the app.
- Shared skills fail usefully only when their prerequisites are present. The `live-smoke` skill
  correctly refused to invent a wrapper absent from this repo; permanent Playwright coverage and a
  direct rendered inspection supplied the proof, while the missing wrapper remains an explicit gap.

## Gaps / follow-ups

- Add the repo-local `scripts/live-smoke.mjs` wrapper expected by the shared skill so future rendered
  production checks emit the standard JSON report and screenshot artifact.
- The signals-loop production write smoke and the first real pod-report share links remain owed.
  Both require credentials or tokens only Daniel can mint; this session did not attempt either.
- `RESILIENCE_SCENARIOS_ENABLED` and `SECURITY_SIMULATIONS_ENABLED` remain deliberately OFF. Turning
  either on remains a separate env change plus Git-tracked redeployment and behavioral verification.
