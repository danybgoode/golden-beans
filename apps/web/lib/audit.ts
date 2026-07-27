import 'server-only'
import { getSupabaseServiceClient } from './supabase'

// multi-tenant-activation · Sprint 2, Story 2.2 — the credential + provisioning audit trail.
//
// Append-only by grant (the migration gives service_role SELECT + INSERT and deliberately no
// UPDATE/DELETE), so this module can only ever add to the record.

export type AuditAction =
  | 'signup_requested' // a signup form submission passed the gate + guards (no account yet)
  | 'tenant_provisioned' // a confirmed user got a project + owner membership + first key
  | 'api_key_issued'
  | 'api_key_revoked'
  // event-destination-router · Sprint 2, Story 2.1 — the destination lifecycle. Same append-only
  // trail; metadata carries the destination id + non-secret context, never the signing secret.
  | 'destination_created'
  | 'destination_secret_rotated'
  | 'destination_enabled'
  | 'destination_disabled'
  | 'destination_test_sent'
  | 'destination_deleted'
  // event-destination-router · Sprint 2, Story 2.2 — operator-initiated replay of a delivery.
  | 'delivery_replayed'
  // pod-report · Sprint 3, Story 3.1 — the share-link lifecycle. These sit beside the api_key_*
  // actions above rather than in a trail of their own, matching the decision one layer down: share
  // links are rows in the same credential table with the same revoke path, so "who handed our
  // delivery data to an outsider, and when was it killed?" is answered from one place.
  // Metadata carries the row id, the lens and the label — never the token.
  | 'report_share_minted'
  | 'report_share_revoked'
  // signals-loop · Sprint 2, Story 2.2 — the task lifecycle. ONE action with the transition in its
  // metadata, rather than task_claimed/task_resolved/task_dismissed as separate labels: the three
  // share a single code path (transition_task), and three labels over one path is how a record ends
  // up describing the endpoint someone happened to call instead of what actually changed — the
  // pod-report S3 finding, one layer up. Sprint 3's agent writes reuse this same action, so
  // "who moved this task, human or agent?" is answered from one place.
  | 'task_transitioned'
  // signals-loop · Sprint 3, Story 3.1 — the agent-write credential lifecycle. Their OWN labels,
  // beside `api_key_*` and `report_share_*` rather than folded into them, because these three
  // credential kinds share one table and one revoke shape but answer completely different incident
  // questions: "why did ingest stop?", "who handed our numbers to an outsider?", and "which agent
  // credential moved this task?". A trail that cannot separate them is read as authoritative and
  // answers all three wrong (LEARNINGS: an audit label that can be chosen by picking an endpoint is
  // worse than no audit log). lib/agent-write-keys.ts pins the labels to the scope with a predicate
  // in the UPDATE, so the endpoint cannot decide what the record says.
  | 'agent_write_key_minted'
  | 'agent_write_key_revoked'
  | 'flag_read_key_minted'
  | 'flag_read_key_revoked'
  // A lifecycle event that could not be emitted. The task row still holds the truth; this records
  // that a tenant's automation was never told, so the gap is queryable rather than only a log line.
  | 'task_event_emit_failed'

export type AuditEntry = {
  action: AuditAction
  projectId?: string | null
  actorUserId?: string | null
  /** Non-secret context ONLY — a label, a slug, a count. Never a plaintext key or a password. */
  metadata?: Record<string, unknown>
}

// Writing an audit row must NEVER fail the action it describes. A revoke that succeeded in
// api_keys but threw here would leave the operator believing a leaked key is still live — the
// far more dangerous outcome than a missing log line. So: log the failure loudly and return.
//
// The deliberate consequence is that this trail is best-effort, not a ledger you can prove
// completeness against. That is the right trade for an operational audit log; it would be the
// wrong trade for anything billing- or compliance-load-bearing, which this is not.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient()
    const { error } = await supabase.from('audit_log').insert({
      project_id: entry.projectId ?? null,
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      metadata: entry.metadata ?? {},
    })
    if (error) console.error(`[audit] failed to record ${entry.action}:`, error)
  } catch (err) {
    console.error(`[audit] threw recording ${entry.action}:`, err)
  }
}
