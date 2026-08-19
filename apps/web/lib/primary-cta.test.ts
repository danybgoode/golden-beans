// Both branches of the CTA destination, asserted directly.
//
// The browser spec covers this too, but only in whichever `SIGNUP_ENABLED` state the server under
// test happens to be running in — so on any given run it proves one branch and silently skips the
// other. That is the shape of a test that looks like coverage and is not (CODE-QUALITY #5), and it
// was caught by Codex in cross-family review of PR #100.
//
// `primaryCtaHref` is pure precisely so this is possible without a server or an env var.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRICING_ANCHOR, primaryCtaHref } from './primary-cta.ts'

test('with signup open, the CTA goes to the real signup route', () => {
  assert.equal(primaryCtaHref(true), '/signup')
})

// The branch that matters most, and the one a local run never exercises: with the gate off there
// is no `/signup` route at all, so this is the difference between a CTA and a 404.
test('with signup gated off, the CTA falls back to pricing rather than a dead route', () => {
  assert.equal(primaryCtaHref(false), PRICING_ANCHOR)
  assert.notEqual(primaryCtaHref(false), '/signup')
})

// The round-2 defect, pinned. `Nav` renders this CTA on `/talk` as well as on `/`, so a BARE
// `#pricing` would be inert there — the primary action on the page, doing nothing. Asserting the
// leading slash rather than the whole string keeps this about the property (resolves from any
// route) rather than about the exact section id.
test('the gated-off fallback resolves from any route, not just the landing page', () => {
  const href = primaryCtaHref(false)
  assert.ok(
    href.startsWith('/'),
    `"${href}" resolves against the current page — inert anywhere but the landing route`
  )
})

// The mockup pointed every CTA at `#start`, an anchor with nothing behind it. Neither branch may
// ever reproduce that.
test('neither branch is an empty or dead anchor', () => {
  for (const enabled of [true, false]) {
    const href = primaryCtaHref(enabled)
    assert.ok(href.length > 1, `empty href for signupEnabled=${enabled}`)
    assert.notEqual(href, '#start')
  }
})
