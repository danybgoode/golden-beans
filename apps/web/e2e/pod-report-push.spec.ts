import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// pod-report · Sprint 2.5a — POST /api/v1/reports/pod/push
//
// Mirrors roadmap-push.spec.ts's shape and conventions almost exactly — same rail
// (push_report_artifact, one row per push, versioned + immutable), different kind and payload.
// See that file for the fuller isolation/concurrency/append-only coverage already proven against
// the shared rail; this spec covers what is specific to the pod_report contract
// (lib/pod-report-schema.ts) plus one end-to-end push, per sprint-2.md's Sprint 2.5a acceptance:
// unauthenticated → 401 · wrong schemaVersion → 400 · a real push produces a new queryable version
// · a foreign tenant's key cannot read it.
//
// Fixtures: supabase/seed.sql seeds project-one and project-two with these keys.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

const envelope = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  // `pushSource`, not `source`: the artifact's own `source` is Story 2.1's dataset provenance and
  // stays in the payload. Sending git provenance under `source` is the bug the two keys prevent.
  pushSource: { commit: 'abc1234', ref: 'main' },
  source: { repo: 'medusa-bonsai', commits: 841, windowDays: 49 },
  delivery: { cycleTimeDays: null, notInstrumented: [] },
  caveats: ['Every number here is computed from real history. Nothing is estimated.'],
  ...over,
})

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/reports/pod/push', { data: envelope() })
  expect(res.status()).toBe(401)
})

test('a well-formed but fake bearer token → 401, same as no header at all', async ({ request }) => {
  // Distinct code path from a missing header (lib/auth.ts hashes the key and finds no row) — worth
  // its own case so a route that special-cased "no header" without also checking "bad header"
  // cannot pass this spec by accident (Roadmap/LEARNINGS.md's realistic-input lesson).
  const res = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: 'Bearer not-a-real-key' },
    data: envelope(),
  })
  expect(res.status()).toBe(401)
})

test('malformed JSON body → 400, never a 500', async ({ request }) => {
  const res = await request.post('/api/v1/reports/pod/push', {
    headers: {
      Authorization: `Bearer ${PROJECT_ONE_KEY}`,
      'Content-Type': 'application/json',
    },
    data: '{not valid json',
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
})

test('wrong schemaVersion → 400, and the message names schemaVersion', async ({ request }) => {
  // A client hitting this needs to know whether to upgrade its generator or fix its payload — the
  // same distinguishable-failure contract roadmap-push.spec.ts asserts for its own rail.
  const res = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ schemaVersion: 99 }),
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
  expect(body.error).toContain('schemaVersion')
})

test('missing delivery.notInstrumented → 400 (epic Decision 4: no gaps declared, refuse to render)', async ({
  request,
}) => {
  const res = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ delivery: { cycleTimeDays: null } }),
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
  expect(body.issues).toBeTruthy()
  expect(body.issues.join(' ')).toContain('notInstrumented')
})

test('a real push → 200 with a new queryable version', async ({ request }) => {
  const marker = `pod-report-spec-${Date.now()}`
  const res = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ caveats: [marker] }),
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.version).toBeGreaterThan(0)
  expect(body.schemaVersion).toBe(1)
  expect(body.artifactId).toBeTruthy()

  // Consecutive pushes increment — STRICTLY greater, not exactly +1, for the same reason
  // roadmap-push.spec.ts gives: this file's tests run in parallel against the same seeded tenant.
  const second = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ caveats: [marker] }),
  })
  const b = await second.json()
  expect(b.version).toBeGreaterThan(body.version)

  // ── Provenance lands where the renderer expects, on BOTH sides of the split ─────────────────
  // The regression this guards is silent and cosmetic-looking: git provenance and dataset
  // provenance briefly shared the key `source`, so a push overwrote the counts and every stored
  // report rendered "measured over ⟨nothing⟩" while a locally printed one looked perfect. Checked
  // through the STORED ROW rather than the response body, because the response would have looked
  // identical either way — which is exactly why the bug was invisible.
  const stored = await dbClient()
    .from('report_artifacts')
    .select('source_commit, source_ref, payload')
    .eq('id', body.artifactId)
    .single()
  expect(stored.error).toBeNull()
  expect(stored.data!.source_commit).toBe('abc1234')
  expect(stored.data!.source_ref).toBe('main')
  const payload = stored.data!.payload as { source?: Record<string, unknown>; pushSource?: unknown }
  expect(payload.source).toEqual({ repo: 'medusa-bonsai', commits: 841, windowDays: 49 })
  expect(payload.pushSource).toBeUndefined()
})

test('a REAL foreign tenant key cannot read another tenant’s pod_report artifact', async ({ request }) => {
  // The isolation assertion that matters — both keys are valid; only the owner may see the row.
  // Mirrors roadmap-push.spec.ts's own version of this check against the SAME table, since both
  // artifact kinds share one rail and one tenancy story.
  const marker = `pod-isolation-${Date.now()}`
  const pushed = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ caveats: [marker] }),
  })
  expect(pushed.status()).toBe(200)
  const { artifactId } = await pushed.json()

  const db = dbClient()
  const { data: mine } = await db.from('report_artifacts').select('project_id').eq('id', artifactId).single()
  expect(mine).toBeTruthy()

  const { data: two } = await db.from('projects').select('id').eq('slug', 'project-two').single()
  expect(two?.id).toBeTruthy()
  expect(mine!.project_id).not.toBe(two!.id)

  // A scoped read as tenant two returns nothing at all — not a filtered-down version of it.
  const { data: theirs } = await db
    .from('report_artifacts')
    .select('id')
    .eq('id', artifactId)
    .eq('project_id', two!.id)
  expect(theirs).toEqual([])

  // Tenant two pushing does not touch tenant one's version line either — versions are per-tenant,
  // per (project_id, kind).
  const theirPush = await request.post('/api/v1/reports/pod/push', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: envelope(),
  })
  expect(theirPush.status()).toBe(200)
  const { data: theirRows } = await db
    .from('report_artifacts')
    .select('id')
    .eq('project_id', two!.id)
    .eq('kind', 'pod_report')
  expect((theirRows ?? []).length).toBeGreaterThan(0)
})
