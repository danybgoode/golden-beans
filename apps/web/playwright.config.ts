import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { AUTHED_STATE_PATH } from './e2e/helpers/authed-fixture'

// Load .env.local (if present — never committed, gitignored) before reading any env var below,
// so `npm run test:e2e` picks up local Supabase creds without a separate dotenv dependency or a
// `node --env-file` wrapper (which can't invoke a PATH-resolved binary directly). No-op in CI,
// where the real env vars are already set by the workflow.
const envLocalPath = join(__dirname, '.env.local')
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2]
  }
}

/**
 * Playwright harness — see WAYS-OF-WORKING.md's "Automated QA" section for the two-layer shape
 * this implements.
 *
 * Projects:
 *   - `api`       — the deterministic gate. API-level specs (`*.spec.ts`, excluding both browser
 *                   families) hit public endpoints via the `request` fixture against `baseURL`.
 *                   No browser binaries -> fast, cheap, runs in CI on every PR.
 *   - `browser`   — opt-in ANONYMOUS real-browser smoke (`*.browser.spec.ts`, Chromium). Asserts
 *                   *rendered* UI an API call can't see. NOT in the blocking gate.
 *   - `authed`    — opt-in SIGNED-IN real-browser smoke (`*.authed.spec.ts`). Depends on
 *                   `auth-setup`, which provisions a disposable user + tenant and logs in through
 *                   the real form; `auth-teardown` removes them afterwards. Also NOT in the gate.
 *
 *   npx playwright test                      # everything (needs `playwright install`)
 *   npm run test:e2e                         # api only -- the gate
 *   npm run test:e2e:browser                 # anonymous browser smoke
 *   npm run test:e2e:authed                  # signed-in browser smoke (provisions + cleans up)
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
      // BOTH browser families must be excluded here. `*.authed.spec.ts` also matches the broad
      // `.*\.spec\.ts` above, so without this the deterministic gate would try to run Chromium
      // specs with no browser fixture and no session — failing the gate for a reason that has
      // nothing to do with the code under review.
      testIgnore: /.*\.(browser|authed)\.spec\.ts/,
    },
    {
      name: 'browser',
      testMatch: /.*\.browser\.spec\.ts/,
      // Anonymous by construction: no storageState. Keeps the existing public-surface specs honest
      // about what a stranger actually sees, even once an authed session exists in the same run.
      use: { ...devices['Desktop Chrome'] },
    },

    // ── The authed browser rail (opt-in, NOT the CI gate) ───────────────────────────────────
    // `npm run test:e2e:authed`. Three projects rather than one, so the expensive parts happen
    // exactly once: `auth-setup` provisions a disposable user + tenant and signs in through the
    // REAL login form, every authed spec reuses the resulting storageState, and `auth-teardown`
    // removes the fixtures whether the specs passed or not.
    //
    // The point of this rail is to convert the MECHANICAL half of the browser smoke otherwise owed
    // to the product owner into automation (WAYS-OF-WORKING: a browser spec replaces a browser
    // smoke previously owed), leaving him the judgement calls a spec cannot make.
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      teardown: 'auth-teardown',
    },
    {
      name: 'authed',
      testMatch: /.*\.authed\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTHED_STATE_PATH },
    },
    {
      name: 'auth-teardown',
      testMatch: /auth\.teardown\.ts/,
    },
  ],
})
