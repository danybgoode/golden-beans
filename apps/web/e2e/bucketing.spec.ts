import { test, expect } from '@playwright/test'
import { createGrowthEngineClient } from '@golden-beans/sdk'

// Story 4.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md) — deterministic client-side
// hash bucketing. No network involved (bucket() is synchronous), so this spec never touches
// `/api/v1/track` — it's a pure-logic check run under the `api` project per house convention
// (see tars.spec.ts, which does the same for computeTars).
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

function client(userId: string) {
  return createGrowthEngineClient({ baseUrl: 'http://unused.invalid', apiKey: PROJECT_ONE_KEY, userId })
}

test('bucket() is synchronous — no Promise, no await needed', () => {
  const growth = client('bucketing-spec-user-sync')
  const result = growth.bucket('exp-sync-check', [{ key: 'control' }, { key: 'treatment' }])
  // If bucket() returned a Promise this would be `[object Promise]`, not `ok`/`variant`.
  expect(result).not.toBeInstanceOf(Promise)
  expect(result.ok).toBe(true)
})

test('same userId + experimentKey always resolves to the same variant', () => {
  const variants = [{ key: 'control' }, { key: 'treatment' }]
  const growth = client('bucketing-spec-user-1')

  const first = growth.bucket('checkout-cta-copy', variants)
  const second = growth.bucket('checkout-cta-copy', variants)
  const third = growth.bucket('checkout-cta-copy', variants)

  expect(first).toEqual(second)
  expect(second).toEqual(third)
})

test('resolution is stable regardless of the order variants are passed in', () => {
  const growth = client('bucketing-spec-user-2')
  const a = growth.bucket('order-check', [{ key: 'control' }, { key: 'treatment' }])
  const b = growth.bucket('order-check', [{ key: 'treatment' }, { key: 'control' }])
  expect(a).toEqual(b)
})

test('different users can land in different variants (spread sanity check)', () => {
  const variants = [{ key: 'control' }, { key: 'treatment' }]
  const results = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const growth = client(`bucketing-spec-spread-user-${i}`)
    const result = growth.bucket('spread-check', variants)
    if (result.ok) results.add(result.variant)
  }
  // With 50 distinct users over 2 equal-weight variants, both should appear at least once.
  expect(results.size).toBe(2)
})

test('empty variant list → ok:false, extensible envelope (not a bare boolean)', () => {
  const growth = client('bucketing-spec-user-3')
  const result = growth.bucket('empty-check', [])
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(typeof result.error).toBe('string')
    expect(result.code).toBe('INVALID_VARIANTS')
  }
})

test('a variant list where every weight is 0 → ok:false', () => {
  const growth = client('bucketing-spec-user-4')
  const result = growth.bucket('zero-weight-check', [
    { key: 'control', weight: 0 },
    { key: 'treatment', weight: 0 },
  ])
  expect(result.ok).toBe(false)
})

test('a single variant always resolves to itself', () => {
  const growth = client('bucketing-spec-user-5')
  const result = growth.bucket('single-variant-check', [{ key: 'only' }])
  expect(result).toEqual({ ok: true, variant: 'only' })
})
