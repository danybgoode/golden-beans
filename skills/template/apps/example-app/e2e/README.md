# e2e harness (template)

Two Playwright projects, matching WAYS-OF-WORKING.md's "Automated QA" section. Coverage is meant to
grow by **one spec per new browser- or API-testable story**, not as a separate project.

- **`api` project: the deterministic gate (always on).** `npm run test:e2e` runs API-level specs via
  the `request` fixture, with no browser binaries. CI runs it on every PR, and it must be green before
  merge.
- **`browser` project: opt-in real-browser smoke (NOT the gate).** `npm run test:e2e:browser` runs
  `*.browser.spec.ts` in Chromium, asserting *rendered* UI an API call can't see. It stays out of the
  blocking gate because the binaries are heavy and slow. Run it on demand, or nightly from a routine
  or scheduled workflow.

## It runs today

```
npm install
npm run test:e2e                         # starts server.mjs itself, runs e2e/health.spec.ts
npx playwright install chromium          # once
npm run test:e2e:browser                 # e2e/home.browser.spec.ts (+ the live-smoke spec, which skips)
```

With no `PLAYWRIGHT_BASE_URL`, `playwright.config.ts` starts `server.mjs` itself. Given a base URL
(as `scripts/live-smoke.mjs` always passes), it starts nothing and targets that URL.

| File | What it is |
|---|---|
| `health.spec.ts` | the first `api` spec — replace with your first story's API assertion |
| `home.browser.spec.ts` | the first `browser` spec — replace with your first rendered-UI assertion |
| `_live/ad-hoc.browser.spec.ts` | the one generic spec `scripts/live-smoke.mjs --path` runs. **Never edit it to check a specific page.** |
| `_helpers/auth.ts` | **TEMPLATE FILL-IN** — `signIn()` for your auth provider. Until it's implemented, authed flows skip with a reason |

## TEMPLATE FILL-IN

1. Move or rename `apps/example-app/` to your real app's directory, and update `appDir` in
   `live-smoke.config.json`.
2. Point `playwright.config.ts`'s `webServer.command` at your app's dev/start command, then delete
   `server.mjs`.
3. Replace the two example specs with your first real stories' assertions.
4. If authed browser smokes are needed, implement `_helpers/auth.ts` with your auth provider's
   testing-token or session-bypass mechanism, against a dev/test instance only.
5. When a story's acceptance is browser-testable (a field renders before a CTA, a counter ticks), add
   a `*.browser.spec.ts` for it. This is how "smoke owed to the product owner" work gets automated away
   over time, per WAYS-OF-WORKING.md's Definition of Done.
