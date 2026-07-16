import 'server-only'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isConnectorEnabled } from '@/lib/flags'
import { resolveConnectorToken, TOKEN_FORMAT } from '@/lib/connector-tokens'
import { checkRateLimit } from '@/lib/rate-limit'
import { getFeatureFunnelByProjectId } from '@/lib/tars-query'
import { getFeatureImpactByProjectId } from '@/lib/north-star-query'
import { getExperimentComparisonByProjectId } from '@/lib/ab-query'

// Story 2.1 (commercial-shell/sprint-2.md) — the read-only MCP connector. Pattern-lifted from
// medusa-bonsai's seller-agent-connect-mcp-url (opaque revocable token in the URL path), built on
// the real @modelcontextprotocol/sdk Server class rather than mb's hand-rolled JSON-RPC dispatcher.
//
// Runs on the Node.js runtime (not edge) — the SDK's transport needs it.
export const runtime = 'nodejs'

// Order matters: flag -> shape -> rate-limit -> resolve. The flag is checked before anything
// else so a disabled connector never leaks a 401/429 that implies the route exists at all. The
// cheap shape check runs BEFORE rate-limiting (not after, per a cross-review catch) — rate-limiting
// on the raw, unvalidated token first would let a malformed/arbitrarily-long token create an
// unbounded number of noisy rate_limit_hits keys, one per garbage string an attacker sends.
async function gate(token: string): Promise<{ ok: true; projectId: string; projectSlug: string } | Response> {
  if (!isConnectorEnabled()) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }

  if (!TOKEN_FORMAT.test(token)) {
    // Same 401 a truly unknown/revoked token gets below — no oracle on which reason.
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const rateLimited = await checkRateLimit(`mcp-connector:${token}`, { windowMs: 60_000, max: 60 })
  if (!rateLimited.ok) {
    return Response.json({ error: rateLimited.error }, { status: rateLimited.status })
  }

  const resolved = await resolveConnectorToken(token)
  if (!resolved.ok) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return { ok: true, projectId: resolved.projectId, projectSlug: resolved.projectSlug }
}

// Every tool call is scoped to this one resolved project — no tool schema below accepts a
// project/projectId param, so a token minted for project A has no way to even ask for project
// B's data. This is what makes the cross-project isolation acceptance true by construction.
function buildMcpServer(projectId: string, projectSlug: string): McpServer {
  const server = new McpServer({ name: 'golden-beans-connector', version: '1.0.0' })

  server.registerTool(
    'get_tars_funnel',
    {
      description: "Read this project's Targeted/Adopted/Retained funnel for a feature.",
      inputSchema: { featureKey: z.string().describe('The feature registry key, e.g. setup_guide') },
    },
    async ({ featureKey }) => {
      const result = await getFeatureFunnelByProjectId(projectId, projectSlug, featureKey)
      if (!result.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              note: 'Targeted/Adopted/Retained are registry-declared, not gateway-observed.',
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    'get_north_star',
    {
      description: "Read this project's North Star leading-input series for a feature.",
      inputSchema: { featureKey: z.string().describe('The feature registry key, e.g. setup_guide') },
    },
    async ({ featureKey }) => {
      const result = await getFeatureImpactByProjectId(projectId, projectSlug, featureKey)
      if (!result.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  )

  server.registerTool(
    'compare_experiment',
    {
      description: "Compare this project's A/B experiment variants for a metric event.",
      inputSchema: {
        experimentKey: z.string().describe('The experiment key, e.g. quick-upload-ui'),
        metricEvent: z.string().describe('The conversion event name, e.g. upload_completed'),
      },
    },
    async ({ experimentKey, metricEvent }) => {
      const result = await getExperimentComparisonByProjectId(projectId, projectSlug, experimentKey, metricEvent)
      if (!result.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              note: 'Basic lift only — % difference in conversion rate vs a baseline variant. No statistical-significance engine.',
            }),
          },
        ],
      }
    },
  )

  return server
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gated = await gate(token)
  if (gated instanceof Response) return gated

  const server = buildMcpServer(gated.projectId, gated.projectSlug)
  // Stateless: a fresh server + transport per request, no session ID, no connection reuse —
  // matches the read-only, single-call-per-request shape of these three tools.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}
