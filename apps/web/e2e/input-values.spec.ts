import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 3.3 (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md) —
// POST /v1/inputs/:key/values. Synthetic data only — no live Miyagi credentials in CI
// (see scripts/sync-revenue-from-miyagi.mjs, which isn't part of this gate either).
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function defineInput(
  request: import('@playwright/test').APIRequestContext,
  inputKey: string,
  valueSource: 'external_push' | 'telemetry_event',
) {
  const res = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `values-spec-metric-${Date.now()}`, name: 'Spec Metric' },
      inputs: [
        valueSource === 'telemetry_event'
          ? { key: inputKey, name: 'Spec Input', valueSource, sourceEvent: 'spec_event' }
          : { key: inputKey, name: 'Spec Input', valueSource },
      ],
    },
  })
  expect(res.status()).toBe(200)
}

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/inputs/some_input/values', {
    data: { values: [{ occurredOn: '2026-01-01', value: 100 }] },
  })
  expect(res.status()).toBe(401)
})

test('malformed body (bad date format) → 400', async ({ request }) => {
  const inputKey = `values-spec-bad-date-${Date.now()}`
  await defineInput(request, inputKey, 'external_push')
  const res = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { values: [{ occurredOn: 'not-a-date', value: 100 }] },
  })
  expect(res.status()).toBe(400)
})

test('pushing to an unknown input → 404', async ({ request }) => {
  const res = await request.post(`/api/v1/inputs/nonexistent-${Date.now()}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { values: [{ occurredOn: '2026-01-01', value: 100 }] },
  })
  expect(res.status()).toBe(404)
})

test('pushing to a telemetry_event-sourced input → 400 (those are computed, never pushed)', async ({ request }) => {
  const inputKey = `values-spec-telemetry-${Date.now()}`
  await defineInput(request, inputKey, 'telemetry_event')
  const res = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { values: [{ occurredOn: '2026-01-01', value: 100 }] },
  })
  expect(res.status()).toBe(400)
})

test('duplicate occurredOn dates in one payload → 400', async ({ request }) => {
  const inputKey = `values-spec-dup-date-${Date.now()}`
  await defineInput(request, inputKey, 'external_push')
  const res = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      values: [
        { occurredOn: '2026-01-01', value: 100 },
        { occurredOn: '2026-01-01', value: 200 },
      ],
    },
  })
  expect(res.status()).toBe(400)
})

test('valid push appends real rows, and re-pushing the same day is an idempotent no-op (never a duplicate)', async ({
  request,
}) => {
  const inputKey = `values-spec-push-${Date.now()}`
  await defineInput(request, inputKey, 'external_push')

  const first = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      values: [
        { occurredOn: '2026-01-01', value: 150.5 },
        { occurredOn: '2026-01-02', value: 200.0 },
      ],
    },
  })
  expect(first.status()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.ok).toBe(true)
  expect(firstBody.inserted).toBe(2)
  expect(firstBody.skippedDuplicates).toBe(0)

  const db = dbClient()
  const { data: input } = await db.from('leading_inputs').select('id').eq('key', inputKey).single()
  const { data: rows } = await db
    .from('input_values')
    .select('occurred_on, value')
    .eq('input_id', input!.id)
    .order('occurred_on')
  expect(rows).toHaveLength(2)
  expect(Number(rows![0].value)).toBe(150.5)
  expect(Number(rows![1].value)).toBe(200.0)

  // Re-push day 1 (idempotent no-op) + a genuinely new day 3.
  const second = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      values: [
        { occurredOn: '2026-01-01', value: 999 }, // duplicate day — must be skipped, not overwritten
        { occurredOn: '2026-01-03', value: 300.0 },
      ],
    },
  })
  expect(second.status()).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.inserted).toBe(1)
  expect(secondBody.skippedDuplicates).toBe(1)

  const { data: rowsAfter } = await db
    .from('input_values')
    .select('occurred_on, value')
    .eq('input_id', input!.id)
    .order('occurred_on')
  expect(rowsAfter).toHaveLength(3) // no duplicate row for 2026-01-01
  expect(Number(rowsAfter![0].value)).toBe(150.5) // unchanged — the re-push value (999) never applied
})

test("tenant isolation: project-two cannot push to project-one's input", async ({ request }) => {
  const inputKey = `values-spec-isolation-${Date.now()}`
  await defineInput(request, inputKey, 'external_push') // defined under project-one

  const res = await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: { values: [{ occurredOn: '2026-01-01', value: 100 }] },
  })
  expect(res.status()).toBe(404) // project-two has no input by this key, even though project-one does
})

test('input_values rows cannot be mutated after the fact (append-only trigger)', async ({ request }) => {
  const inputKey = `values-spec-mutation-guard-${Date.now()}`
  await defineInput(request, inputKey, 'external_push')
  await request.post(`/api/v1/inputs/${inputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { values: [{ occurredOn: '2026-02-01', value: 500 }] },
  })

  const db = dbClient()
  const { data: input } = await db.from('leading_inputs').select('id').eq('key', inputKey).single()
  const { error } = await db.from('input_values').update({ value: 1 }).eq('input_id', input!.id)
  expect(error).not.toBeNull() // the BEFORE UPDATE trigger must reject this
})
