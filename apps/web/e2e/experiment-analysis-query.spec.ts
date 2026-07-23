import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ExperimentDefinition } from '@/lib/experiment-definition'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

const START = '2026-07-01T00:00:00.000000Z'
const END = '2026-08-01T00:00:00.000000Z'

const DEFINITION: ExperimentDefinition = {
  hypothesis: 'A clearer founding-store CTA increases completed applications.',
  assignmentEntityType: 'merchant_application',
  eligibility: { description: 'Consented founding-store applicants in Mexico.', tags: { region: 'mx' } },
  variants: [
    { key: 'z-control', weight: 1 },
    { key: 'a-treatment', weight: 1 },
  ],
  controlVariantKey: 'z-control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_validation_failed', direction: 'decrease' }],
  segmentFields: ['plan', 'region'],
  plannedWindow: { startAt: START, endAt: END },
  minimumSamplePerVariant: 5,
}

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function createOwner(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `experiment-analysis-${label}-${Date.now()}-${randomBytes(5).toString('hex')}@example.test`,
    password: 'local-only-experiment-analysis-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create owner: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string) {
  const key = `gb_experiment_analysis_${randomBytes(18).toString('hex')}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const slug = `experiment-analysis-${label}-${randomBytes(6).toString('hex')}`
  const { data, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: keyHash })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create project: ${error?.message}`)
  const { error: keyError } = await client
    .from('api_keys')
    .insert({ project_id: data.id, key_hash: keyHash, label: 'experiment analysis spec' })
  if (keyError) throw new Error(`could not create API key: ${keyError.message}`)
  const token = `gb_connector_${randomBytes(24).toString('base64url')}`
  const { error: tokenError } = await client
    .from('connector_tokens')
    .insert({ project_id: data.id, token })
  if (tokenError) throw new Error(`could not create connector: ${tokenError.message}`)
  return { id: data.id as string, slug, key, token }
}

async function createRunningVersion(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  experimentKey: string,
) {
  expect((await client.from('project_members').insert({
    project_id: projectId,
    user_id: ownerId,
    role: 'owner',
  })).error).toBeNull()
  const { data, error } = await client.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: experimentKey,
    p_definition: DEFINITION,
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create experiment version: ${error?.message}`)
  const created = data[0] as { experiment_id: string; version_id: string; version: number }
  const transitioned = await client.rpc('transition_experiment_version', {
    p_project_id: projectId,
    p_experiment_id: created.experiment_id,
    p_version_id: created.version_id,
    p_target_status: 'running',
    p_actor_user_id: ownerId,
  })
  if (transitioned.error) throw new Error(`could not start experiment version: ${transitioned.error.message}`)
  return Number(created.version)
}

function eventTime(second: number): string {
  return `2026-07-02T00:00:${String(second).padStart(2, '0')}.000000Z`
}

async function insertFixture(
  client: SupabaseClient,
  projectId: string,
  experimentKey: string,
  foreign = false,
) {
  const rows: Array<Record<string, unknown>> = []
  for (let index = 0; index < 5; index += 1) {
    for (const [variant, offset] of [['z-control', 0], ['a-treatment', 10]] as const) {
      const subject = `${foreign ? 'foreign-' : ''}${variant}-${index}`
      rows.push({
        project_id: projectId,
        user_id: `actor-${randomBytes(6).toString('hex')}`,
        event: 'experiment_exposed',
        feature_id: experimentKey,
        tags: {
          variant,
          experiment_definition_version: 1,
          region: 'mx',
          plan: 'founding',
          contact_email: 'must-never-cross@example.test',
        },
        metadata: { phone: '+52-55-sensitive', full_name: 'Sensitive Person' },
        context_version: 1,
        subject_type: 'merchant_application',
        subject_id: subject,
        occurred_at: eventTime(index + offset + 1),
        created_at: eventTime(index + offset + 1),
      })
      const converts = variant === 'z-control' ? index === 0 : index < (foreign ? 1 : 3)
      if (converts) {
        rows.push({
          project_id: projectId,
          user_id: `metric-actor-${randomBytes(6).toString('hex')}`,
          event: 'founding_application_completed',
          tags: {},
          metadata: {},
          context_version: 1,
          subject_type: 'merchant_application',
          subject_id: subject,
          occurred_at: eventTime(index + offset + 20),
          created_at: eventTime(index + offset + 20),
        })
      }
    }
  }
  rows.push({
    project_id: projectId,
    user_id: 'guardrail-actor',
    event: 'founding_application_validation_failed',
    tags: {},
    metadata: {},
    context_version: 1,
    subject_type: 'merchant_application',
    subject_id: `${foreign ? 'foreign-' : ''}a-treatment-4`,
    occurred_at: eventTime(40),
    created_at: eventTime(40),
  })
  const { error } = await client.from('events').insert(rows)
  if (error) throw new Error(`could not insert analysis facts: ${error.message}`)
}

async function mcpCall(request: APIRequestContext, token: string, name: string, args: unknown) {
  const response = await request.post(`/api/v1/public/mcp/c/${token}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const body = await response.json()
  if (!body.result) return { response, payload: body }
  const text = body.result.content[0].text as string
  try {
    return { response, payload: JSON.parse(text) }
  } catch {
    return { response, payload: text }
  }
}

test('bounded RPC strips PII and API/MCP share one versioned, tenant-isolated analysis', async ({ request }) => {
  const client = db()
  const [ownerOne, ownerTwo] = await Promise.all([
    createOwner(client, 'one'),
    createOwner(client, 'two'),
  ])
  const [one, two] = await Promise.all([
    createProject(client, 'one'),
    createProject(client, 'two'),
  ])
  const experimentKey = `founding_cta_${Date.now()}`
  try {
    const [versionOne] = await Promise.all([
      createRunningVersion(client, one.id, ownerOne, experimentKey),
      createRunningVersion(client, two.id, ownerTwo, experimentKey),
    ])
    await Promise.all([
      insertFixture(client, one.id, experimentKey),
      insertFixture(client, two.id, experimentKey, true),
    ])
    const asOf = new Date().toISOString()

    const snapshot = await client.rpc('get_experiment_analysis_events', {
      p_project_id: one.id,
      p_experiment_key: experimentKey,
      p_definition_version: versionOne,
      p_metric_events: ['founding_application_completed', 'founding_application_validation_failed'],
      p_analysis_start: START,
      p_analysis_end: asOf,
      p_as_of: asOf,
    })
    expect(snapshot.error).toBeNull()
    expect(snapshot.data.length).toBeGreaterThan(10)
    const serializedSnapshot = JSON.stringify(snapshot.data)
    expect(serializedSnapshot).not.toContain('user_id')
    expect(serializedSnapshot).not.toContain('metadata')
    expect(serializedSnapshot).not.toContain('must-never-cross@example.test')
    expect(serializedSnapshot).not.toContain('+52-55-sensitive')
    expect(serializedSnapshot).not.toContain('Sensitive Person')

    const query = new URLSearchParams({
      version: String(versionOne),
      asOf,
      segmentField: 'plan',
      segmentValue: 'founding',
    })
    const api = await request.get(`/api/v1/experiments/${experimentKey}/compare?${query}`, {
      headers: { Authorization: `Bearer ${one.key}` },
    })
    expect(api.status()).toBe(200)
    const body = await api.json()
    expect(body.experiment).toMatchObject({
      key: experimentKey,
      definitionVersion: 1,
      lifecycle: 'running',
    })
    expect(body.analysis).toMatchObject({
      decisionReady: true,
      integrityReady: true,
      sampleStatus: 'met',
      diagnostics: { srm: { status: 'clear' }, validExposureSubjects: 10 },
      primaryMetric: {
        variants: [
          { key: 'z-control', convertedSubjects: 1, conversionRate: 0.2 },
          { key: 'a-treatment', convertedSubjects: 3, conversionRate: 0.6, directionalStatus: 'favorable' },
        ],
      },
      segment: { status: 'included', field: 'plan' },
    })
    const serializedBody = JSON.stringify(body)
    expect(serializedBody).not.toContain('must-never-cross@example.test')
    expect(serializedBody).not.toContain('z-control-0')
    expect(serializedBody.toLowerCase()).not.toContain('winner')

    const mcp = await mcpCall(request, one.token, 'get_experiment_analysis', {
      experimentKey,
      version: versionOne,
      asOf,
      segmentField: 'plan',
      segmentValue: 'founding',
    })
    expect(mcp.response.status()).toBe(200)
    expect(mcp.payload).toEqual(body)

    const foreign = await request.get(`/api/v1/experiments/${experimentKey}/compare?${query}`, {
      headers: { Authorization: `Bearer ${two.key}` },
    })
    expect(foreign.status()).toBe(200)
    const foreignBody = await foreign.json()
    expect(foreignBody.analysis.primaryMetric.variants[1].convertedSubjects).toBe(1)

    expect((await request.get(`/api/v1/experiments/${experimentKey}/compare?${query}`)).status()).toBe(401)
    const ui = await request.get(
      `/app/experiments/${one.slug}/${experimentKey}?version=${versionOne}&asOf=${encodeURIComponent(asOf)}`,
      { maxRedirects: 0 },
    )
    expect([302, 307]).toContain(ui.status())
    expect(ui.headers().location).toContain('/login')

    expect((await client.from('connector_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', one.token)).error).toBeNull()
    const revoked = await mcpCall(request, one.token, 'get_experiment_analysis', {
      experimentKey,
      version: versionOne,
      asOf,
    })
    expect(revoked.response.status()).toBe(401)
  } finally {
    try {
      await cleanupExperimentProjects([one.id, two.id])
    } finally {
      await Promise.all([
        client.auth.admin.deleteUser(ownerOne),
        client.auth.admin.deleteUser(ownerTwo),
      ])
    }
  }
})
