import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright harness template — see WAYS-OF-WORKING.md's "Automated QA" section for the two-layer
 * shape this implements. TEMPLATE FILL-IN: this file lives under apps/example-app/ as a worked
 * example; move/rename it to wherever your real app lives, and fill in the baseURL default + any
 * globalSetup your app's auth provider needs (see the commented-out block below).
 *
 * TWO projects:
 *   - `api`     — the deterministic gate. API-level specs (`*.spec.ts`, excluding
 *                 `*.browser.spec.ts`) hit public endpoints via the `request` fixture against
 *                 `baseURL`. No browser binaries -> fast, cheap, runs in CI on every PR.
 *   - `browser` — opt-in real-browser smoke (`*.browser.spec.ts`, Chromium). Asserts *rendered*
 *                 UI an API call can't see (a field renders before the CTA, a counter ticks, a
 *                 required-field nudge fires). NOT in the blocking gate (binaries are heavy/slow);
 *                 run on demand / nightly.
 *
 *   npx playwright test                      # api + browser (needs `playwright install`)
 *   npm run test:e2e                         # api only -- the gate
 *   npm run test:e2e:browser                 # browser only (run `npx playwright install chromium` first)
 *
 * Point at any environment with PLAYWRIGHT_BASE_URL; defaults to local dev below.
 *
 * If your deploy rail's previews are SSO-gated (e.g. Vercel's protection), set
 * VERCEL_AUTOMATION_BYPASS_SECRET (or your rail's equivalent) and send it as a header/cookie on
 * every request -- never hardcode it; CI injects it from a secret.
 *
 * Grow coverage one spec per new browser/API-testable story (see WAYS-OF-WORKING.md -> Automated QA).
 */
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // TEMPLATE FILL-IN: if authed browser smokes need a testing-token/session bypass from your auth
  // provider, wire it here via a globalSetup file (no-op without the relevant env vars set, so the
  // api gate stays unaffected). Example: `globalSetup: './e2e/global.setup.ts'`.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    extraHTTPHeaders: {
      Accept: 'application/json',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.browser\.spec\.ts/,
    },
    {
      name: 'browser',
      testMatch: /.*\.browser\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
