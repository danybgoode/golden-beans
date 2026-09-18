import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// golden-frijoles-cli · Sprint 3, Story 3.4 — the MCP flag WRITE tools' authorization, exercised.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────────────
// Review of PR #151 (Codex): "no test exercises a connector request with an owner `gf_pat_…`". The
// existing connector specs make unauthenticated requests and show the write tools ABSENT — which
// proves the gate is closed, and says nothing about whether it opens for the right caller and ONLY
// the right caller. That second half is the security property of Story 3.4, so it is asserted here
// in every direction that matters:
//
//   owner of THIS project           → write tools present, and a write lands
//   member (not owner) of it        → absent
//   owner of a DIFFERENT project    → absent — a PAT for A plus a connector for B authorizes nothing
//   an ingest key in the header     → absent
//   a revoked CLI token             → absent

const DEMO_SLUG = 'golden-beans-demo'
const WRITE_TOOLS = ['create_flag', 'kill_flag', 'rollout_flag', 'set_flag']

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function demoConnectorToken(): Promise<string> {
  const client = db()
  const { data: project } = await client.from('projects').select('id').eq('slug', DEMO_SLUG).single()
  if (!project) throw new Error('demo project not seeded')
  const { data } = await client
    .from('connector_tokens')
    .select('token')
    .eq('project_id', project.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!data) throw new Error('demo project has no live connector token')
  return data.token as string
}

async function seedAccount(slug: string, role: 'owner' | 'member') {
  const client = db()
  const { data: created } = await client.auth.admin.createUser({
    email: `mcp-flags-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  const userId = created.user!.id
  const { data: project } = await client.from('projects').select('id').eq('slug', slug).single()
  await client.from('project_members').insert({ user_id: userId, project_id: project!.id, role })
  const token = `gf_pat_${randomBytes(32).toString('base64url')}`
  await client.from('cli_tokens').insert({ user_id: userId, token_hash: sha256(token), label: 'mcp spec' })
  return {
    token,
    cleanup: async () => {
      await client.from('project_members').delete().eq('user_id', userId)
      await client.auth.admin.deleteUser(userId)
    },
  }
}

async function rpc(
  request: APIRequestContext,
  connector: string,
  bearer: string | null,
  method: string,
  params?: unknown
) {
  const response = await request.post(`/api/v1/public/mcp/c/${connector}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    data: { jsonrpc: '2.0', id: 1, method, params },
  })
  return response.json()
}

async function toolNames(request: APIRequestContext, connector: string, bearer: string | null) {
  const body = await rpc(request, connector, bearer, 'tools/list')
  return (body.result.tools as Array<{ name: string }>).map((tool) => tool.name)
}

test.describe('MCP flag write tools', () => {
  test('an OWNER of the connector’s project gets the write tools, and a write lands', async ({ request }) => {
    const connector = await demoConnectorToken()
    const owner = await seedAccount(DEMO_SLUG, 'owner')
    try {
      const names = await toolNames(request, connector, owner.token)
      for (const tool of WRITE_TOOLS) expect(names, `${tool} missing for an owner`).toContain(tool)

      // And it WORKS, through the same executor the CLI uses — not merely listed.
      const key = `spec.mcp_${randomBytes(4).toString('hex')}`
      const body = await rpc(request, connector, owner.token, 'tools/call', {
        name: 'create_flag',
        arguments: { key, polarity: 'kill-switch', environments: ['development'], reason: 'mcp spec' },
      })
      const result = JSON.parse(body.result.content[0].text)
      expect(result.ok).toBe(true)
      expect(result.serving).toBe(true)
      expect(result.environments[0].status).toBe('applied')
    } finally {
      await owner.cleanup()
    }
  })

  test('a MEMBER who is not an owner does not get them', async ({ request }) => {
    const connector = await demoConnectorToken()
    const member = await seedAccount(DEMO_SLUG, 'member')
    try {
      const names = await toolNames(request, connector, member.token)
      for (const tool of WRITE_TOOLS) expect(names).not.toContain(tool)
    } finally {
      await member.cleanup()
    }
  })

  test('⚠️ an owner of a DIFFERENT project does not get them — the pairing must agree', async ({
    request,
  }) => {
    // A CLI token for project-one plus a connector token for the demo project authorizes NOTHING:
    // not the demo (this account does not own it) and not project-one (the connector never proved
    // the caller may touch it). The ownership check is against the id the CONNECTOR resolved.
    const connector = await demoConnectorToken()
    const elsewhere = await seedAccount('project-one', 'owner')
    try {
      const names = await toolNames(request, connector, elsewhere.token)
      for (const tool of WRITE_TOOLS) expect(names).not.toContain(tool)
    } finally {
      await elsewhere.cleanup()
    }
  })

  test('an ingest key, and a revoked CLI token, do not get them', async ({ request }) => {
    const connector = await demoConnectorToken()
    const owner = await seedAccount(DEMO_SLUG, 'owner')
    try {
      const ingest = await toolNames(request, connector, 'local-test-key-do-not-use-in-prod')
      for (const tool of WRITE_TOOLS) expect(ingest).not.toContain(tool)

      await db()
        .from('cli_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', sha256(owner.token))
      const revoked = await toolNames(request, connector, owner.token)
      for (const tool of WRITE_TOOLS) expect(revoked).not.toContain(tool)
      // The READ tools stay — they answer what a connector token already authorizes.
      expect(revoked).toContain('list_flags')
    } finally {
      await owner.cleanup()
    }
  })
})
