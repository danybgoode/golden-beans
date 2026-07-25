// Growth Engine v1 · Sprint 4, Story 4.1 — fast unit layer for the FNV-1a bucketing core.
//
// This defends the PROPERTY that makes client-side bucketing usable at all, not the FNV-1a
// arithmetic itself: (1) the same userId+experimentKey always resolves to the same variant, so a
// user doesn't flicker between control/treatment on every page load; (2) the split honors relative
// weights, not just variant count; (3) callers that hand in nothing (or nothing usable) get a null
// they're expected to handle rather than a thrown exception or a silently-wrong default. Previously
// this only had e2e coverage of the SDK's `bucket()` wrapper, which boots a full browser/server pair
// to exercise arithmetic with zero I/O in it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVariant, resolveGovernedVariant, type BucketVariant } from './bucketing.ts'

test('resolveVariant is deterministic: same userId + experimentKey always resolves the same variant', () => {
  const variants: BucketVariant[] = [{ key: 'control' }, { key: 'treatment' }]
  const first = resolveVariant('user-1', 'exp-a', variants)
  for (let i = 0; i < 20; i++) {
    assert.equal(resolveVariant('user-1', 'exp-a', variants), first)
  }
})

test('resolveVariant does not depend on the order variants are passed in', () => {
  const forward = resolveVariant('user-1', 'exp-a', [{ key: 'control' }, { key: 'treatment' }])
  const reversed = resolveVariant('user-1', 'exp-a', [{ key: 'treatment' }, { key: 'control' }])
  assert.equal(forward, reversed)
})

test('resolveVariant spreads different userIds across variants, not onto a single one', () => {
  const variants: BucketVariant[] = [{ key: 'control' }, { key: 'treatment' }]
  const seen = new Set<string | null>()
  for (let i = 0; i < 200; i++) {
    seen.add(resolveVariant(`user-${i}`, 'exp-a', variants))
  }
  // Not asserting an exact ratio here (that's the weighted-distribution test below) — just that
  // 200 distinct users don't all collapse onto one variant, which would mean the hash isn't being
  // used at all (e.g. a stub that always returns variants[0]).
  assert.equal(seen.size, 2)
})

test('resolveVariant respects relative weights over many userIds (not an equal split)', () => {
  const variants: BucketVariant[] = [
    { key: 'a', weight: 1 },
    { key: 'b', weight: 3 },
  ]
  const counts = { a: 0, b: 0 }
  const n = 4000
  for (let i = 0; i < n; i++) {
    const variant = resolveVariant(`user-${i}`, 'exp-weighted', variants)
    if (variant === 'a' || variant === 'b') counts[variant]++
  }
  assert.equal(counts.a + counts.b, n)
  // Expected split is 25/75. Generous tolerance (+/-7pp) — this is a deterministic hash, not a
  // random draw, so it will never be flaky, but the exact ratio depends on FNV-1a's spread and
  // shouldn't be pinned to the bit.
  const bRatio = counts.b / n
  assert.ok(bRatio > 0.68 && bRatio < 0.82, `expected b (weight 3 of 4) near 75%, got ${bRatio}`)
})

test('resolveVariant treats an omitted weight as 1 (equal split against an explicit weight: 1)', () => {
  const explicit = resolveVariant('user-7', 'exp-b', [
    { key: 'a', weight: 1 },
    { key: 'b', weight: 1 },
  ])
  const implicit = resolveVariant('user-7', 'exp-b', [{ key: 'a' }, { key: 'b' }])
  assert.equal(explicit, implicit)
})

test('resolveVariant returns null for an empty variant list', () => {
  assert.equal(resolveVariant('user-1', 'exp-a', []), null)
})

test('resolveVariant returns null when every weight is zero or negative', () => {
  assert.equal(
    resolveVariant('user-1', 'exp-a', [
      { key: 'a', weight: 0 },
      { key: 'b', weight: -1 },
    ]),
    null
  )
})

test('resolveVariant drops zero/negative-weight variants but still resolves among the rest', () => {
  const variants: BucketVariant[] = [
    { key: 'dead', weight: 0 },
    { key: 'alive', weight: 1 },
  ]
  assert.equal(resolveVariant('user-1', 'exp-a', variants), 'alive')
})

test('resolveVariant ignores variants with an empty key', () => {
  const variants: BucketVariant[] = [
    { key: '', weight: 100 },
    { key: 'real', weight: 1 },
  ]
  assert.equal(resolveVariant('user-1', 'exp-a', variants), 'real')
})

test('resolveVariant changing the experimentKey can change the assigned variant (not user-only)', () => {
  // 8 variants and 20 distinct keys: even if experimentKey were IGNORED (a userId-only hash bug),
  // every key would collapse onto the SAME single variant. With experimentKey actually mixed in,
  // the chance of 20 independent draws from 8 buckets landing on just one value is astronomically
  // small (1/8)^19 — this is a real property assertion, not a coin flip, unlike a 2-variant/5-key
  // version of the same test.
  const variants: BucketVariant[] = Array.from({ length: 8 }, (_, i) => ({ key: `v${i}` }))
  const seenAcrossKeys = new Set<string | null>()
  for (let i = 0; i < 20; i++) {
    seenAcrossKeys.add(resolveVariant('same-user', `exp-${i}`, variants))
  }
  assert.ok(seenAcrossKeys.size > 1, 'expected varying the experimentKey to vary the outcome')
})

test('resolveGovernedVariant is deterministic for a fixed entity/experiment/version tuple', () => {
  const variants: BucketVariant[] = [{ key: 'control' }, { key: 'treatment' }]
  const first = resolveGovernedVariant('project', 'proj-1', 'exp-a', 3, variants)
  for (let i = 0; i < 10; i++) {
    assert.equal(resolveGovernedVariant('project', 'proj-1', 'exp-a', 3, variants), first)
  }
})

test('resolveGovernedVariant changes when definitionVersion changes (re-randomization is intentional)', () => {
  // Same reasoning as the experimentKey test above: 8 variants x 20 versions makes an accidental
  // all-same-bucket result vanishingly unlikely, so a real "> 1 distinct outcome" failure means the
  // version is actually not being mixed into the seed, not bad luck.
  const variants: BucketVariant[] = Array.from({ length: 8 }, (_, i) => ({ key: `v${i}` }))
  const seenAcrossVersions = new Set<string | null>()
  for (let version = 0; version < 20; version++) {
    seenAcrossVersions.add(resolveGovernedVariant('project', 'proj-1', 'exp-a', version, variants))
  }
  assert.ok(seenAcrossVersions.size > 1, 'expected bumping definitionVersion to be able to re-bucket')
})

test('resolveGovernedVariant is sensitive to assignmentEntityType, not just assignmentEntityId', () => {
  // The tuple encoding is JSON.stringify([type, id, key, version]) specifically so that a
  // ("project", id) pairing and a ("user", id) pairing with the SAME id land on different seeds —
  // a naive colon-join ("project:1:exp-a:1" vs "user:1:exp-a:1") would too, but only by accident of
  // string length; JSON encoding is the actual guarantee. Eight variants keeps the false-negative
  // rate (two different seeds happening to hash into the same bucket) low across the sample.
  const variants: BucketVariant[] = Array.from({ length: 8 }, (_, i) => ({ key: `v${i}` }))
  let differed = 0
  const samples = 20
  for (let i = 0; i < samples; i++) {
    const asProject = resolveGovernedVariant('project', `id-${i}`, 'exp-a', 1, variants)
    const asUser = resolveGovernedVariant('user', `id-${i}`, 'exp-a', 1, variants)
    if (asProject !== asUser) differed++
  }
  assert.ok(
    differed > samples * 0.5,
    `expected entityType to change the outcome most of the time, differed ${differed}/${samples}`
  )
})

test('resolveGovernedVariant null-handling matches resolveVariant for an empty variant list', () => {
  assert.equal(resolveGovernedVariant('project', 'proj-1', 'exp-a', 1, []), null)
})
