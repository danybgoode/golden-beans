import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

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
