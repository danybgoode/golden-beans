import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'
import { isTaskMcpToolEnabled } from '../lib/flags'
import { ERROR_EVENT } from '../lib/signal-events'

// signals-loop · Sprint 2, Story 2.3 — the connector task READ tools.
//
// ── This file discharges TWO debts Sprint 1 recorded rather than hid ─────────────────────────
// 1. The AUTHENTICATED cross-tenant isolation assertion. Sprint 1's equivalent could only check
//    isolation from the data side, because no HTTP read surface for signals existed yet — an
//    end-to-end assertion would have been unreachable by construction, which LEARNINGS rates as
//    worse than an absent one because the next reader stops there. The surface exists now, so the
//    real assertion is made here: tenant A's token, through the real MCP path, must never see
//    tenant B's tasks. It uses a REAL foreign token, not a fabricated one.
// 2. The first PRODUCTION caller of evaluateFrictionForProject(). `list_tasks` triggers it, so
//    "an agent pulling its queue is what makes the queue current" is asserted, not just designed.

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

type Tenant = { projectId: string; slug: string; apiKey: string; connectorToken: string }

async function createTenant(db: SupabaseClient, label: string): Promise<Tenant> {
  const slug = `spec-tasks-${label}-${randomBytes(5).toString('hex')}`
  const { data: project, error } = await db
    .from('projects')
    .insert({ slug, api_key_hash: null })
    .select('id')
    .single()
  if (error || !project) throw new Error(`fixture project failed: ${error?.message}`)

  const apiKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  await db.from('api_keys').insert({
    project_id: project.id,
    key_hash: createHash('sha256').update(apiKey).digest('hex'),
    label: 'task spec',
  })

  const connectorToken = `gb_connector_${randomBytes(24).toString('base64url')}`
  await db.from('connector_tokens').insert({ project_id: project.id, token: connectorToken })

  return { projectId: project.id as string, slug, apiKey, connectorToken }
}

async function rpc(request: APIRequestContext, token: string, method: string, params?: unknown) {
  const res = await request.post(`/api/v1/public/mcp/c/${token}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method, params },
  })
  return res
}

async function callTool(request: APIRequestContext, token: string, name: string, args: unknown = {}) {
  const res = await rpc(request, token, 'tools/call', { name, arguments: args })
  const body = await res.json()
  const text = body?.result?.content?.[0]?.text
  return { status: res.status(), raw: body, parsed: text ? JSON.parse(text) : null }
}

/** Ingests enough occurrences of one error to clear the default promotion thresholds. */
async function seedPromotableSignal(
  request: APIRequestContext,
  tenant: Tenant,
  marker: string
): Promise<void> {
  // 5 distinct users × 5 events = impact 25, clearing minUsersAffected 3 / minImpactScore 15.
  // Fired through the NORMAL track path, untagged — the realistic-input rule this epic names.
  for (let i = 0; i < 5; i += 1) {
    const res = await request.post('/api/v1/track', {
      headers: { Authorization: `Bearer ${tenant.apiKey}`, 'Content-Type': 'application/json' },
      data: {
        userId: `u-${i}`,
        event: ERROR_EVENT,
        tags: {
          name: 'TypeError',
          message: `${marker} failed`,
          stack: 'Error\n    at handler (/app/h.ts:1:1)',
        },
        metadata: { context: {} },
      },
    })
    expect(res.status()).toBe(201)
  }
}

async function waitForTasks(db: SupabaseClient, projectId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let rows: Array<Record<string, unknown>> = []
  while (Date.now() < deadline) {
    const { data } = await db.from('tasks').select('*').eq('project_id', projectId)
    rows = data ?? []
    if (rows.length > 0) return rows
    await new Promise((r) => setTimeout(r, 200))
  }
  return rows
}

async function waitForOpenedTaskEvent(
  db: SupabaseClient,
  projectId: string,
  taskId: string,
  timeoutMs = 10_000
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data } = await db
      .from('events')
      .select('event, subject_type, subject_id, idempotency_key, idempotency_fingerprint')
      .eq('project_id', projectId)
      .eq('event', 'task_opened')
      .eq('subject_type', 'task')
      .eq('subject_id', taskId)
      .maybeSingle()
    if (data) return data as Record<string, unknown>
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

test.describe('connector task read tools', () => {
  test.skip(!isTaskMcpToolEnabled(), 'connector or signals gate is off — tools are dark by design')

  test('list_tasks returns this project ranked queue with its evidence bundle', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'list')
    await seedPromotableSignal(request, tenant, 'marker-alpha')

    const listed = await callTool(request, tenant.connectorToken, 'list_tasks', {})
    expect(listed.parsed?.ok).toBe(true)
    expect(Array.isArray(listed.parsed?.tasks)).toBe(true)
    expect(listed.parsed.tasks.length).toBeGreaterThan(0)

    const task = listed.parsed.tasks[0]
    expect(task.title).toContain('marker-alpha')
    // Every evidence field must trace to an engine query — there is no LLM in this engine, and the
    // bundle being computed rather than generated is the product claim.
    expect(task.evidence?.signal?.eventCount).toBeGreaterThanOrEqual(5)
    expect(task.evidence?.signal?.usersAffected).toBeGreaterThanOrEqual(5)
    expect(task.evidence?.capturedAt).toBeTruthy()

    // Promotion returns before its lifecycle fan-out finishes, so wait for the actual canonical
    // event instead of mistaking the task row for proof that a tenant's automation heard about it.
    // This fails if the emit loses either half of its idempotency pair — the prior production-shaped
    // failure that logged and dropped every task_opened event.
    const emitted = await waitForOpenedTaskEvent(db, tenant.projectId, task.id)
    expect(emitted).not.toBeNull()
    expect(emitted?.idempotency_key).toBe(`task:${task.id}:open`)
    expect(emitted?.idempotency_fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  test('get_task returns one task, and 404-equivalent for another tenant task id', async ({ request }) => {
    const db = dbClient()
    const victim = await createTenant(db, 'victim')
    const attacker = await createTenant(db, 'attacker')
    await seedPromotableSignal(request, victim, 'victim-secret-marker')

    // Promotion is LAZY — a signal becomes a task when someone pulls the queue, not when the error
    // is ingested (Amendment 3's accepted cost, for declining a cross-tenant cron). So the victim
    // has to read their own queue before a task exists to steal. An earlier version of this test
    // waited for tasks straight after ingest and timed out, which was the test misunderstanding the
    // design rather than the design being wrong — worth stating, because "nothing appeared" looks
    // identical to a broken promotion path.
    await callTool(request, victim.connectorToken, 'list_tasks', {})
    const victimTasks = await waitForTasks(db, victim.projectId)
    expect(victimTasks.length).toBeGreaterThan(0)
    const victimTaskId = victimTasks[0].id as string

    // The victim's own token reads it fine.
    const own = await callTool(request, victim.connectorToken, 'get_task', { taskId: victimTaskId })
    expect(own.parsed?.ok).toBe(true)
    expect(own.parsed.task.id).toBe(victimTaskId)

    // ── THE assertion Sprint 1 owed ────────────────────────────────────────────────────────
    // A REAL foreign token — minted for a real second tenant, not fabricated — asking for a task
    // id it legitimately knows. It must get the same answer as for an id that does not exist.
    const stolen = await callTool(request, attacker.connectorToken, 'get_task', { taskId: victimTaskId })
    expect(stolen.parsed?.ok).toBe(false)
    expect(stolen.parsed?.reason).toBe('not_found')
    expect(JSON.stringify(stolen.parsed)).not.toContain('victim-secret-marker')

    // And the reason is indistinguishable from a genuinely absent id — no existence oracle.
    const invented = await callTool(request, attacker.connectorToken, 'get_task', {
      taskId: '00000000-0000-0000-0000-000000000000',
    })
    expect(invented.parsed?.reason).toBe(stolen.parsed?.reason)
  })

  test('list_tasks NEVER returns another tenant tasks', async ({ request }) => {
    const db = dbClient()
    const victim = await createTenant(db, 'v2')
    const attacker = await createTenant(db, 'a2')
    await seedPromotableSignal(request, victim, 'confidential-marker')
    // Same lazy-promotion note as above: the victim must pull their own queue for a task to exist.
    await callTool(request, victim.connectorToken, 'list_tasks', {})
    await waitForTasks(db, victim.projectId)

    const listed = await callTool(request, attacker.connectorToken, 'list_tasks', {})
    expect(listed.parsed?.ok).toBe(true)
    expect(listed.parsed.tasks).toHaveLength(0)
    expect(JSON.stringify(listed.parsed)).not.toContain('confidential-marker')
  })

  test('list_tasks is the friction trigger — it materialises a $friction signal', async ({ request }) => {
    // The second debt from Sprint 1: evaluateFrictionForProject() had no production caller, so its
    // orchestration was unproven. This asserts the wiring end to end — a bad funnel produces no
    // friction signal until an agent pulls the queue, and then it does.
    const db = dbClient()
    const tenant = await createTenant(db, 'friction')

    await db.from('features').insert({
      project_id: tenant.projectId,
      key: 'setup_guide',
      enabled: true,
      target_event: 'guide_seen',
      adopted_event: 'guide_done',
      retained_event: 'guide_again',
      retention_days: 14,
    })

    // 60 targeted, 3 adopted = 5% adoption, far under the 20% default, and well past minSample 25.
    const events = []
    for (let i = 0; i < 60; i += 1) {
      events.push({
        project_id: tenant.projectId,
        user_id: `f${i}`,
        event: 'guide_seen',
        feature_id: 'setup_guide',
      })
    }
    for (let i = 0; i < 3; i += 1) {
      events.push({
        project_id: tenant.projectId,
        user_id: `f${i}`,
        event: 'guide_done',
        feature_id: 'setup_guide',
      })
    }
    await db.from('events').insert(events)

    // Before: nothing has looked, so nothing exists.
    const { data: before } = await db.from('signals').select('id').eq('project_id', tenant.projectId)
    expect(before ?? []).toHaveLength(0)

    await callTool(request, tenant.connectorToken, 'list_tasks', {})

    const { data: after } = await db
      .from('signals')
      .select('kind, title')
      .eq('project_id', tenant.projectId)
      .eq('kind', 'friction')
    expect((after ?? []).length).toBeGreaterThan(0)
    expect(JSON.stringify(after)).toContain('setup_guide')
  })

  test('a RESOLVED task does not rise from the dead on the next queue read', async ({ request }) => {
    // ── The zombie bug, pinned ──────────────────────────────────────────────────────────────
    // Cross-review (Codex round 1) found this and it was severe: the partial unique index only
    // covers open/claimed tasks, so the moment one went terminal the underlying signal — whose
    // counts never decrease — re-qualified, and the very next queue read created a fresh open
    // duplicate. Resolve, refresh, it is back. Every refresh, forever.
    //
    // Reproduced against the database before fixing. This spec is the guard, and it is worth its
    // weight because the failure is invisible in any single-read test: you only see it on the
    // SECOND read after a resolve, which is exactly what this does.
    const db = dbClient()
    const tenant = await createTenant(db, 'zombie')
    await seedPromotableSignal(request, tenant, 'zombie-marker')

    await callTool(request, tenant.connectorToken, 'list_tasks', {})
    const created = await waitForTasks(db, tenant.projectId)
    expect(created).toHaveLength(1)

    await db
      .from('tasks')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution: 'fixed' })
      .eq('id', created[0].id as string)

    // Two further reads — one is not enough to distinguish "slow" from "fixed".
    await callTool(request, tenant.connectorToken, 'list_tasks', {})
    await callTool(request, tenant.connectorToken, 'list_tasks', {})

    const { data: after } = await db.from('tasks').select('id, status').eq('project_id', tenant.projectId)
    expect(after ?? []).toHaveLength(1)
    expect((after ?? [])[0].status).toBe('resolved')
  })

  test('a RECURRENCE after resolution DOES open a fresh task', async ({ request }) => {
    // The counter-test, and the reason the fix is a recurrence gate rather than "never re-promote".
    // A problem that comes back must get a new task with its own history — otherwise resolving one
    // occurrence would permanently silence the signal, which is a worse bug than the zombie.
    const db = dbClient()
    const tenant = await createTenant(db, 'recur')
    await seedPromotableSignal(request, tenant, 'recurring-marker')

    await callTool(request, tenant.connectorToken, 'list_tasks', {})
    const first = await waitForTasks(db, tenant.projectId)
    expect(first).toHaveLength(1)

    await db
      .from('tasks')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution: 'fixed' })
      .eq('id', first[0].id as string)

    // The problem happens AGAIN — real new occurrences through the real ingest path, which is what
    // advances last_seen_at past the resolution.
    await seedPromotableSignal(request, tenant, 'recurring-marker')
    await callTool(request, tenant.connectorToken, 'list_tasks', {})

    const deadline = Date.now() + 10_000
    let rows: Array<Record<string, unknown>> = []
    while (Date.now() < deadline) {
      const { data } = await db.from('tasks').select('id, status').eq('project_id', tenant.projectId)
      rows = data ?? []
      if (rows.length >= 2) break
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.status === 'open')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'resolved')).toHaveLength(1)
  })

  test('a revoked connector token cannot reach the task tools', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'revoked')
    await seedPromotableSignal(request, tenant, 'revoked-marker')

    await db
      .from('connector_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', tenant.connectorToken)

    const res = await rpc(request, tenant.connectorToken, 'tools/list')
    expect(res.status()).toBe(401)
  })

  test('the task tools are REGISTERED and discoverable while the gates are on', async ({ request }) => {
    // Registration, not just callability: a tool that exists but is missing from tools/list is
    // invisible to the agent that needs it, and the dark-state contract is the exact inverse —
    // absent from the listing entirely rather than present-and-erroring.
    const db = dbClient()
    const tenant = await createTenant(db, 'listing')

    const res = await rpc(request, tenant.connectorToken, 'tools/list')
    const body = await res.json()
    const names: string[] = (body?.result?.tools ?? []).map((t: { name: string }) => t.name)
    expect(names).toContain('list_tasks')
    expect(names).toContain('get_task')
  })
})
