import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import { hashCredential } from '@/lib/credential-hash'
import { readAgentActivity, AGENT_ACTIVITY_ACTIONS } from '@/lib/agent-activity-read'
import { readPendingConfirmations } from '@/lib/pending-confirmations-read'
import { requireLocalSupabaseApiUrl, requireTestDatabaseUrl } from './helpers/test-db-cleanup'

// app-shell-and-agent-rail · Sprint 1 — the tenancy contract of the two new read seams.
//
// ── Why this spec runs the REAL functions instead of hitting a route ──────────────────────────
// Sprint 1 ships no HTTP surface: the rail that renders these reads is Sprint 2. The property that
// matters is nonetheless a security property today, because Sprint 2 inherits it. So the spec
// imports the exact functions the product calls and points them at a real database with two real
// tenants in it.
//
// That is possible only because the query lives in a module that takes its client as a parameter
// (lib/agent-activity-read.ts, lib/pending-confirmations-read.ts). Their `server-only` wrappers —
// lib/agent-activity.ts and lib/pending-confirmations.ts — add nothing but `getSupabaseServiceClient()`.
//
// ── The mutation check this spec exists to survive ────────────────────────────────────────────
// Delete `.eq('project_id', projectId)` from readAgentActivity and the first test must go red.
// Verified by doing exactly that (Sprint 1 QA). A tenancy spec that cannot fail is worse than none,
// because the next reader stops at it.

const projectIds: string[] = []
let pg: PgClient | null = null

function db(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  requireTestDatabaseUrl()
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function pgClient(): Promise<PgClient> {
  if (!pg) {
    pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
    await pg.connect()
  }
  return pg
}

async function fixtureProject(label: string): Promise<string> {
  const { data, error } = await db()
    .from('projects')
    .insert({
      slug: `rail-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: hashCredential(`fixture-${crypto.randomUUID()}`),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create fixture project: ${error?.message}`)
  projectIds.push(data.id as string)
  return data.id as string
}

/** Insert an audit row directly. `recordAudit` is `server-only`, and this spec is about the READ. */
async function seedAudit(projectId: string, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await db().from('audit_log').insert({ project_id: projectId, action, metadata })
  if (error) throw new Error(`could not seed audit row: ${error.message}`)
}

/**
 * A task + a staged confirmation for it. Written through SQL rather than the connector's propose
 * tool on purpose: `CONNECTOR_WRITES_ENABLED` has never been ON in production and is off in CI, so
 * driving the real tool would make this spec skip silently — the exact false green LEARNINGS warns
 * about. The row shape is the migration's, not an invention.
 */
async function seedConfirmation(
  projectId: string,
  over: { action?: string; consumed?: boolean; expiresInMinutes?: number } = {}
): Promise<{ id: string; taskId: string; agentKeyId: string }> {
  const client = await pgClient()
  // `tasks.signal_id` is NOT NULL — a task in this engine is always a promoted signal, never a
  // free-floating row. The fingerprint's `^[0-9a-f]{32}$` CHECK is the schema's, not a preference.
  const signal = await client.query(
    `INSERT INTO public.signals (project_id, kind, fingerprint, title)
     VALUES ($1, 'error', md5(random()::text), 'rail fixture signal') RETURNING id`,
    [projectId]
  )
  const task = await client.query(
    `INSERT INTO public.tasks (project_id, signal_id, title, status)
     VALUES ($1, $2, 'rail fixture task', 'open') RETURNING id`,
    [projectId, signal.rows[0].id]
  )
  const taskId = task.rows[0].id as string
  // `agent_key_id` is NOT NULL (migration 20260806140000): a confirmation is a capability minted FOR
  // a credential, so the fixture mints one rather than working around the constraint.
  const key = await client.query(
    `INSERT INTO public.api_keys (project_id, key_hash, label, scope)
     VALUES ($1, $2, 'rail fixture agent key', 'agent_write') RETURNING id`,
    [projectId, hashCredential(`agent-${crypto.randomUUID()}`)]
  )
  const row = await client.query(
    `INSERT INTO public.task_write_confirmations
       (token_hash, project_id, task_id, action, actor, resolution, evidence_pointer, agent_key_id,
        expires_at, consumed_at)
     VALUES ($1, $2, $3, $4, 'agent-fixture', 'fixed in fixture', 'https://example.test/commit/abc',
             $5, now() + make_interval(mins => $6), $7)
     RETURNING id`,
    [
      hashCredential(`confirmation-${crypto.randomUUID()}`),
      projectId,
      taskId,
      over.action ?? 'resolve',
      key.rows[0].id,
      over.expiresInMinutes ?? 15,
      over.consumed ? new Date().toISOString() : null,
    ]
  )
  return { id: row.rows[0].id as string, taskId, agentKeyId: key.rows[0].id as string }
}

test.afterAll(async () => {
  if (projectIds.length > 0) {
    const client = await pgClient()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM public.audit_log WHERE project_id = ANY($1::uuid[])', [projectIds])
      // task_write_confirmations and tasks both cascade from projects, but deleting them explicitly
      // keeps the cleanup readable and survives a future change to those FK actions.
      await client.query('DELETE FROM public.task_write_confirmations WHERE project_id = ANY($1::uuid[])', [
        projectIds,
      ])
      await client.query('DELETE FROM public.tasks WHERE project_id = ANY($1::uuid[])', [projectIds])
      await client.query('DELETE FROM public.signals WHERE project_id = ANY($1::uuid[])', [projectIds])
      await client.query('DELETE FROM public.api_keys WHERE project_id = ANY($1::uuid[])', [projectIds])
      await client.query('DELETE FROM public.projects WHERE id = ANY($1::uuid[])', [projectIds])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  if (pg) {
    await pg.end()
    pg = null
  }
})

test('activity for one project never contains another project’s rows', async () => {
  const [alpha, beta] = [await fixtureProject('alpha'), await fixtureProject('beta')]

  await seedAudit(alpha, 'api_key_issued', { keyId: crypto.randomUUID(), label: 'alpha ingest' })
  await seedAudit(beta, 'api_key_issued', { keyId: crypto.randomUUID(), label: 'beta ingest' })
  await seedAudit(beta, 'destination_created', { destinationId: crypto.randomUUID(), name: 'beta hook' })

  const forAlpha = await readAgentActivity(db(), alpha)
  expect(forAlpha).not.toBeNull()

  // The assertion that must fail if the project filter is dropped: alpha's read contains alpha's
  // one row and nothing that was written under beta.
  expect(forAlpha!).toHaveLength(1)
  expect(forAlpha![0].summary).toContain('alpha ingest')
  expect(JSON.stringify(forAlpha)).not.toContain('beta ingest')
  expect(JSON.stringify(forAlpha)).not.toContain('beta hook')

  // ...and symmetrically, so a filter that accidentally pinned every read to ONE project would not
  // pass by looking correct from alpha's side.
  const forBeta = await readAgentActivity(db(), beta)
  expect(forBeta).not.toBeNull()
  expect(forBeta!).toHaveLength(2)
  expect(JSON.stringify(forBeta)).not.toContain('alpha ingest')
})

test('D2 — an action outside the allow-list is not returned even though the row exists', async () => {
  const project = await fixtureProject('allowlist')

  await seedAudit(project, 'api_key_issued', { keyId: crypto.randomUUID(), label: 'visible' })
  // A real member of the AuditAction union that the rail deliberately does not render: it records
  // that a tenant's automation was NOT told about a lifecycle change, which is not an activity line.
  await seedAudit(project, 'task_event_emit_failed', { taskId: crypto.randomUUID(), detail: 'boom' })

  const rows = await readAgentActivity(db(), project)
  expect(rows).not.toBeNull()
  expect(rows!.map((row) => row.action)).toEqual(['api_key_issued'])

  // The row really is in the table — otherwise this test would pass against an empty database.
  const { count } = await db()
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project)
  expect(count).toBe(2)

  // And the allow-list is the closed set the module claims it is.
  expect(AGENT_ACTIVITY_ACTIONS).not.toContain('task_event_emit_failed')
})

test('D3 — attribution comes from metadata.via, not from a caller-supplied actor label', async () => {
  const project = await fixtureProject('attribution')

  await seedAudit(project, 'task_transitioned', {
    taskId: crypto.randomUUID(),
    toStatus: 'resolved',
    via: 'connector',
    actor: 'a-human-name',
  })
  // The move this rule blocks: a tenant naming a human "claude-code" to make their own numbers look
  // more agent-driven than they are.
  await seedAudit(project, 'task_transitioned', {
    taskId: crypto.randomUUID(),
    toStatus: 'dismissed',
    actor: 'claude-code',
  })

  const rows = await readAgentActivity(db(), project)
  expect(rows).not.toBeNull()
  const byStatus = Object.fromEntries(rows!.map((row) => [row.summary, row.actor]))
  expect(byStatus[rows!.find((r) => r.summary.includes('resolved'))!.summary]).toBe('agent')
  expect(byStatus[rows!.find((r) => r.summary.includes('dismissed'))!.summary]).toBe('human')
})

test('D10 — activity is ordered by created_at, newest first, not by the random id', async () => {
  const project = await fixtureProject('ordering')
  const client = await pgClient()

  // Explicit timestamps, inserted OUT of chronological order, so a query that returned insertion or
  // id order would produce a different answer than one that sorts by created_at.
  for (const [minutesAgo, label] of [
    [10, 'middle'],
    [30, 'oldest'],
    [1, 'newest'],
  ] as const) {
    await client.query(
      `INSERT INTO public.audit_log (project_id, action, metadata, created_at)
       VALUES ($1, 'api_key_issued', jsonb_build_object('label', $2::text), now() - make_interval(mins => $3))`,
      [project, label, minutesAgo]
    )
  }

  const rows = await readAgentActivity(db(), project)
  expect(rows).not.toBeNull()
  expect(rows!.map((row) => row.summary.match(/“(.+)”/)![1])).toEqual(['newest', 'middle', 'oldest'])
})

test('a staged confirmation is visible to its own project and invisible to another', async () => {
  const [mine, theirs] = [await fixtureProject('conf-mine'), await fixtureProject('conf-theirs')]
  const seeded = await seedConfirmation(mine)
  await seedConfirmation(theirs)

  const forMine = await readPendingConfirmations(db(), mine)
  expect(forMine).not.toBeNull()
  expect(forMine!).toHaveLength(1)
  expect(forMine![0].id).toBe(seeded.id)
  expect(forMine![0].taskId).toBe(seeded.taskId)
  expect(forMine![0].action).toBe('resolve')
  // The parameters frozen at propose time, read from the row rather than re-derived.
  expect(forMine![0].actor).toBe('agent-fixture')
  expect(forMine![0].evidencePointer).toBe('https://example.test/commit/abc')
  // The credential the proposal is bound to, which is what makes it answerable at all.
  expect(forMine![0].agentKeyId).toBe(seeded.agentKeyId)

  const forTheirs = await readPendingConfirmations(db(), theirs)
  expect(forTheirs!.map((row) => row.id)).not.toContain(seeded.id)
})

test('a spent or expired confirmation is not pending', async () => {
  const project = await fixtureProject('conf-lifecycle')
  const pending = await seedConfirmation(project)
  await seedConfirmation(project, { consumed: true })
  await seedConfirmation(project, { expiresInMinutes: -5 })

  const rows = await readPendingConfirmations(db(), project)
  expect(rows).not.toBeNull()
  // All three rows exist; exactly one of them is something a human still has to answer.
  expect(rows!.map((row) => row.id)).toEqual([pending.id])
})
