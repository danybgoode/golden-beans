// site-url-preview-aware · Sprint 1, Story 1.1 — the resolution order, pinned.
//
// This is the seam behind EVERY absolute URL this app builds — ~20 call sites including auth
// redirects, the signup email's redirect target, report share links and the MCP connector URL. It
// gained a branch, and a branch here that fires in the wrong environment is not a cosmetic bug: it
// is a wrong hostname baked into something a person keeps.
//
// The property that matters most is the NEGATIVE one, and it is asserted first: production with no
// `SITE_URL` must NOT fall through to the deployment's own hostname. Silently serving
// `golden-beans-xyz.vercel.app` in place of `goldenfrijoles.com` would be worse than the localhost
// bug this epic fixes, precisely because it looks plausible.
//
// No `process.env` mutation anywhere in this file: `resolveSiteUrl` takes an environment, so every
// case is an argument. That is a second benefit of the split — `node --test` shares one process
// across files, and an env-stubbing suite that throws mid-test leaks into every other suite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSiteUrlMisconfiguredInProductionEnv, resolveSiteUrl } from './site-url-resolve.ts'

test('SITE_URL wins over everything, including a present preview hostname', () => {
  assert.equal(
    resolveSiteUrl({
      SITE_URL: 'https://goldenfrijoles.com',
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'branch.vercel.app',
      VERCEL_URL: 'deployment.vercel.app',
    }),
    'https://goldenfrijoles.com'
  )
})

test('production without SITE_URL falls to localhost, NEVER to the deployment hostname', () => {
  // Epic D1, and the single most important assertion in this file. A production deploy that has
  // lost SITE_URL must stay broken in a way somebody notices — and the misconfiguration predicate
  // is what notices. If this ever returns a *.vercel.app URL, that guard has been bypassed and
  // production is quietly serving the wrong canonical host to every reader.
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_BRANCH_URL: 'branch.vercel.app',
    VERCEL_URL: 'dep.vercel.app',
  }
  assert.equal(resolveSiteUrl(env), 'http://localhost:3000')
  assert.equal(isSiteUrlMisconfiguredInProductionEnv(env), true, 'and the misconfiguration is loud')
})

test('a preview deployment uses its BRANCH url, which survives the next push', () => {
  // Epic D3: preferred over VERCEL_URL precisely because these surfaces hand a URL to a person to
  // paste somewhere, and the deployment URL changes on every push.
  assert.equal(
    resolveSiteUrl({
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'gb-git-feat-x.vercel.app',
      VERCEL_URL: 'gb-abc123.vercel.app',
    }),
    'https://gb-git-feat-x.vercel.app'
  )
})

test('a preview with only VERCEL_URL still beats localhost', () => {
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'gb-abc123.vercel.app' }),
    'https://gb-abc123.vercel.app'
  )
})

test('a preview with neither hostname falls back rather than building "https://undefined"', () => {
  // The failure this prevents is a plausible-looking absolute URL with a garbage host, which is
  // exactly what a naive `https://${env.VERCEL_URL}` produces when the variable is absent.
  assert.equal(resolveSiteUrl({ VERCEL_ENV: 'preview' }), 'http://localhost:3000')
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: '  ', VERCEL_URL: '' }),
    'http://localhost:3000'
  )
})

test('development and CI are untouched — no VERCEL_ENV means localhost', () => {
  assert.equal(resolveSiteUrl({}), 'http://localhost:3000')
  assert.equal(isSiteUrlMisconfiguredInProductionEnv({}), false)

  // `next start` sets NODE_ENV=production in CI and locally, which is why this keys off VERCEL_ENV.
  // Asserted so a future refactor back to NODE_ENV fails here rather than in production.
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'development', VERCEL_URL: 'should-not-be-used.vercel.app' }),
    'http://localhost:3000'
  )
})

test('both sources are normalised the same way', () => {
  // A normalisation covering one branch and not the other is the shape of bug this module exists to
  // prevent, so both are asserted rather than just the one that had it first.
  assert.equal(
    resolveSiteUrl({ SITE_URL: '  https://goldenfrijoles.com///  ' }),
    'https://goldenfrijoles.com'
  )
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: ' gb-git-feat-x.vercel.app/ ' }),
    'https://gb-git-feat-x.vercel.app'
  )
})

test('an empty-string SITE_URL is treated as unset, not as a base URL', () => {
  // `vercel env add` piped from `echo -n` has silently saved an EMPTY value in this project before
  // (AGENTS.md). An empty SITE_URL must not resolve to '' and turn every absolute URL relative.
  assert.equal(
    resolveSiteUrl({ SITE_URL: '   ', VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'gb-git-feat-x.vercel.app' }),
    'https://gb-git-feat-x.vercel.app'
  )
  assert.equal(isSiteUrlMisconfiguredInProductionEnv({ VERCEL_ENV: 'production', SITE_URL: '   ' }), true)
})

test('a hostname that already carries a scheme does not become https://https://', () => {
  // Vercel sets these bare, but a custom preview runner or a local reproduction can populate them
  // by hand. `https://${host}` on an already-schemed value produces a string that parses as a URL
  // and points nowhere — plausible enough to survive review. (agy, PR #116.)
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'https://gb-git-feat-x.vercel.app' }),
    'https://gb-git-feat-x.vercel.app'
  )
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'http://gb-abc123.vercel.app/' }),
    'https://gb-abc123.vercel.app'
  )
})

test('an UPPERCASE scheme is stripped too', () => {
  // URL schemes are case-insensitive (RFC 3986). The same class as the host matcher that let
  // `HTTPS://` walk past a case-sensitive check in agentic-pm-public-surface.
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'HTTPS://gb-git-feat-x.vercel.app' }),
    'https://gb-git-feat-x.vercel.app'
  )
})
