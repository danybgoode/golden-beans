import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { isConnectorEnabled } from '@/lib/flags'

function disposableToken(): string {
  return `gb_connector_${randomBytes(24).toString('base64url')}`
}

// Story 2.1 (commercial-shell/sprint-2.md) — the read-only MCP connector
// (POST /api/v1/public/mcp/c/:token). CI runs this suite with CONNECTOR_ENABLED=true (see
// .github/workflows/ci.yml) so the real round-trip/isolation/revocation assertions below exercise
// a live route — the dark-default (flag unset) is instead covered as a pure-function assertion,
// not a second differently-enved server boot (see lib/flags.ts's header comment).

const DEMO_SLUG = 'golden-beans-demo'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function rpc(request: import('@playwright/test').APIRequestContext, token: string, method: string, params?: unknown) {
  return request.post(`/api/v1/public/mcp/c/${token}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method, params },
  })
}

async function demoToken(): Promise<string> {
  const db = dbClient()
  const { data: project } = await db.from('projects').select('id').eq('slug', DEMO_SLUG).maybeSingle()
  if (!project) throw new Error(`demo project '${DEMO_SLUG}' not seeded — run npm run seed:demo first`)
  const { data: tokenRow } = await db
    .from('connector_tokens')
    .select('token')
    .eq('project_id', project.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!tokenRow) throw new Error(`demo project has no live connector token — run npm run seed:demo first`)
  return tokenRow.token
}

test.describe('isConnectorEnabled — dark by default', () => {
  test('unset/anything-but-"true" → disabled', () => {
    const original = process.env.CONNECTOR_ENABLED
    try {
      delete process.env.CONNECTOR_ENABLED
      expect(isConnectorEnabled()).toBe(false)
      process.env.CONNECTOR_ENABLED = 'false'
      expect(isConnectorEnabled()).toBe(false)
      process.env.CONNECTOR_ENABLED = 'true'
      expect(isConnectorEnabled()).toBe(true)
    } finally {
      if (original === undefined) delete process.env.CONNECTOR_ENABLED
      else process.env.CONNECTOR_ENABLED = original
    }
  })
})

test.describe('POST /api/v1/public/mcp/c/:token', () => {
  test('malformed token → 401', async ({ request }) => {
    const res = await rpc(request, 'not-a-real-token', 'tools/list')
    expect(res.status()).toBe(401)
  })

  test('well-formed but unknown token → 401 (same status as malformed — no oracle)', async ({ request }) => {
    const res = await rpc(request, `gb_connector_${'0'.repeat(32)}`, 'tools/list')
    expect(res.status()).toBe(401)
  })

  test('tools/list on the live demo token → the 3 read-only tools', async ({ request }) => {
    const token = await demoToken()
    const res = await rpc(request, token, 'tools/list')
    expect(res.status()).toBe(200)
    const body = await res.json()
    const names = body.result.tools.map((t: { name: string }) => t.name).sort()
    expect(names).toEqual(['compare_experiment', 'get_north_star', 'get_tars_funnel'])
  })

  test('get_tars_funnel on the live demo token → real numbers matching the seed', async ({ request }) => {
    const token = await demoToken()
    const res = await rpc(request, token, 'tools/call', { name: 'get_tars_funnel', arguments: { featureKey: 'setup_guide' } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const payload = JSON.parse(body.result.content[0].text)
    expect(payload.ok).toBe(true)
    expect(payload.project.slug).toBe(DEMO_SLUG)
    expect(payload.tars.targeted).toBeGreaterThan(0)
  })

  test('a token minted for a disposable project cannot read another project\'s data', async ({ request }) => {
    const db = dbClient()
    const isolationSlug = `mcp-isolation-${randomBytes(6).toString('hex')}`
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ slug: isolationSlug, api_key_hash: `spec-${randomBytes(8).toString('hex')}` })
      .select('id')
      .single()
    if (projectError || !project) throw new Error(`failed to insert disposable project: ${projectError?.message}`)

    const isolationToken = disposableToken()
    const { error: tokenError } = await db
      .from('connector_tokens')
      .insert({ project_id: project.id, token: isolationToken })
    if (tokenError) throw new Error(`failed to insert disposable token: ${tokenError.message}`)

    try {
      // The demo project's own feature key doesn't exist under this brand-new, empty project —
      // proof the isolation token never reaches project A's rows (there's no project param on
      // the tool schema at all for it to smuggle one through).
      const res = await rpc(request, isolationToken, 'tools/call', {
        name: 'get_tars_funnel',
        arguments: { featureKey: 'setup_guide' },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      const payload = JSON.parse(body.result.content[0].text)
      expect(payload.ok).toBe(false)
      expect(payload.reason).toBe('feature_not_found')
    } finally {
      await db.from('projects').delete().eq('id', project.id) // cascades connector_tokens
    }
  })

  test('a revoked token → 401, instantly, no deploy', async ({ request }) => {
    const db = dbClient()
    const isolationSlug = `mcp-revoke-${randomBytes(6).toString('hex')}`
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ slug: isolationSlug, api_key_hash: `spec-${randomBytes(8).toString('hex')}` })
      .select('id')
      .single()
    if (projectError || !project) throw new Error(`failed to insert disposable project: ${projectError?.message}`)

    const revokeToken = disposableToken()
    const { error: tokenError } = await db.from('connector_tokens').insert({ project_id: project.id, token: revokeToken })
    if (tokenError) throw new Error(`failed to insert disposable token: ${tokenError.message}`)

    try {
      const before = await rpc(request, revokeToken, 'tools/list')
      expect(before.status()).toBe(200)

      const { error: revokeError } = await db
        .from('connector_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token', revokeToken)
      if (revokeError) throw new Error(`failed to revoke token: ${revokeError.message}`)

      const after = await rpc(request, revokeToken, 'tools/list')
      expect(after.status()).toBe(401)
    } finally {
      await db.from('projects').delete().eq('id', project.id)
    }
  })
})
