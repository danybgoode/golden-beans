// event-destination-router · Sprint 2, Story 2.2 — the outbox dispatcher, now SENDING for real.
//
// Story 1.2 shipped this dark: it claimed due work and released it, because there was no signed send
// and no retry engine yet. Story 2.2 replaces the release with the real thing — sign, POST, and
// settle each row to delivered / failed (retry scheduled) / dead (terminal) based on the answer.
//
// WHAT CHANGED FROM SPRINT 1, PRECISELY:
//   • The two-statement select-then-update claim is now ONE atomic `claim_deliveries` RPC with FOR
//     UPDATE SKIP LOCKED (20260724100000_delivery_retry.sql) — the successor the S1 file named. The
//     RPC also reclaims rows stranded in_flight by a dead worker, closing S1's documented residual
//     window before the gate flips.
//   • A claimed row is now SENT, then settled. attempt_count is incremented as part of settling —
//     a real attempt was made, so the backoff/dead-letter maths (lib/retry-policy.ts) is now driven
//     by a true count, not the imaginary one S1 refused to write.
//
// STILL ALWAYS PROJECT-SCOPED (AGENTS.md rule #1): projectId is required; the RPC and every settle
// re-assert it. The production trigger (app/api/internal/dispatch-deliveries) enumerates projects
// with due work and calls this once per project, so one worker's blast radius is one tenant.
//
// STILL (almost) ZERO-IMPORT, and this is load-bearing: the Supabase client AND fetch are INJECTED,
// and this module imports NO `server-only` module (it does its own db reads rather than calling the
// server-only lib/destinations.ts). That is what lets a spec call dispatchPendingDeliveries() with a
// real db + a fake fetch and observe every settle branch — the LEARNINGS.md rule about guards behind
// preconditions. lib/destinations.ts remains the ONLY reader of a signing secret on the app side;
// here the secret is read through the injected service-role db on the internal send path, never
// exposed to any surface.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDestinationDeliveryEnabled } from './flags'
import { deliverWebhook, type DeliveryDisposition } from './webhook-delivery'
import { serializeEnvelope, buildEventEnvelope, type CanonicalEventRow } from './delivery-payload'
import { retryDecision } from './retry-policy'

/**
 * How many rows one dispatcher pass may take ownership of. Bounded because a dispatcher runs on a
 * serverless function with a wall-clock limit: a small batch that runs again beats a large batch that
 * times out mid-send and strands its claims in_flight (the stale-reclaim in the RPC rescues those,
 * but not sending them in the first place is better).
 */
export const MAX_CLAIM_BATCH = 50

/**
 * Statuses the claim considers. Kept as an exported const (the RPC encodes the same set) so a spec
 * can pin the invariant that in_flight/delivered/dead are NOT freshly claimable — claiming a row
 * another worker owns is the double-delivery this whole design bounds. (in_flight IS reclaimed when
 * STALE, but that is a time-gated exception the RPC owns, not a claimable status.)
 */
export const CLAIMABLE_STATUSES = ['pending', 'failed'] as const

/** How long a row may sit in_flight before a later pass reclaims it as a dead-worker casualty. */
export const STALE_CLAIM_MS = 5 * 60 * 1000

type ClaimedRow = {
  id: string
  project_id: string
  event_id: string
  destination_id: string
  attempt_count: number
}

/** The final resting status a settle wrote for one claimed row. */
export type DeliverySettlement = {
  id: string
  event_id: string
  destination_id: string
  disposition: DeliveryDisposition | 'skipped'
  status: 'delivered' | 'failed' | 'dead' | 'in_flight'
  attemptCount: number
}

export type DispatchOutcome =
  /** The gate is OFF. Nothing read, nothing claimed, nothing sent. */
  | { ok: true; dispatched: false; reason: 'disabled'; claimed: [] }
  /** The gate is ON. `claimed` are the rows this pass took ownership of and settled. */
  | { ok: true; dispatched: true; reason: 'claimed'; claimed: DeliverySettlement[] }
  /** The delivery subsystem itself is unhealthy. Reported, never thrown. */
  | { ok: false; dispatched: false; reason: 'error'; error: string; claimed: [] }

export type DispatchOptions = {
  limit?: number
  now?: Date
  /** Injected for tests; defaults to global fetch (via deliverWebhook). */
  fetchImpl?: typeof fetch
  staleAfterMs?: number
}

/**
 * One dispatcher pass for ONE tenant. NEVER THROWS — it is called from a background/cron context
 * where an unhandled rejection is invisible, and a delivery failure must never be able to tell a
 * caller anything about ingest. Errors come back as a value.
 *
 * ORDER: the gate is consulted BEFORE any query, so a disabled deployment does not so much as read
 * the outbox — turning the flag off is a true no-op, not a slow data-loss bug that flips rows to
 * in_flight on a deployment that can never move them.
 */
export async function dispatchPendingDeliveries(
  db: SupabaseClient,
  projectId: string,
  options: DispatchOptions = {},
): Promise<DispatchOutcome> {
  if (!isDestinationDeliveryEnabled()) {
    return { ok: true, dispatched: false, reason: 'disabled', claimed: [] }
  }

  const now = options.now ?? new Date()
  const limit = Math.max(1, Math.min(options.limit ?? MAX_CLAIM_BATCH, MAX_CLAIM_BATCH))
  const staleAfterMs = options.staleAfterMs ?? STALE_CLAIM_MS

  try {
    const { data: claimed, error: claimError } = await db.rpc('claim_deliveries', {
      p_project_id: projectId,
      p_limit: limit,
      p_now: now.toISOString(),
      // Postgres interval accepts an ISO-8601 duration or a "N milliseconds" string; the latter is
      // unambiguous and avoids float-seconds rounding.
      p_stale_after: `${staleAfterMs} milliseconds`,
    })
    if (claimError) throw new Error(`could not claim deliveries: ${claimError.message}`)

    const rows = (claimed ?? []) as ClaimedRow[]
    const settlements: DeliverySettlement[] = []
    for (const row of rows) {
      // One bad row must not sink the batch — settle it in isolation. A throw here would leave the
      // rest of the claimed rows stuck in_flight until the stale-reclaim, for no reason.
      settlements.push(await sendAndSettle(db, projectId, row, now, options.fetchImpl))
    }

    return { ok: true, dispatched: true, reason: 'claimed', claimed: settlements }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[delivery-dispatch] pass failed:', error)
    return { ok: false, dispatched: false, reason: 'error', error, claimed: [] }
  }
}

// Loads the destination secret + the canonical event, signs and POSTs, then writes the row's final
// status. The claim already guaranteed the destination is enabled + deliverable, so a missing
// destination/event here is a real anomaly (a concurrent tenant offboarding mid-pass) — parked back
// to pending rather than lost, so the next pass re-evaluates instead of dead-lettering a row that a
// transient read failure touched.
async function sendAndSettle(
  db: SupabaseClient,
  projectId: string,
  row: ClaimedRow,
  now: Date,
  fetchImpl?: typeof fetch,
): Promise<DeliverySettlement> {
  const nowIso = now.toISOString()

  const { data: dest } = await db
    .from('event_destinations')
    .select('id, name, target_url, signing_secret')
    .eq('id', row.destination_id)
    .eq('project_id', projectId)
    .maybeSingle()
  const { data: event } = await db
    .from('events')
    .select(
      'id, event, occurred_at, created_at, user_id, feature_id, tags, metadata, actor_type, actor_id, subject_type, subject_id, correlation_id',
    )
    .eq('id', row.event_id)
    .eq('project_id', projectId)
    .maybeSingle()

  if (!dest || !dest.target_url || !dest.signing_secret || !event) {
    // Anomaly (see above): release to pending, unattempted. attempt_count untouched.
    await db
      .from('event_deliveries')
      .update({ status: 'pending', claimed_at: null, updated_at: nowIso })
      .eq('id', row.id)
      .eq('project_id', projectId)
      .eq('status', 'in_flight')
    return { id: row.id, event_id: row.event_id, destination_id: row.destination_id, disposition: 'skipped', status: 'pending' as unknown as 'in_flight', attemptCount: row.attempt_count }
  }

  const body = serializeEnvelope(buildEventEnvelope(event as CanonicalEventRow))
  const result = await deliverWebhook(
    { id: dest.id as string, name: dest.name as string, targetUrl: dest.target_url as string, signingSecret: dest.signing_secret as string },
    body,
    { fetchImpl, deliveryId: row.id, eventId: row.event_id },
  )

  const attemptCount = row.attempt_count + 1 // this pass made one real attempt
  const patch = settlePatch(result.disposition, attemptCount, now, result.error)

  // Settle scoped by id + project_id + status='in_flight' — we only write the row WE own this pass.
  await db
    .from('event_deliveries')
    .update({ ...patch, attempt_count: attemptCount, last_attempt_at: nowIso, updated_at: nowIso })
    .eq('id', row.id)
    .eq('project_id', projectId)
    .eq('status', 'in_flight')

  return {
    id: row.id,
    event_id: row.event_id,
    destination_id: row.destination_id,
    disposition: result.disposition,
    status: patch.status,
    attemptCount,
  }
}

// Maps an HTTP disposition + attempt count to the row's next state. The retry SCHEDULE is
// lib/retry-policy.ts's; this only translates its decision into a status + next_attempt_at.
function settlePatch(
  disposition: DeliveryDisposition,
  attemptCount: number,
  now: Date,
  error: string | null,
): { status: 'delivered' | 'failed' | 'dead'; next_attempt_at?: string; last_error: string | null; claimed_at: null } {
  if (disposition === 'delivered') {
    return { status: 'delivered', last_error: null, claimed_at: null }
  }
  if (disposition === 'permanent') {
    // The receiver rejected THIS request (a 4xx that isn't 408/429). Retrying identical bytes can't
    // help, so dead-letter immediately instead of burning the whole backoff schedule.
    return { status: 'dead', last_error: error, claimed_at: null }
  }
  // retryable: schedule the next attempt, or dead-letter if the budget is spent.
  const decision = retryDecision(attemptCount)
  if (!decision.retry) {
    return { status: 'dead', last_error: error, claimed_at: null }
  }
  return {
    status: 'failed',
    next_attempt_at: new Date(now.getTime() + decision.delayMs).toISOString(),
    last_error: error,
    claimed_at: null,
  }
}
