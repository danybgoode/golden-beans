# e2e harness (template)

Two Playwright projects, matching WAYS-OF-WORKING.md's "Automated QA" section — coverage is meant to
grow by **one spec per new browser-/API-testable story**, not as a separate project.

- **`api` project — the deterministic gate (always-on).** `npm run test:e2e`, API-level via the
  `request` fixture, no browser binaries. CI runs this on every PR. Must be green before merge.
- **`browser` project — opt-in real-browser smoke (NOT the gate).** `npm run test:e2e:browser`,
  Chromium, `*.browser.spec.ts`. Asserts *rendered* UI an API call can't see. Kept out of the blocking
  gate (binaries are heavy/slow); run on demand and/or nightly via a routine or scheduled workflow.

## TEMPLATE FILL-IN

This directory is the harness *shape*, not real specs — there are none checked in here. When you spawn
a project from this template:

1. Move/rename `apps/example-app/` to your real app's directory.
2. Write your first `api` spec for the first story that has a testable API surface.
3. If your auth provider needs a testing-token bypass for authed browser smokes, add a
   `global.setup.ts` (wired via `playwright.config.ts`'s commented-out `globalSetup` line) that's a
   no-op without the relevant env vars set — so an unauthenticated harness run never breaks.
4. If a story's acceptance is browser-testable (a field renders before a CTA, a counter ticks), add
   `*.browser.spec.ts` for it — this is how "smoke owed to the product owner" work gets automated away
   over time, per WAYS-OF-WORKING.md's Definition of Done.

## Package scripts to add

```json
{
  "scripts": {
    "test:e2e": "playwright test --project=api",
    "test:e2e:browser": "playwright test --project=browser"
  }
}
```
