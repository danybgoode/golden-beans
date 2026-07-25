// multi-tenant-activation · Sprint 1, Story 1.1 — fast unit layer for the open-redirect guard.
//
// This module exists because of a REAL vulnerability (cross-review, Codex, 2026-07-20): a naive
// `startsWith('/') && !startsWith('//')` prefix check lets `/\evil.example` through, because
// `new URL()` normalizes the leading backslash into `//` and resolves to a different origin. The
// e2e suite (apps/web/e2e/app-auth.spec.ts) already asserts this module directly rather than over
// HTTP, for a documented reason (Roadmap/LEARNINGS.md): the auth-callback route only consults
// `next` AFTER a successful code exchange, so an HTTP-level spec structurally cannot reach this
// branch, and an earlier HTTP-level version of these assertions passed identically against a
// deliberately vulnerable build. This file duplicates that direct-assertion strategy in the fast
// layer — same cases, same discipline, now runnable in milliseconds without a Playwright browser.
//
// The invariant under test throughout: for ANY input, the returned string's ORIGIN must equal
// baseUrl's origin. That's the actual guarantee the function makes — stronger than "doesn't
// contain the string evil.example", which a same-origin path that happens to mention evil.example
// (e.g. after a Unicode-whitespace edge case) would wrongly fail.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirectPath } from './safe-redirect.ts'

const base = 'https://golden-beans-gamma.vercel.app'
const baseOrigin = new URL(base).origin

function assertOnOrigin(result: string) {
  assert.equal(new URL(result).origin, baseOrigin, `expected ${result} to stay on ${baseOrigin}`)
}

// Every one of these is a documented or closely-related open-redirect bypass attempt. Each MUST
// fall back to the exact default landing page — not just "some on-origin URL" — because none of
// them is a legitimate destination.
const hostileInputsFallToDefault = [
  ['//evil.example', 'bare protocol-relative URL'],
  ['/\\evil.example', 'the exact Codex-caught bypass: backslash normalizes to // via new URL()'],
  ['/\\/evil.example', 'backslash + slash variant of the same bypass'],
  ['\\/\\/evil.example', 'both slashes replaced by backslashes'],
  ['https://evil.example', 'absolute URL to a foreign origin'],
  ['///evil.example', 'triple-slash variant'],
  ['javascript:alert(1)', 'non-http(s) scheme — opaque origin, must never match'],
  ['https://golden-beans-gamma.vercel.app.evil.example/x', 'prefix-lookalike host (subdomain trick)'],
  ['https://golden-beans-gamma.vercel.app@evil.example/', 'userinfo trick — host is actually evil.example'],
  [' //evil.example', 'leading ASCII space + protocol-relative (WHATWG URL trims ASCII whitespace)'],
  ['//evil.example ', 'trailing ASCII space + protocol-relative'],
  ['\t/\\evil.example', 'tab-prefixed backslash bypass'],
  ['\n/\\evil.example', 'newline-prefixed backslash bypass'],
  ['\r/\\evil.example', 'carriage-return-prefixed backslash bypass'],
  ['http://[invalid', 'malformed URL that throws inside new URL() — must hit the catch, not crash'],
  ['', 'empty string — falsy, same branch as null'],
] as const

for (const [hostile, why] of hostileInputsFallToDefault) {
  test(`safeRedirectPath falls back to the default landing for: ${JSON.stringify(hostile)} (${why})`, () => {
    const result = safeRedirectPath(hostile, base)
    assert.equal(result, `${base}/app`)
    assertOnOrigin(result)
  })
}

test('safeRedirectPath handles Unicode whitespace by staying on-origin (WHATWG URL does not trim it)', () => {
  // Non-ASCII whitespace (NBSP, LINE SEPARATOR) is NOT stripped by the URL parser the way ASCII
  // space/tab/newline is, so it becomes a literal (percent-encoded) path segment rather than being
  // trimmed away to reveal a bare `//evil.example`. The safety property that matters is still
  // origin equality, NOT "does not contain the substring evil.example" — this legitimately resolves
  // to an on-origin path that happens to contain that text, and that is fine.
  const nbspPrefixed = safeRedirectPath(' //evil.example', base)
  assertOnOrigin(nbspPrefixed)

  const lineSeparatorPrefixed = safeRedirectPath(' //evil.example', base)
  assertOnOrigin(lineSeparatorPrefixed)
})

test('safeRedirectPath allows a genuine same-origin relative path', () => {
  assert.equal(safeRedirectPath('/app/keys/my-project', base), `${base}/app/keys/my-project`)
})

test('safeRedirectPath allows an absolute URL that is genuinely same-origin', () => {
  assert.equal(safeRedirectPath(`${base}/app/funnel/x/y`, base), `${base}/app/funnel/x/y`)
})

test('safeRedirectPath falls back to the default landing when nextParam is null', () => {
  assert.equal(safeRedirectPath(null, base), `${base}/app`)
})

test('safeRedirectPath honors a custom fallbackPath', () => {
  assert.equal(safeRedirectPath(null, base, '/onboarding'), `${base}/onboarding`)
  assert.equal(safeRedirectPath('https://evil.example', base, '/onboarding'), `${base}/onboarding`)
})

test('safeRedirectPath preserves query strings and hash fragments on a legitimate same-origin path', () => {
  assert.equal(
    safeRedirectPath('/app/funnel/x?tab=summary#section-2', base),
    `${base}/app/funnel/x?tab=summary#section-2`
  )
})
