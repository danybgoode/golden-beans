import 'server-only'
import { getSupabaseServiceClient } from './supabase'

// multi-tenant-activation · Sprint 2, Story 2.2 — the credential + provisioning audit trail.
//
// Append-only by grant (the migration gives service_role SELECT + INSERT and deliberately no
// UPDATE/DELETE), so this module can only ever add to the record.

export type AuditAction =
  | 'signup_requested'      // a signup form submission passed the gate + guards (no account yet)
  | 'tenant_provisioned'    // a confirmed user got a project + owner membership + first key
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
