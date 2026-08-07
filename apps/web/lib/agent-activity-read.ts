import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditAction } from './audit'

// app-shell-and-agent-rail · Sprint 1, Story 1.1 — the project-scoped activity read.
//
// ── Why this module exists SEPARATELY from lib/agent-activity.ts ───────────────────────────────
// lib/agent-activity.ts is `server-only` (it resolves the service-role client), and a `server-only`
// import throws in plain Node — so a Playwright spec cannot reach it. The property that matters
// most here is TENANCY: a read for project A must never return project B's rows. A spec that
// re-implements the query to check that proves nothing about the query the product runs.
//
// So the query lives here, taking its client as a parameter, and the spec exercises THIS function
// against two real projects in a real database. Dropping the `.eq('project_id')` below turns
// e2e/agent-activity.spec.ts red — which is the mutation check that makes the spec worth having
// (CODE-QUALITY rule 5). Same split as lib/task-lifecycle-facts.ts + lib/task-lifecycle-count.ts,
// for the same reason.

/**
 * D2 — the rail renders an explicit ALLOW-LIST, never `select *`.
 *
 * `AuditAction` is a growing union. A feed that rendered whatever it found would surface a new
 * action the day someone added one — unreviewed, unlabelled, and in front of a customer. Adding a
 * row here is the review gate: you cannot show a new action without also writing the sentence that
 * describes it in `describeAgentActivity` below, because the type will not let you.
 *
 * `tenant_provisioned` IS project-scoped and does belong here, despite the name (cross-review,
 * Mistral Vibe, PR #71, asked whether it could ever match): lib/provisioning.ts passes `projectId`
 * on both of its `recordAudit` calls — the project row is created BEFORE the audit row, and the
 * audit is what records that it happened. It is usually the first line a new tenant's rail shows.
 *
 * Two members of the union are deliberately ABSENT:
 *   • `signup_requested`   — emitted before a project exists, so it carries no `project_id` and can
 *                            never be scoped to a tenant's rail in the first place.
 *   • `task_event_emit_failed` — not something an actor did. It records that a tenant's automation
 *                            was never told about a lifecycle change. It belongs in an operational
 *                            alert, not in a list captioned "recent activity"; presenting it as an
 *                            activity line would read as "your agent did something" when the truth
 *                            is "we failed to tell you". Revisit deliberately, not by widening the
 *                            select.
 */
export const AGENT_ACTIVITY_ACTIONS = [
  'tenant_provisioned',
  'api_key_issued',
  'api_key_revoked',
  'agent_write_key_minted',
  'agent_write_key_revoked',
  'flag_read_key_minted',
  'flag_read_key_revoked',
  'flag_admin_key_minted',
  'flag_admin_key_revoked',
  'report_share_minted',
  'report_share_revoked',
  'destination_created',
  'destination_secret_rotated',
  'destination_enabled',
  'destination_disabled',
  'destination_test_sent',
  'destination_deleted',
  'delivery_replayed',
  'task_transitioned',
] as const satisfies readonly AuditAction[]

export type AgentActivityAction = (typeof AGENT_ACTIVITY_ACTIONS)[number]

/** Who performed the mutation. See `deriveActor` for why this is only ever these two values. */
export type AgentActivityActor = 'agent' | 'human'

export type AgentActivityEntry = {
  id: string
  action: AgentActivityAction
  actor: AgentActivityActor
  /** ISO-8601, straight from `audit_log.created_at`. Formatting is the component's business. */
  occurredAt: string
  /** One plain-language line. Never raw JSON — the rail is read by a PM, not by a log tail. */
  summary: string
}

/** The largest page the rail will ever ask for. A rail is a glance, not a ledger export (D4). */
export const AGENT_ACTIVITY_MAX_LIMIT = 50

type AuditRow = {
  id: unknown
  action: unknown
  created_at: unknown
  metadata: unknown
}

/**
 * D3 — agent attribution comes from `metadata.via === 'connector'`, never from an actor string.
 *
 * Copied verbatim from lib/task-lifecycle-facts.ts, whose header states the reasoning: matching
 * `claimed_by` against `claude` or `-bot` would infer identity from a caller-supplied free-text
 * label, letting a tenant relabel a human as an agent (or the reverse) and change what this rail
 * says about them. `via` is a fact about which credential and code path performed the mutation.
 *
 * Anything that is not the connector is `human` — including an unset `via`. That default is the
 * safe direction: mislabelling an agent action as human understates the agent, while the reverse
 * would credit an agent with something a person did, on the one surface whose whole pitch is that
 * it shows its work honestly.
 */
export function deriveActor(metadata: Record<string, unknown>): AgentActivityActor {
  return metadata.via === 'connector' ? 'agent' : 'human'
}

function label(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/** A short, non-secret handle for a row id, so a line can name its target without a UUID wall. */
function shortId(metadata: Record<string, unknown>, ...keys: string[]): string {
  const value = label(metadata, ...keys)
  return value ? value.slice(0, 8) : 'unknown'
}

/**
 * The plain-language line for one audit row.
 *
 * Pure and total: every member of `AGENT_ACTIVITY_ACTIONS` has a sentence, enforced by the
 * `Record<AgentActivityAction, …>` type below. The metadata keys read here are the ones the write
 * sites actually set (grep `recordAudit(` — lib/provisioning.ts, the per-surface `actions.ts`
 * files under app/app, lib/task-write-staging.ts); a missing key degrades to a still-true sentence
 * rather than rendering `undefined`.
 */
export function describeAgentActivity(
  action: AgentActivityAction,
  metadata: Record<string, unknown>
): string {
  const describers: Record<AgentActivityAction, () => string> = {
    tenant_provisioned: () => `provisioned the project ${label(metadata, 'slug') ?? ''}`.trim(),
    api_key_issued: () => `issued the ingest key “${label(metadata, 'label') ?? 'untitled'}”`,
    api_key_revoked: () => `revoked an ingest key (${shortId(metadata, 'keyId')})`,
    agent_write_key_minted: () => `minted the agent write key “${label(metadata, 'label') ?? 'untitled'}”`,
    agent_write_key_revoked: () => `revoked an agent write key (${shortId(metadata, 'keyId')})`,
    flag_read_key_minted: () => `minted the flag read key “${label(metadata, 'label') ?? 'untitled'}”`,
    flag_read_key_revoked: () => `revoked a flag read key (${shortId(metadata, 'keyId')})`,
    flag_admin_key_minted: () => `minted the flag admin key “${label(metadata, 'label') ?? 'untitled'}”`,
    flag_admin_key_revoked: () => `revoked a flag admin key (${shortId(metadata, 'keyId')})`,
    report_share_minted: () =>
      `minted the share link “${label(metadata, 'label') ?? 'untitled'}”${
        label(metadata, 'lens') ? ` (${label(metadata, 'lens')} lens)` : ''
      }`,
    report_share_revoked: () => `revoked a share link (${shortId(metadata, 'shareId')})`,
    destination_created: () => `created the destination “${label(metadata, 'name') ?? 'untitled'}”`,
    destination_secret_rotated: () =>
      `rotated a destination signing secret (${shortId(metadata, 'destinationId')})`,
    destination_enabled: () => `enabled a destination (${shortId(metadata, 'destinationId')})`,
    destination_disabled: () => `disabled a destination (${shortId(metadata, 'destinationId')})`,
    destination_test_sent: () =>
      `sent a test delivery (${shortId(metadata, 'destinationId')}) — ${
        label(metadata, 'disposition') ?? 'no disposition recorded'
      }`,
    destination_deleted: () => `deleted a destination (${shortId(metadata, 'destinationId')})`,
    delivery_replayed: () => `replayed a delivery (${shortId(metadata, 'deliveryId')})`,
    // The one action shared by the dashboard and the connector, which is exactly why the sentence
    // names the transition rather than the endpoint (lib/audit.ts' note on the shared label).
    task_transitioned: () => {
      const to = label(metadata, 'toStatus')
      const task = shortId(metadata, 'taskId')
      return to ? `moved task ${task} to ${to}` : `moved task ${task}`
    },
  }
  return describers[action]()
}

function isAllowedAction(action: unknown): action is AgentActivityAction {
  return (AGENT_ACTIVITY_ACTIONS as readonly string[]).includes(action as string)
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * Recent activity for ONE project, newest first.
 *
 * Returns `null` — never `[]` — when the read fails, so "we could not look" stays distinguishable
 * from "nothing happened" (CODE-QUALITY rule 8; the same `not_instrumented` vs `not_met`
 * distinction lib/task-lifecycle-facts.ts draws). Collapsing them would let an outage render as a
 * calm, empty, entirely wrong "your agent has done nothing".
 *
 * Tenancy: `projectId` is REQUIRED and every row is filtered by it. There is no cross-project
 * variant of this function and none may be added — AGENTS.md, "no request-derived read path may
 * cross projects".
 */
export async function readAgentActivity(
  db: SupabaseClient,
  projectId: string,
  limit = 20
): Promise<AgentActivityEntry[] | null> {
  if (!projectId) return null

  const { data, error } = await db
    .from('audit_log')
    .select('id, action, created_at, metadata')
    .eq('project_id', projectId)
    // D2 — the allow-list is applied IN the query, not after it. Filtering in JS would mean the rows
    // still crossed the wire and, worse, that `limit` was spent on rows nobody can render: a
    // destination outage writes one excluded `task_event_emit_failed` row per undelivered event, and
    // a page of those would bury real activity below the cut while the rail read "nothing recently".
    // e2e/agent-activity.spec.ts has the spec that dies when this line is removed.
    .in('action', AGENT_ACTIVITY_ACTIONS as unknown as string[])
    // D10 — order by `created_at`, NEVER by `id`. `audit_log.id` is `gen_random_uuid()`, so
    // ordering by it is arbitrary rather than chronological; lib/task-lifecycle-facts.ts carries a
    // cross-review scar for exactly that. The index audit_log_project_created_idx
    // (project_id, created_at DESC) already backs this exact shape.
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), AGENT_ACTIVITY_MAX_LIMIT))

  if (error) {
    console.error('[agent-activity] query failed:', error)
    return null
  }

  return (data ?? []).flatMap((row: AuditRow) => {
    // Belt and braces with the `.in()` above: if the allow-list and the query ever disagree, the
    // renderer must not be the thing that discovers it. An unknown action is dropped, not shown.
    if (!isAllowedAction(row.action)) return []
    const metadata = asMetadata(row.metadata)
    return [
      {
        id: String(row.id),
        action: row.action,
        actor: deriveActor(metadata),
        occurredAt: new Date(String(row.created_at)).toISOString(),
        summary: describeAgentActivity(row.action, metadata),
      },
    ]
  })
}
