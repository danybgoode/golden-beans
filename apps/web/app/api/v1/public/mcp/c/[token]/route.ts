import 'server-only'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  isConnectorEnabled,
  isConnectorWriteToolEnabled,
  isExperimentGovernanceMcpToolEnabled,
  isJourneyMcpToolEnabled,
  isTaskMcpToolEnabled,
} from '@/lib/flags'
import { authorizeAgentWrite } from '@/lib/agent-write-keys'
import { proposeTaskChange, applyTaskChange } from '@/lib/task-write-staging'
import { listTasksByProjectId, getTaskByProjectId, promoteEligibleSignals } from '@/lib/tasks'
import { evaluateFrictionForProject } from '@/lib/friction-eval'
import { resolveConnectorToken, TOKEN_FORMAT } from '@/lib/connector-tokens'
import { checkRateLimit } from '@/lib/rate-limit'
import { getFeatureFunnelByProjectId } from '@/lib/tars-query'
import { getFeatureImpactByProjectId } from '@/lib/north-star-query'
import { getExperimentComparisonByProjectId } from '@/lib/ab-query'
import { parseJourneyCohortRequest } from '@/lib/journey-cohort-request'
import { getJourneyCohortByProjectId } from '@/lib/journey-query'
import { validateJourneyKey } from '@/lib/journey-definition'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { validateExperimentKey } from '@/lib/experiment-definition'

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
function buildMcpServer(projectId: string, projectSlug: string, writeKeyId: string | null): McpServer {
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
    }
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
    }
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
      const result = await getExperimentComparisonByProjectId(
        projectId,
        projectSlug,
        experimentKey,
        metricEvent
      )
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
    }
  )

  // Governed analysis is a separate, born-OFF tool. The legacy compare_experiment contract above
  // stays unchanged while this extension is dark, and every enabled call remains scoped to the
  // connector token's already-resolved project.
  if (isExperimentGovernanceMcpToolEnabled()) {
    server.registerTool(
      'get_experiment_analysis',
      {
        description:
          "Read this project's immutable-version experiment plan, trust diagnostics and descriptive metrics.",
        inputSchema: {
          experimentKey: z
            .string()
            .max(64)
            .regex(/^[a-z][a-z0-9_-]{0,63}$/),
          version: z.number().int().positive().max(1_000_000),
          asOf: z
            .string()
            .optional()
            .describe('Non-future explicit-offset snapshot; omitted captures server now.'),
          segmentField: z.enum(['source', 'channel', 'campaign', 'plan', 'region']).optional(),
          segmentValue: z.union([z.string().max(64), z.number().int(), z.boolean()]).optional(),
        },
      },
      async ({ experimentKey, version, asOf, segmentField, segmentValue }) => {
        if (!validateExperimentKey(experimentKey)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, reason: 'invalid_request' }) }],
            isError: true,
          }
        }
        const parsed = parseExperimentAnalysisRequest({
          version,
          asOf,
          segmentField,
          segmentValue,
        })
        if (!parsed.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, reason: 'invalid_request', error: parsed.error }),
              },
            ],
            isError: true,
          }
        }
        const result = await getExperimentAnalysisByProjectId(
          projectId,
          projectSlug,
          experimentKey,
          parsed.request
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          ...(!result.ok ? { isError: true } : {}),
        }
      }
    )
  }

  // Journey reads have their own born-OFF enablement gate in addition to the connector's route-wide
  // flag and revocable token. While dark, the tool does not exist; the three legacy tools above
  // remain byte-for-byte compatible.
  if (isJourneyMcpToolEnabled()) {
    server.registerTool(
      'get_journey_cohort',
      {
        description: "Read this project's bounded, version-explicit journey cohort.",
        inputSchema: {
          journeyKey: z
            .string()
            .max(64)
            .regex(/^[a-z][a-z0-9_]{0,63}$/)
            .describe('The lower_snake_case stable journey key.'),
          version: z.number().int().positive().describe('The immutable definition version.'),
          from: z.string().describe('Inclusive explicit-offset cohort timestamp.'),
          to: z.string().describe('Exclusive explicit-offset cohort timestamp.'),
          asOf: z
            .string()
            .optional()
            .describe(
              'Non-future explicit-offset receipt-time snapshot; omitted first pages capture server now.'
            ),
          timezone: z
            .string()
            .default('UTC')
            .describe('IANA display timezone; window semantics come from the offset-bearing instants.'),
          staleAfterHours: z.number().int().positive().max(8760).default(24),
          drilldown: z.string().optional().describe('A drilldown key returned by the cohort result.'),
          cursor: z.string().optional().describe('Opaque next cursor from a prior drilldown page.'),
          pageSize: z.number().int().positive().max(100).default(25),
        },
      },
      async ({
        journeyKey,
        version,
        from,
        to,
        asOf,
        timezone,
        staleAfterHours,
        drilldown,
        cursor,
        pageSize,
      }) => {
        if (!validateJourneyKey(journeyKey)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, reason: 'invalid_request', error: 'invalid journey key' }),
              },
            ],
            isError: true,
          }
        }
        const parsed = parseJourneyCohortRequest({
          version: String(version),
          from,
          to,
          asOf,
          timezone,
          staleAfterHours: String(staleAfterHours),
          drilldown,
          cursor,
          pageSize: String(pageSize),
        })
        if (!parsed.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, reason: 'invalid_request', error: parsed.error }),
              },
            ],
            isError: true,
          }
        }
        const result = await getJourneyCohortByProjectId(
          projectId,
          journeyKey,
          parsed.version,
          parsed.options
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          ...(!result.ok ? { isError: true } : {}),
        }
      }
    )
  }

  // ── signals-loop · Sprint 2, Story 2.3 — the task READ tools ────────────────────────────────
  // Additive siblings of the four tools above, behind BOTH the connector gate and the signals gate
  // (isTaskMcpToolEnabled), following the journey/governance precedent. While either is off the
  // tools do not EXIST — they are absent from tools/list, not present-and-erroring, which is the
  // difference between a dark feature and a discoverable one.
  //
  // Neither tool takes a project parameter. Scope comes from the token this route already resolved
  // and has nowhere else to come from, which is what makes cross-tenant isolation true by
  // construction rather than by a filter someone has to remember to write.
  //
  // Plain tools, NOT the MCP tasks extension: it is SEP-2663, moved out of core after production
  // feedback (epic README, Amendment 1). Revisit when it is promoted back into core — not on a
  // version bump.
  if (isTaskMcpToolEnabled()) {
    server.registerTool(
      'list_tasks',
      {
        description:
          "Read this project's ranked task queue — problems the engine grouped and promoted, most impactful first. Each task carries an evidence bundle (feature, flag state, signal counts, scrubbed sample).",
        inputSchema: {
          status: z
            .enum(['open', 'claimed', 'resolved', 'dismissed'])
            .optional()
            .describe('Filter by lifecycle status. Omit for the whole queue.'),
          limit: z.number().int().positive().max(100).default(25),
        },
      },
      async ({ status, limit }) => {
        // ── This is the lazy trigger the whole friction design rests on (Amendment 3) ──────────
        // Sprint 1 shipped evaluateFrictionForProject() with NO production caller, and recorded
        // that gap in sprint-1.md rather than letting it look finished. THIS is the caller it owed.
        //
        // Both run before the read, for the one resolved project, so an agent pulling its queue is
        // what makes the queue current — which is the accepted cost of declining a cross-tenant
        // cron (and therefore an AGENTS.md scheduler-exemption registry row).
        //
        // Both are throttled internally and both fail soft: a detector or promotion hiccup must
        // degrade to a slightly stale queue, never to a failed read. An agent that cannot list its
        // work because a background refresh broke is worse off than one reading last hour's list.
        await evaluateFrictionForProject(projectId, projectSlug).catch(() => null)
        await promoteEligibleSignals(projectId).catch(() => 0)

        try {
          const tasks = await listTasksByProjectId(projectId, { status, limit })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  tasks,
                  note: 'Ranked by users affected × frequency, decayed by recency. Evidence is engine-computed — no model wrote any field of it.',
                }),
              },
            ],
          }
        } catch {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, reason: 'query_failed' }) }],
            isError: true,
          }
        }
      }
    )

    server.registerTool(
      'get_task',
      {
        description: "Read one of this project's tasks in full, including its complete evidence bundle.",
        inputSchema: {
          taskId: z.string().uuid().describe('The task id, as returned by list_tasks.'),
        },
      },
      async ({ taskId }) => {
        const task = await getTaskByProjectId(projectId, taskId)
        if (!task) {
          // Same answer for "no such task" and "another tenant's task". A distinguishable response
          // would turn this into an existence oracle over other projects' task ids — the house rule
          // every tenant-scoped surface in this codebase follows.
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, reason: 'not_found' }) }],
            isError: true,
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, task }) }] }
      }
    )
  }

  // ── signals-loop · Sprint 3, Story 3.2 — the STAGED WRITE tools ─────────────────────────────
  // The engine's first public mutation surface. Registered only when ALL of the following hold:
  //   • the connector gate, the signals gate AND CONNECTOR_WRITES_ENABLED are on
  //     (isConnectorWriteToolEnabled), and
  //   • the caller presented an `agent_write` Bearer key that resolved to THIS SAME project
  //     (writeKeyId is non-null — see POST, where the two credentials are compared).
  //
  // When either fails the tools do not EXIST: absent from tools/list, not present-and-erroring.
  // That is the same "dark means invisible" rule the read tools follow, and here it also means an
  // agent without a write credential is never told that a write surface is there to attack.
  //
  // ── Why the credential is not re-checked inside each tool ───────────────────────────────────
  // Because it cannot be bypassed: the tools are not REGISTERED unless it passed. Re-resolving the
  // key per call would be a second place for the rule to live and a second place to get it wrong —
  // and pod-report S3's cross-review caught precisely the shape where a route re-resolves identity
  // it was already handed. `writeKeyId` is carried through for the audit trail, not re-derived.
  if (isConnectorWriteToolEnabled() && writeKeyId) {
    server.registerTool(
      'propose_task_change',
      {
        description:
          "Stage a change to one of this project's tasks — claim, resolve or dismiss. This does NOT change anything: it returns a preview of exactly what would happen plus a single-use confirmation token, which you pass to apply_task_change to actually perform it.",
        inputSchema: {
          taskId: z.string().uuid().describe('The task id, as returned by list_tasks.'),
          action: z
            .enum(['claim', 'resolve', 'dismiss'])
            .describe('claim = take ownership; resolve = close as done; dismiss = close without acting.'),
          actor: z
            .string()
            .min(1)
            .max(120)
            .optional()
            .describe('Who is doing this, e.g. "claude-code" or a person. REQUIRED for claim.'),
          resolution: z
            .enum(['fixed', 'wont_fix', 'duplicate', 'not_reproducible'])
            .optional()
            .describe('Only for resolve. Defaults to fixed.'),
          evidencePointer: z
            .string()
            .max(500)
            .optional()
            .describe(
              'Only for resolve. A commit SHA or a URL is recorded as EVIDENCE; free text is stored as a note and the resolution is recorded as having no evidence.'
            ),
        },
      },
      async ({ taskId, action, actor, resolution, evidencePointer }) => {
        const result = await proposeTaskChange({
          projectId,
          taskId,
          action,
          actor,
          resolution,
          evidencePointer,
          agentKeyId: writeKeyId,
        })
        if (!result.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: true,
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...result,
                note: 'NOTHING HAS CHANGED YET. Review the preview, then call apply_task_change with this confirmationToken to perform it. The token is single-use and expires.',
              }),
            },
          ],
        }
      }
    )

    server.registerTool(
      'apply_task_change',
      {
        description:
          'Perform a change previously staged by propose_task_change. Consumes the confirmation token — it works exactly once.',
        inputSchema: {
          confirmationToken: z
            .string()
            .min(1)
            .describe('The confirmationToken returned by propose_task_change.'),
        },
      },
      async ({ confirmationToken }) => {
        // The APPLYING credential, so the staging layer can refuse a token proposed by a
        // different key (cross-review, Codex, PR #38).
        const result = await applyTaskChange(projectId, confirmationToken, writeKeyId)
        // `isError` stated unconditionally, matching propose_task_change (cross-review, Agy,
        // PR #38): two tools on the same surface returning differently-SHAPED payloads for the same
        // outcome is a thing a client has to special-case, and the conditional spread made the
        // difference invisible in review.
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: !result.ok,
        }
      }
    )
  }

  return server
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gated = await gate(token)
  if (gated instanceof Response) return gated

  // ── The second credential (Amendment 2) ─────────────────────────────────────────────────────
  // The connector token in the URL identified the project and authorized reads. A WRITE additionally
  // requires an `agent_write` Bearer key that resolves to the SAME project. Both must agree or the
  // write tools are not registered at all.
  //
  // This is resolved once per request, here, rather than inside each tool: registration is the gate,
  // so there is no code path on which a tool exists without it having passed.
  //
  // A failure is deliberately SILENT — no 401, no error body. The read tools must keep working for a
  // caller with no write key (that is the ordinary case), and a distinguishable response would tell
  // an attacker holding only a connector token whether a write surface exists and whether a guessed
  // key was closer. The observable consequence of any failure — missing, unknown, revoked, expired,
  // or belonging to another project — is identical: the write tools are absent from tools/list.
  const bearer = req.headers.get('authorization')
  const presentedKey = bearer?.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : null
  const writeAuth = presentedKey ? await authorizeAgentWrite(gated.projectId, presentedKey) : null
  const writeKeyId = writeAuth?.ok ? writeAuth.keyId : null

  const server = buildMcpServer(gated.projectId, gated.projectSlug, writeKeyId)
  // Stateless: a fresh server + transport per request, no session ID, no connection reuse —
  // matches the read-only, single-call-per-request shape of these tools.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}
