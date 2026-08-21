// site-url-preview-aware · Sprint 1, Story 1.1 — the base-URL resolution ORDER, as a pure function.
//
// ── Why this is its own zero-import module (epic A1) ─────────────────────────────────────────
// `site-url.ts` imports `server-only`, which does not resolve under `node --test` — it is provided
// by Next's bundler, not by either `node_modules` tree. So the resolution logic could not be unit
// tested where it was, and this repo has a rule for exactly that: a unit-testable pure helper
// cannot live in the same file as code that imports a framework-only module (LEARNINGS), and a
// guard the harness cannot reach gets extracted into a pure module and asserted directly
// (CODE-QUALITY #5). `agent-rail-visibility.ts` is the precedent.
//
// So the ORDER lives here and is tested exhaustively; `site-url.ts` stays the server-only seam that
// every caller imports and does nothing but hand this function `process.env`.
//
// ── The rule this does NOT break, stated where the code is ───────────────────────────────────
// AGENTS.md rule #5 forbids falling back to a request `Host` header, because a bare-container Host
// is attacker-controllable and can build a hostile absolute URL on a redirect path.
//
// This function takes an ENVIRONMENT, not a request. `VERCEL_ENV`, `VERCEL_BRANCH_URL` and
// `VERCEL_URL` are set by the platform into the deployment; they are identical for every request
// that deployment serves and no caller can influence them. Rule #5 is untouched — and the signature
// makes that structural rather than a promise, because there is no request here to read.
//
// **Never widen this to accept headers.** If a future change wants a per-request host, that is a
// different function with a different review.

/** Exactly the variables this decision reads. Nothing request-derived can appear here. */
export interface SiteUrlEnv {
  SITE_URL?: string
  VERCEL_ENV?: string
  VERCEL_BRANCH_URL?: string
  VERCEL_URL?: string
}

/**
 * Trailing slashes stripped, so a caller doing `${siteUrl}/install` cannot produce a double slash.
 * Applied to BOTH sources rather than only to `SITE_URL` — a normalisation that covers one branch
 * and not the other is the shape of bug this module exists to prevent.
 */
function normalise(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Resolve the public base URL, in this order and no other:
 *
 * 1. **`SITE_URL`** — unchanged, and still first. It is set in Production, so on every production
 *    request this returns before the preview branch is evaluated. Production is unaffected by
 *    ORDERING rather than by promise (epic D1), and the unit spec asserts it directly.
 * 2. **A preview deployment's own hostname** — only when `VERCEL_ENV === 'preview'`. Before this,
 *    every preview rendered every absolute URL as `http://localhost:3000`, so a preview could not
 *    verify any URL-bearing surface. Nothing failed; it was consistently the wrong host, which is
 *    how it survived two epics.
 * 3. **`http://localhost:3000`** — local dev, CI, and any non-Vercel context.
 *
 * `VERCEL_BRANCH_URL` before `VERCEL_URL` (epic D3): the branch URL is stable for the life of the
 * branch while the deployment URL changes on every push, and these surfaces hand a URL to a person
 * or their agent to paste somewhere.
 *
 * It deliberately does NOT fire in production. A production deploy that has lost `SITE_URL` must
 * keep failing loud via `isSiteUrlMisconfiguredInProduction()` — silently serving its own
 * `golden-beans-xyz.vercel.app` URL in place of `goldenfrijoles.com` would be a worse bug than the
 * one this fixes, because it looks plausible.
 */
export function resolveSiteUrl(env: SiteUrlEnv): string {
  const configured = env.SITE_URL?.trim()
  if (configured) return normalise(configured)

  if (env.VERCEL_ENV === 'preview') {
    // Vercel sets these as BARE hostnames and serves previews over TLS, so the scheme is ours to
    // add. An existing scheme is stripped first: if one of these is ever populated by hand — a
    // custom preview runner, a local reproduction — `https://${host}` would otherwise produce
    // `https://https://…`, a string that parses as a URL and points nowhere. (agy, PR #116.)
    //
    // The `if (host)` is what stops a missing variable becoming the plausible-looking
    // `https://undefined`.
    const host = (env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim())?.replace(/^https?:\/\//, '')
    if (host) return normalise(`https://${host}`)
  }

  return 'http://localhost:3000'
}

/**
 * True when a real Vercel PRODUCTION deployment is missing `SITE_URL`.
 *
 * Unchanged in substance by site-url-preview-aware, deliberately (epic D1). The preview fallback
 * above must not become a reason to stop requiring `SITE_URL` in production: this predicate and
 * that fallback answer two different questions, and production's answer is still "set the variable".
 */
export function isSiteUrlMisconfiguredInProductionEnv(env: SiteUrlEnv): boolean {
  return env.VERCEL_ENV === 'production' && !env.SITE_URL?.trim()
}
