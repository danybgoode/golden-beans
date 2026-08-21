import 'server-only'
import {
  isSiteUrlMisconfiguredInProductionEnv,
  resolveSiteUrl,
  type SiteUrlEnv,
} from './site-url-resolve'

// Story 2.2 (commercial-shell/sprint-2.md) — the ONLY absolute-URL builder in this app
// (AGENTS.md rule #5, "Key imports"). Extended by site-url-preview-aware · Sprint 1, Story 1.1.
//
// ── This file is now a seam, not a decision ──────────────────────────────────────────────────
// The resolution ORDER lives in `./site-url-resolve.ts`, which is pure and zero-import so it can be
// unit tested exhaustively. This file exists to keep `server-only` on the boundary every caller
// imports, and to be the one place `process.env` is read.
//
// The split was forced rather than chosen: `server-only` does not resolve under `node --test`, so
// the order could not be tested where it was. This repo has a rule for that (LEARNINGS: a
// unit-testable pure helper cannot share a file with a framework-only import; CODE-QUALITY #5:
// extract the unreachable guard into a pure module and assert it directly). `agent-rail-visibility.ts`
// is the precedent. Read `site-url-resolve.ts` for the order, the reasoning, and why reading
// `VERCEL_*` is NOT the Host-header fallback rule #5 prohibits.
//
// **Nothing here may read from the incoming request.** No `headers()`, no `Host`, no
// `x-forwarded-*`. The resolver takes an environment and there is no request in scope to leak.

/**
 * The one place `process.env` is read for URL building. Narrowed to the four variables the decision
 * is allowed to see, so a future edit cannot quietly widen its inputs without changing this type.
 */
function siteUrlEnv(): SiteUrlEnv {
  return {
    SITE_URL: process.env.SITE_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  }
}

export function getSiteUrl(): string {
  return resolveSiteUrl(siteUrlEnv())
}

// A cross-review catch on the original PR: without this check, a real Vercel production deploy
// that's missing SITE_URL would silently show a live-looking but broken `localhost:3000` connector
// URL on the public install page. `VERCEL_ENV` (set by Vercel's own build/runtime, distinct from
// NODE_ENV — `next start` sets NODE_ENV=production in CI, locally and on Vercel alike, so it cannot
// tell them apart) is only 'production' on a real Vercel production deployment, never in CI or a
// local `npm run start` — so this can't falsely hide the connector anywhere this repo tests it.
export function isSiteUrlMisconfiguredInProduction(): boolean {
  return isSiteUrlMisconfiguredInProductionEnv(siteUrlEnv())
}
