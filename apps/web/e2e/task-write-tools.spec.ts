import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'
import { isConnectorWriteToolEnabled, isTaskMcpToolEnabled } from '../lib/flags'
import { ERROR_EVENT } from '../lib/signal-events'

// signals-loop · Sprint 3, Story 3.2 — the staged write tools (propose → confirm → apply).
//
// The engine's FIRST public mutation surface. What this file pins, in order of how badly it would
// hurt to get wrong:
//
//   1. A PROPOSE mutates nothing. Asserted by RE-READING the task row, never by trusting the
//      response — a response is a claim, the row is the fact.
//   2. A confirmation token is single-use, project-bound and expiring.
//   3. The two-credential rule: connector token + agent_write key must resolve to the SAME project.
//      A wrong-scope key, a revoked key, and another tenant's key are all refused, and refused
//      IDENTICALLY — the write tools are simply absent, with no oracle telling an attacker which
//      part of their credential was wrong.
//   4. With the gate off, the tools do not exist at all.
//   5. Every applied write leaves an audit row.
//
// ── On the `dark` tests below ──────────────────────────────────────────────────────────────────
// Most of this file skips when CONNECTOR_WRITES_ENABLED is off, because it exercises tools that do
// not exist while dark. The "absent while dark" test does the opposite: it skips when the gate is
// ON. Together they cover both polarities regardless of how the suite is run, rather than silently
// asserting nothing in whichever configuration CI happens to use.

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

type Tenant = {
  projectId: string
  slug: string
  apiKey: string
  connectorToken: string
  writeKey: string
  writeKeyId: string
}

async function createTenant(db: SupabaseClient, label: string): Promise<Tenant> {
  const slug = `spec-write-${label}-${randomBytes(5).toString('hex')}`
  const { data: project, error } = await db
    .from('projects')
    .insert({ slug, api_key_hash: null })
    .select('id')
    .single()
  if (error || !project) throw new Error(`fixture project failed: ${error?.message}`)

  const apiKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  await db.from('api_keys').insert({
    project_id: project.id,
    key_hash: sha256(apiKey),
    label: 'write spec ingest',
  })

  const writeKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  const { data: writeRow, error: writeErr } = await db
    .from('api_keys')
    .insert({
      project_id: project.id,
      key_hash: sha256(writeKey),
      label: 'write spec agent',
      scope: 'agent_write',
    })
    .select('id')
    .single()
  if (writeErr || !writeRow) throw new Error(`fixture write key failed: ${writeErr?.message}`)

  const connectorToken = `gb_connector_${randomBytes(24).toString('base64url')}`
  await db.from('connector_tokens').insert({ project_id: project.id, token: connectorToken })

  return {
    projectId: project.id as string,
    slug,
    apiKey,
    connectorToken,
    writeKey,
    writeKeyId: writeRow.id as string,
  }
}

/** An MCP call. `bearer` is the SECOND credential — omit it to call as a read-only agent. */
async function rpc(
  request: APIRequestContext,
  token: string,
  method: string,
  params?: unknown,
  bearer?: string | null
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  return request.post(`/api/v1/public/mcp/c/${token}`, {
    headers,
    data: { jsonrpc: '2.0', id: 1, method, params },
  })
}

async function listToolNames(
  request: APIRequestContext,
  token: string,
  bearer?: string | null
): Promise<string[]> {
  const res = await rpc(request, token, 'tools/list', {}, bearer)
  const body = await res.json()
  return (body?.result?.tools ?? []).map((t: { name: string }) => t.name)
}

async function callTool(
  request: APIRequestContext,
  token: string,
  name: string,
  args: unknown = {},
  bearer?: string | null
) {
  const res = await rpc(request, token, 'tools/call', { name, arguments: args }, bearer)
  const body = await res.json()
  const text = body?.result?.content?.[0]?.text
  return { status: res.status(), raw: body, parsed: text ? JSON.parse(text) : null }
}

async function seedPromotableSignal(request: APIRequestContext, tenant: Tenant, marker: string) {
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

/**
 * Seed a signal and pull the queue so a task exists.
 *
 * Promotion is LAZY (Amendment 3): a signal becomes a task when someone pulls the queue, not when
 * the error is ingested. Reading first is the design, not a workaround.
 */
async function seedTask(request: APIRequestContext, db: SupabaseClient, tenant: Tenant, marker: string) {
  await seedPromotableSignal(request, tenant, marker)
  await callTool(request, tenant.connectorToken, 'list_tasks', {}, tenant.writeKey)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const { data } = await db.from('tasks').select('*').eq('project_id', tenant.projectId)
    if (data && data.length > 0) return data[0] as Record<string, unknown>
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('no task was promoted within the timeout')
}

async function readTask(db: SupabaseClient, taskId: string) {
  const { data } = await db.from('tasks').select('*').eq('id', taskId).single()
  return data as Record<string, unknown>
}

// ── Dark by default ────────────────────────────────────────────────────────────────────────────

test.describe('write tools while the gate is OFF', () => {
  test.skip(isConnectorWriteToolEnabled(), 'writes are enabled — the dark assertion does not apply')

  test('the write tools are ABSENT from tools/list, not present-and-erroring', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'dark')

    // Presented WITH a perfectly valid write key. The gate, not the credential, is what makes them
    // absent — so this fails if someone ever makes registration credential-only.
    const names = await listToolNames(request, tenant.connectorToken, tenant.writeKey)
    expect(names).not.toContain('propose_task_change')
    expect(names).not.toContain('apply_task_change')
  })
})

// ── The staged write path ──────────────────────────────────────────────────────────────────────

test.describe('connector staged write tools', () => {
  test.skip(
    !isConnectorWriteToolEnabled() || !isTaskMcpToolEnabled(),
    'connector/signals/writes gate is off — tools are dark by design'
  )

  test('both write tools are offered when the gate is on AND a same-project write key is presented', async ({
    request,
  }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'offered')
    const names = await listToolNames(request, tenant.connectorToken, tenant.writeKey)
    expect(names).toContain('propose_task_change')
    expect(names).toContain('apply_task_change')
  })

  // ── 1. Propose mutates nothing ───────────────────────────────────────────────────────────────

  test('PROPOSE alone changes nothing — asserted by re-reading the row, not by trusting the response', async ({
    request,
  }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'propose')
    const task = await seedTask(request, db, tenant, 'propose-marker')
    const before = await readTask(db, task.id as string)

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )
    expect(proposed.parsed?.ok).toBe(true)
    expect(proposed.parsed?.confirmationToken).toBeTruthy()
    expect(proposed.parsed?.preview?.toStatus).toBe('claimed')

    // THE assertion. The row, not the response.
    const after = await readTask(db, task.id as string)
    expect(after.status).toBe(before.status)
    expect(after.claimed_by).toBe(before.claimed_by ?? null)
    expect(after.updated_at).toBe(before.updated_at)
  })

  test('APPLY performs the change and the row actually moves', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'apply')
    const task = await seedTask(request, db, tenant, 'apply-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )
    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(true)

    const after = await readTask(db, task.id as string)
    expect(after.status).toBe('claimed')
    expect(after.claimed_by).toBe('spec-agent')
  })

  // ── 2. The confirmation token's three properties ─────────────────────────────────────────────

  test('a confirmation token is SINGLE-USE — the second apply is refused', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'singleuse')
    const task = await seedTask(request, db, tenant, 'singleuse-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )
    const token = proposed.parsed.confirmationToken

    const first = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: token },
      tenant.writeKey
    )
    expect(first.parsed?.ok).toBe(true)

    const second = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: token },
      tenant.writeKey
    )
    expect(second.parsed?.ok).toBe(false)
    expect(second.parsed?.reason).toBe('already_used')
  })

  test('an UNKNOWN confirmation token is refused', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'unknowntoken')
    const res = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: `gb_confirm_${randomBytes(24).toString('base64url')}` },
      tenant.writeKey
    )
    expect(res.parsed?.ok).toBe(false)
    expect(res.parsed?.reason).toBe('not_found')
  })

  test('an EXPIRED confirmation token is refused, and expiry is judged in DATABASE time', async ({
    request,
  }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'expiry')
    const task = await seedTask(request, db, tenant, 'expiry-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )
    // Backdate the row rather than sleeping: the comparison lives in the view/function in database
    // time, so moving the row is the honest way to exercise it.
    const { error } = await db
      .from('task_write_confirmations')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('token_hash', sha256(proposed.parsed.confirmationToken))
    expect(error).toBeNull()

    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(false)
    expect(applied.parsed?.reason).toBe('expired')

    // ...and the task never moved.
    expect((await readTask(db, task.id as string)).status).toBe('open')
  })

  test('a confirmation token is PROJECT-BOUND — another tenant cannot spend it', async ({ request }) => {
    const db = dbClient()
    const victim = await createTenant(db, 'ptok-victim')
    const attacker = await createTenant(db, 'ptok-attacker')
    const task = await seedTask(request, db, victim, 'ptok-marker')

    const proposed = await callTool(
      request,
      victim.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'dismiss' },
      victim.writeKey
    )
    expect(proposed.parsed?.ok).toBe(true)

    // The attacker holds a fully valid credential PAIR of their own, and the victim's token string.
    const stolen = await callTool(
      request,
      attacker.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      attacker.writeKey
    )
    expect(stolen.parsed?.ok).toBe(false)
    // Indistinguishable from an invented token — no oracle on whether it exists elsewhere.
    expect(stolen.parsed?.reason).toBe('not_found')

    expect((await readTask(db, task.id as string)).status).toBe('open')
  })

  // ── 3. The two-credential rule ───────────────────────────────────────────────────────────────

  test('NO bearer key → write tools absent (reads still work)', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'nokey')
    const names = await listToolNames(request, tenant.connectorToken)
    expect(names).not.toContain('propose_task_change')
    expect(names).not.toContain('apply_task_change')
    // The ordinary read-only case must be unaffected — this is what stops the fix for a write bug
    // from breaking every existing connector user.
    expect(names).toContain('list_tasks')
  })

  test('an INGEST key (wrong scope) → write tools absent', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'wrongscope')
    const names = await listToolNames(request, tenant.connectorToken, tenant.apiKey)
    expect(names).not.toContain('propose_task_change')
  })

  test('a REVOKED write key → write tools absent', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'revoked')

    expect(await listToolNames(request, tenant.connectorToken, tenant.writeKey)).toContain(
      'propose_task_change'
    )

    await db
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tenant.writeKeyId)

    expect(await listToolNames(request, tenant.connectorToken, tenant.writeKey)).not.toContain(
      'propose_task_change'
    )
  })

  test('connector token for project A + write key for project B → write tools absent', async ({
    request,
  }) => {
    // The whole security property of Amendment 2. Both credentials are individually valid; they
    // simply do not agree, and that must authorize nothing — not A (the key is not A's) and not B
    // (the caller never proved it may touch B).
    const db = dbClient()
    const a = await createTenant(db, 'xproj-a')
    const b = await createTenant(db, 'xproj-b')

    const names = await listToolNames(request, a.connectorToken, b.writeKey)
    expect(names).not.toContain('propose_task_change')
    expect(names).not.toContain('apply_task_change')
  })

  test('a write key cannot reach ANOTHER tenant task, even with its own connector token', async ({
    request,
  }) => {
    const db = dbClient()
    const victim = await createTenant(db, 'reach-victim')
    const attacker = await createTenant(db, 'reach-attacker')
    const task = await seedTask(request, db, victim, 'reach-marker')

    const res = await callTool(
      request,
      attacker.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'dismiss' },
      attacker.writeKey
    )
    expect(res.parsed?.ok).toBe(false)
    expect(res.parsed?.reason).toBe('not_found')
    expect((await readTask(db, task.id as string)).status).toBe('open')
  })

  // ── 4. The evidence-pointer honesty rule (Amendment 4.2) ─────────────────────────────────────

  test('resolving with a COMMIT SHA is recorded as evidenced', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'ev-commit')
    const task = await seedTask(request, db, tenant, 'ev-commit-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'resolve', evidencePointer: '3b76d488d81252e8061a91bab53471aa3b12e2f7' },
      tenant.writeKey
    )
    expect(proposed.parsed?.preview?.evidenceKind).toBe('commit')

    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(true)
    expect(applied.parsed?.evidenceRecorded).toBe(true)

    const after = await readTask(db, task.id as string)
    expect(after.status).toBe('resolved')
    expect(after.evidence_pointer).toBe('3b76d488d81252e8061a91bab53471aa3b12e2f7')
  })

  test('resolving with a NOTE is recorded as resolved WITHOUT evidence — never silently as evidenced', async ({
    request,
  }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'ev-note')
    const task = await seedTask(request, db, tenant, 'ev-note-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'resolve', evidencePointer: 'done, trust me' },
      tenant.writeKey
    )
    // The agent is told at PROPOSE time, while it can still supply a real pointer.
    expect(proposed.parsed?.preview?.evidenceKind).toBe('note')
    expect(proposed.parsed?.preview?.evidenceNote).toMatch(/WITHOUT evidence/)

    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(true)
    expect(applied.parsed?.evidenceRecorded).toBe(false)

    // The note is still stored — an honest record of an unevidenced close.
    const after = await readTask(db, task.id as string)
    expect(after.status).toBe('resolved')
    expect(after.evidence_pointer).toBe('done, trust me')
  })

  // ── 5. Every apply is audited ────────────────────────────────────────────────────────────────

  test('an applied write leaves an audit row identifying it as a CONNECTOR write', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'audit')
    const task = await seedTask(request, db, tenant, 'audit-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )
    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(true)

    const deadline = Date.now() + 10_000
    let rows: Array<Record<string, unknown>> = []
    while (Date.now() < deadline) {
      const { data } = await db
        .from('audit_log')
        .select('action, metadata')
        .eq('project_id', tenant.projectId)
        .eq('action', 'task_transitioned')
      rows = data ?? []
      if (rows.length > 0) break
      await new Promise((r) => setTimeout(r, 200))
    }

    expect(rows.length).toBeGreaterThan(0)
    const meta = rows[0].metadata as Record<string, unknown>
    // "who moved this task, human or agent?" must be answerable from the row itself.
    expect(meta.via).toBe('connector')
    expect(meta.toStatus).toBe('claimed')
    expect(meta.taskId).toBe(task.id)
  })

  // ── Lifecycle refusals still apply through the staged path ───────────────────────────────────

  test('a claim with no actor is refused at PROPOSE time, before a token is issued', async ({
    request,
  }) => {
    const db = dbClient()
    const tenant = await createTenant(db, 'noactor')
    const task = await seedTask(request, db, tenant, 'noactor-marker')

    const res = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim' },
      tenant.writeKey
    )
    expect(res.parsed?.ok).toBe(false)
    expect(res.parsed?.reason).toBe('actor_required')
    expect(res.parsed?.confirmationToken).toBeFalsy()
  })

  test('a task that reached a terminal state between propose and apply refuses at APPLY', async ({
    request,
  }) => {
    // The race the staged design has to survive: the preview was true when shown and false when
    // confirmed. The database function decides under a row lock, so the second write loses.
    const db = dbClient()
    const tenant = await createTenant(db, 'racing')
    const task = await seedTask(request, db, tenant, 'racing-marker')

    const proposed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'claim', actor: 'spec-agent' },
      tenant.writeKey
    )

    // Someone resolves it in the dashboard in the meantime.
    const dismissed = await callTool(
      request,
      tenant.connectorToken,
      'propose_task_change',
      { taskId: task.id, action: 'dismiss' },
      tenant.writeKey
    )
    await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: dismissed.parsed.confirmationToken },
      tenant.writeKey
    )

    const applied = await callTool(
      request,
      tenant.connectorToken,
      'apply_task_change',
      { confirmationToken: proposed.parsed.confirmationToken },
      tenant.writeKey
    )
    expect(applied.parsed?.ok).toBe(false)
    expect(applied.parsed?.reason).toBe('already_terminal')

    expect((await readTask(db, task.id as string)).status).toBe('dismissed')
  })
})
