// multi-tenant-activation · Sprint 2, Story 2.1 — fast unit layer for slug derivation.
//
// This module decides SHAPE (uniqueness is the DB's job). Two properties matter most: the
// character set is narrow enough to be safe in a public URL segment (no `+`, `.`, leading hyphen,
// etc. smuggled through from an email local-part), and the structural reserved-word list can never
// be handed out to a self-serve tenant — the module's own comment calls out why that specifically
// matters for the `demo` slug (a stranger registering it would inherit a publicly-readable
// dashboard).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isReservedSlug, normalizeSlug, slugFromEmail } from './tenant-slug.ts'

test('normalizeSlug lowercases', () => {
  assert.equal(normalizeSlug('DanielPerez'), 'danielperez')
})

test('normalizeSlug collapses a run of non-alphanumerics into a single hyphen', () => {
  assert.equal(normalizeSlug('daniel...perez'), 'daniel-perez')
  assert.equal(normalizeSlug('daniel_perez+gb'), 'daniel-perez-gb')
})

test('normalizeSlug trims leading and trailing hyphens', () => {
  assert.equal(normalizeSlug('--daniel--'), 'daniel')
})

test('normalizeSlug: a real email local-part and an already-hyphenated slug land on the same shape', () => {
  assert.equal(normalizeSlug('Daniel.Perez+gb@Example.com'.split('@')[0]), normalizeSlug('daniel-perez-gb'))
})

test('normalizeSlug returns null below the 3-character minimum', () => {
  assert.equal(normalizeSlug('ab'), null)
  assert.equal(normalizeSlug('a'), null)
  assert.equal(normalizeSlug(''), null)
})

test('normalizeSlug returns null for input that is all punctuation (nothing survives normalization)', () => {
  assert.equal(normalizeSlug('---'), null)
  assert.equal(normalizeSlug('...'), null)
})

test('normalizeSlug accepts exactly the 3-character minimum', () => {
  assert.equal(normalizeSlug('abc'), 'abc')
})

test('normalizeSlug truncates to the 40-character maximum', () => {
  const candidate = 'a'.repeat(60)
  const result = normalizeSlug(candidate)
  assert.equal(result?.length, 40)
})

test('normalizeSlug re-trims a trailing hyphen exposed by truncation', () => {
  // 39 a's then a hyphen then more content — truncating at 40 chars lands exactly on the hyphen,
  // which must not survive as a trailing hyphen in the final slug.
  const candidate = 'a'.repeat(39) + '-' + 'bbbbbb'
  const result = normalizeSlug(candidate)
  assert.ok(result !== null)
  assert.ok(!result?.endsWith('-'), `expected no trailing hyphen, got ${JSON.stringify(result)}`)
})

test('isReservedSlug flags structural reservations', () => {
  for (const reserved of ['admin', 'demo', 'app', 'api', 'www', 'signup']) {
    assert.equal(isReservedSlug(reserved), true)
  }
})

test('isReservedSlug does not flag an ordinary tenant-shaped slug', () => {
  assert.equal(isReservedSlug('daniel-perez'), false)
})

test('slugFromEmail uses only the local part, never the domain', () => {
  assert.equal(slugFromEmail('daniel@example.com'), 'daniel')
  assert.equal(slugFromEmail('daniel@golden-beans.com'), 'daniel')
})

test('slugFromEmail normalizes punctuation in the local part the same way normalizeSlug does', () => {
  assert.equal(slugFromEmail('Daniel.Perez+gb@Example.com'), 'daniel-perez-gb')
})

test('slugFromEmail returns null when the local part is too short to survive normalization', () => {
  assert.equal(slugFromEmail('a@b.com'), null)
})

test('slugFromEmail returns null when the local part is entirely punctuation', () => {
  assert.equal(slugFromEmail('--@x.com'), null)
})

test('slugFromEmail returns null when the local part normalizes to a reserved slug', () => {
  assert.equal(slugFromEmail('admin@example.com'), null)
  assert.equal(slugFromEmail('demo@example.com'), null)
})

test('slugFromEmail: two people at the same company get distinct suggestions (domain is ignored)', () => {
  assert.notEqual(slugFromEmail('alice@acme.com'), slugFromEmail('bob@acme.com'))
})
