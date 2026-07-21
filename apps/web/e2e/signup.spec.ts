import { test, expect } from '@playwright/test'
import { isSignupEnabled } from '../lib/flags'
import { slugFromEmail, normalizeSlug, isReservedSlug } from '../lib/tenant-slug'
import { monthWindowStart, monthWindowEnd } from '../lib/quota-window'

// multi-tenant-activation · Sprint 2 — Stories 2.1 + 2.2.
//
// READ THIS BEFORE ADDING AN HTTP SPEC HERE. The gate is OFF in CI and in local dev (it is born
// unset), so the ONLY signup behaviour an HTTP-level spec can reach is the 404. Everything past
// the gate — provisioning, slug collision handling, the owner membership — sits behind a real
// email round-trip this harness cannot perform.
//
// That is exactly the structural trap Roadmap/LEARNINGS.md records from S1: four HTTP specs
// asserting an open-redirect guard all passed against a DELIBERATELY VULNERABLE build, because
// the guard sat behind an auth precondition the requests never satisfied. The specs looked
// correct and CI was green, and the vulnerability was live.
//
// So the rule applied here: anything security- or correctness-critical downstream of the gate is
// extracted into a PURE, ZERO-IMPORT module (lib/tenant-slug.ts, lib/quota.ts's window maths,
// lib/flags.ts) and asserted DIRECTLY below — not inferred from an HTTP status that would be
// identical whether the logic were right or wrong.

test.describe('isSignupEnabled — dark by default', () => {
  test('unset/anything-but-"true" → disabled', () => {
    const original = process.env.SIGNUP_ENABLED
    try {
      delete process.env.SIGNUP_ENABLED
      expect(isSignupEnabled()).toBe(false)
      // The polarity cases that matter: an enablement gate must not open on a typo, and the
      // strings people actually type when they mean "off" must all read as off.
      for (const off of ['false', '0', 'off', 'no', 'TRUE', 'True', ' true', '']) {
        process.env.SIGNUP_ENABLED = off
        expect(isSignupEnabled(), `SIGNUP_ENABLED=${JSON.stringify(off)} must be OFF`).toBe(false)
      }
      process.env.SIGNUP_ENABLED = 'true'
      expect(isSignupEnabled()).toBe(true)
    } finally {
      if (original === undefined) delete process.env.SIGNUP_ENABLED
      else process.env.SIGNUP_ENABLED = original
    }
  })
})

test.describe('POST /api/v1/public/signup — while the gate is dark', () => {
  // The whole route is 404 while dark, and that is asserted BEFORE the shape checks below so a
  // future reader can't mistake those 404s for validation behaviour.
  test('gate off → 404, and no validation happens first', async ({ request }) => {
    test.skip(isSignupEnabled(), 'gate is ON in this environment — the dark-path spec cannot run')

    // A well-formed payload, a malformed one, and an empty one must be INDISTINGUISHABLE. If the
    // route validated before gating, the malformed body would 400 and leak that the route exists.
    for (const data of [
      { email: 'someone@example.com', password: 'correct horse battery staple' },
      { email: 'not-an-email', password: 'x' },
      {},
    ]) {
      const res = await request.post('/api/v1/public/signup', { data })
      expect(res.status(), `payload ${JSON.stringify(data)} must 404 while dark`).toBe(404)
    }
  })

  test('gate off → the /signup page does not exist either', async ({ request }) => {
    test.skip(isSignupEnabled(), 'gate is ON in this environment — the dark-path spec cannot run')
    const res = await request.get('/signup')
    expect(res.status()).toBe(404)
  })
})

test.describe('slugFromEmail — what a stranger can name their tenant', () => {
  test('normalizes to a URL-safe shape', () => {
    expect(slugFromEmail('Daniel.Perez+gb@Example.com')).toBe('daniel-perez-gb')
    expect(slugFromEmail('someone@example.com')).toBe('someone')
    expect(slugFromEmail('a_b_c@example.com')).toBe('a-b-c')
  })

  test('never emits a leading/trailing hyphen or a double hyphen', () => {
    for (const email of ['--danny--@x.com', 'a...b@x.com', '.hello.@x.com']) {
      const slug = slugFromEmail(email)
      if (slug === null) continue
      expect(slug, email).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  test('returns null rather than something unusable', () => {
    // Too short, and all-punctuation. The caller MUST handle null with a generated fallback — a
    // confirmed signup can never be failed because of the shape of someone's email address.
    expect(slugFromEmail('a@b.com')).toBeNull()
    expect(slugFromEmail('...@b.com')).toBeNull()
    expect(slugFromEmail('@b.com')).toBeNull()
  })

  test('the DOMAIN never reaches the slug', () => {
    // Two people at the same company must not fight over their shared domain, and a corporate
    // domain must never become a slug that reads like an official tenant of that company.
    expect(slugFromEmail('bob@bigcorp.com')).toBe('bob')
    expect(slugFromEmail('bob@bigcorp.com')).not.toContain('bigcorp')
  })

  test('reserved names are refused — the demo-slug hijack is the one that matters', () => {
    // AGENTS rule #2: assertPublicAllowedSlug gates the public demo BY SLUG. A stranger who could
    // register a reserved/demo-shaped name would inherit a publicly-readable dashboard.
    expect(isReservedSlug('demo')).toBe(true)
    expect(isReservedSlug('golden-beans')).toBe(true)
    expect(isReservedSlug('admin')).toBe(true)
    expect(isReservedSlug('api')).toBe(true)
    expect(isReservedSlug('app')).toBe(true)
    // slugFromEmail must refuse them too, not merely flag them.
    expect(slugFromEmail('admin@example.com')).toBeNull()
    expect(slugFromEmail('golden-beans@example.com')).toBeNull()
  })

  test('length is bounded', () => {
    const slug = normalizeSlug('x'.repeat(500))
    expect(slug).not.toBeNull()
    expect(slug!.length).toBeLessThanOrEqual(40)
  })
})

test.describe('monthly quota window — the calendar maths', () => {
  // This is asserted directly because it is the exact bug that WAS written and caught during the
  // build: the first implementation floored Date.now() by "milliseconds in this month", which
  // lands on an arbitrary multiple of that duration since the Unix epoch — NOT on the first of
  // the month. Every quota would have reset on a wandering date matching no calendar. An HTTP
  // spec would never have seen it; the counter still counts, just against the wrong bucket.
  test('window starts at midnight UTC on the 1st', () => {
    const start = monthWindowStart(new Date('2026-07-20T13:45:12.345Z'))
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  test('the last instant of a month still belongs to that month', () => {
    const start = monthWindowStart(new Date('2026-07-31T23:59:59.999Z'))
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  test('December rolls into the next January, not into month 13', () => {
    const start = monthWindowStart(new Date('2026-12-14T00:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(monthWindowEnd(start).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  test('February is 28 or 29 days — never a fixed 30-day slice', () => {
    const leap = monthWindowStart(new Date('2028-02-10T00:00:00.000Z'))
    expect(monthWindowEnd(leap).toISOString()).toBe('2028-03-01T00:00:00.000Z')
    const nonLeap = monthWindowStart(new Date('2026-02-10T00:00:00.000Z'))
    expect(monthWindowEnd(nonLeap).toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})
