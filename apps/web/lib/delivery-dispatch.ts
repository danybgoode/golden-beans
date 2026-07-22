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
import { deliverWebhook, type DeliveryDisposition, DELIVERY_TIMEOUT_MS } from './webhook-delivery'
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

/** Wall-clock ONE claimed row may need end-to-end before the deadline: the DNS resolve pre-check
 *  (~3s), the HTTP send (DELIVERY_TIMEOUT_MS), two DB reads and the settle RPC (cross-review, Codex
 *  rounds 4 & 8 — the earlier 3s slack covered only DNS+HTTP). Reserved before each send so a row
 *  begun near the deadline still FINISHES rather than being killed in_flight. */
export const PER_SEND_BUDGET_MS = DELIVERY_TIMEOUT_MS + 8_000

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
  /** `skipped` = a benign non-send (destination disabled/removed). `internal_error` = OUR read/write
   *  failed — distinct so the cron can surface it instead of reporting a healthy pass (cross-review,
   *  Codex round 13). */
  disposition: DeliveryDisposition | 'skipped' | 'internal_error'
  status: 'delivered' | 'failed' | 'dead' | 'pending' | 'in_flight'
  attemptCount: number
  /** Whether the settling UPDATE actually landed on the row WE own. False when the row was reclaimed
   *  out from under us or the write failed — in which case we must NOT report the send as counted
   *  (cross-review, Codex 2026-07-21: a send reported as success without being persisted lets the
   *  same event be resent while the cron reports it done). */
  persisted: boolean
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
  /** Injected for tests; when omitted, deliverWebhook uses its connection-PINNED sender (the
   *  SSRF-safe production path) — NOT global fetch. */
  fetchImpl?: typeof fetch
  /** Injected for tests; the SSRF host resolver (see lib/webhook-delivery.ts). */
  resolveHost?: (hostname: string) => Promise<string[]>
  staleAfterMs?: number
  /**
   * Absolute epoch-ms deadline for this pass. Once reached, the loop stops BEFORE the next send and
   * RELEASES the remaining claimed rows back to pending (cross-review, Codex 2026-07-21): without
   * this, a project with a full 50-row batch of 10s-timeout sends could run ~500s and blow the
   * function deadline mid-batch, stranding rows in_flight. Deferred rows are simply claimed next tick.
   */
  deadlineMs?: number
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
      p_stale_after_ms: staleAfterMs,
    })
    if (claimError) throw new Error(`could not claim deliveries: ${claimError.message}`)

    const rows = (claimed ?? []) as ClaimedRow[]
    const settlements: DeliverySettlement[] = []
    for (let i = 0; i < rows.length; i++) {
      // Stop before overrunning the pass deadline: release the rows we claimed but will not reach,
      // so they are NOT stranded in_flight, then finish. The released rows are reported as unsent
      // settlements (persisted = whether the release landed), so a FAILED release surfaces as
      // `unsettled` in the cron rather than a silent clean pass (cross-review, Codex round 3).
      // Reserve one send's worth of wall-clock before the deadline: if the next send couldn't
      // FINISH in time, stop now and defer the rest rather than start a send that gets killed
      // mid-flight (cross-review, Codex round 4).
      if (options.deadlineMs !== undefined && Date.now() + PER_SEND_BUDGET_MS >= options.deadlineMs) {
        const deferred = rows.slice(i)
        const released = await releaseUnsent(db, projectId, deferred.map((r) => r.id), now)
        for (const r of deferred) {
          const ok = released.has(r.id)
          settlements.push({
            id: r.id, event_id: r.event_id, destination_id: r.destination_id,
            disposition: 'skipped', status: ok ? 'pending' : 'in_flight', attemptCount: r.attempt_count, persisted: ok,
          })
        }
        break
      }
      // One bad row must not sink the batch — a throw would abandon THIS row and every later one in
      // in_flight until stale reclaim (cross-review, Codex round 7 — the isolation was claimed but
      // not implemented). Catch per row: record the failure as an un-persisted settlement (so the
      // cron surfaces it as `unsettled`) and continue. The row stays in_flight and the stale-reclaim
      // path recovers it; better than losing the rest of the batch.
      const r = rows[i]
      try {
        settlements.push(await sendAndSettle(db, projectId, r, now, options))
      } catch (rowErr) {
        console.error('[delivery-dispatch] row settle threw:', rowErr instanceof Error ? rowErr.message : rowErr)
        settlements.push({
          id: r.id, event_id: r.event_id, destination_id: r.destination_id,
          disposition: 'internal_error', status: 'in_flight', attemptCount: r.attempt_count, persisted: false,
        })
      }
    }

    return { ok: true, dispatched: true, reason: 'claimed', claimed: settlements }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[delivery-dispatch] pass failed:', error)
    return { ok: false, dispatched: false, reason: 'error', error, claimed: [] }
  }
}

// Loads the destination + the canonical event, RE-CHECKS eligibility, signs and POSTs, then writes
// the row's final status. Every write carries an OWNERSHIP TOKEN — `.eq('claimed_at', nowIso)` — so
// a row reclaimed out from under this worker (stale reclaim by a later pass) is NOT overwritten by
// this pass's stale result (cross-review, Codex 2026-07-21). The claim RPC set claimed_at to this
// pass's `now`, so that value IS our token.
async function sendAndSettle(
  db: SupabaseClient,
  projectId: string,
  row: ClaimedRow,
  now: Date,
  options: DispatchOptions,
): Promise<DeliverySettlement> {
  const nowIso = now.toISOString()
  const base = { id: row.id, event_id: row.event_id, destination_id: row.destination_id }

  // RE-READ the destination INCLUDING `enabled` (cross-review, Codex 2026-07-21): the claim checked
  // eligibility, but a destination disabled AFTER the claim and BEFORE this send must not still
  // receive the event. If it is no longer deliverable (disabled / url or secret cleared) — or the
  // event or destination vanished (a concurrent offboarding) — release the row to pending,
  // unattempted, and DO NOT send. Next enumeration won't surface it while disabled.
  const { data: dest, error: destErr } = await db
    .from('event_destinations')
    .select('id, name, enabled, target_url, signing_secret')
    .eq('id', row.destination_id)
    .eq('project_id', projectId)
    .maybeSingle()
  const { data: event, error: eventErr } = await db
    .from('events')
    .select(
      'id, event, occurred_at, created_at, user_id, feature_id, tags, metadata, actor_type, actor_id, subject_type, subject_id, correlation_id',
    )
    .eq('id', row.event_id)
    .eq('project_id', projectId)
    .maybeSingle()

  // A TRANSIENT read failure (the query itself errored) must NOT be mistaken for a missing parent —
  // release to pending and retry next tick, never dead-letter (cross-review, Codex round 4: a DB blip
  // would otherwise permanently kill a perfectly good delivery). `data: null` with NO error is the
  // genuine "row absent" case handled below.
  if (destErr || eventErr) {
    console.error('[delivery-dispatch] parent read failed:', (destErr ?? eventErr)?.message)
    await settleDelivery(db, {
      row, projectId, claimToken: nowIso, now: nowIso, status: 'pending',
      nextAttemptAt: null, lastError: null, attemptCount: row.attempt_count,
      log: false, outcome: 'skipped', httpStatus: null, latencyMs: null,
    })
    // Reported as internal_error and NEVER persisted:true — a persistent DB read failure would
    // otherwise stall every affected delivery while the cron stayed green (cross-review, Codex 13).
    return { ...base, disposition: 'internal_error', status: 'pending', attemptCount: row.attempt_count, persisted: false }
  }

  // A genuinely MISSING parent (clean null, no error) is a PERMANENT anomaly — DEAD-letter it, never
  // recycle to pending (cross-review, Antigravity round 3): claim_deliveries does not join `events`,
  // so a pending row whose event is missing would be re-claimed every tick forever. The composite FK
  // CASCADE means a parent delete already removes the delivery row, so this branch is defensive — but
  // "defensive" must not mean "infinite loop." Terminal, no attempt logged.
  if (!dest || !event) {
    const persisted = await settleDelivery(db, {
      row, projectId, claimToken: nowIso, now: nowIso, status: 'dead',
      nextAttemptAt: null, lastError: 'destination or event no longer exists', attemptCount: row.attempt_count,
      log: false, outcome: 'skipped', httpStatus: null, latencyMs: null,
    })
    return { ...base, disposition: 'skipped', status: 'dead', attemptCount: row.attempt_count, persisted }
  }

  // A TRANSIENT non-deliverable state (destination exists but was disabled, or its url/secret was
  // cleared, AFTER the claim) — release to pending, unattempted. This does NOT loop: claim_deliveries
  // requires enabled + url + secret, so a disabled/unconfigured destination's row is not re-claimed
  // until it is deliverable again. No attempt logged (p_log=false).
  if (!dest.enabled || !dest.target_url || !dest.signing_secret) {
    const persisted = await settleDelivery(db, {
      row, projectId, claimToken: nowIso, now: nowIso, status: 'pending',
      nextAttemptAt: null, lastError: null, attemptCount: row.attempt_count,
      log: false, outcome: 'skipped', httpStatus: null, latencyMs: null,
    })
    return { ...base, disposition: 'skipped', status: 'pending', attemptCount: row.attempt_count, persisted }
  }

  const body = serializeEnvelope(buildEventEnvelope(event as CanonicalEventRow))
  const result = await deliverWebhook(
    { id: dest.id as string, name: dest.name as string, targetUrl: dest.target_url as string, signingSecret: dest.signing_secret as string },
    body,
    { fetchImpl: options.fetchImpl, resolveHost: options.resolveHost, deliveryId: row.id, eventId: row.event_id },
  )

  const attemptCount = row.attempt_count + 1 // this pass made one real attempt
  // Backoff + last_attempt_at are anchored to when THIS attempt actually COMPLETED, not the batch's
  // claim time (cross-review, Codex round 4): a later, slow send in a batch would otherwise get a
  // shortened (or already-expired) backoff and an inaccurate last_attempt_at. The claim TOKEN stays
  // `nowIso` (the claim time the RPC stamped) — only the settle clock advances.
  const settledAt = new Date()
  const next = nextState(result.disposition, attemptCount, settledAt)

  // Settle the row AND write the attempt-log row in ONE transaction (settle_delivery RPC), guarded
  // by the claim token — history cannot be lost by a partial write, and a lost reclaim race writes
  // neither (cross-review, Codex 2026-07-21).
  const persisted = await settleDelivery(db, {
    row, projectId, claimToken: nowIso, now: settledAt.toISOString(), status: next.status,
    nextAttemptAt: next.nextAttemptAt, lastError: result.error, attemptCount,
    log: true, outcome: result.disposition, httpStatus: result.status, latencyMs: result.latencyMs,
  })

  return { ...base, disposition: result.disposition, status: next.status, attemptCount, persisted }
}

type SettleArgs = {
  row: ClaimedRow
  projectId: string
  claimToken: string
  now: string
  status: 'delivered' | 'failed' | 'dead' | 'pending'
  nextAttemptAt: string | null
  lastError: string | null
  attemptCount: number
  log: boolean
  outcome: DeliveryDisposition | 'skipped'
  httpStatus: number | null
  latencyMs: number | null
}

// Calls the settle_delivery RPC (guarded UPDATE + append-only attempt insert, one transaction).
// Returns whether the row WE own was persisted — false on a DB error or a lost reclaim race, so the
// caller never reports an un-persisted send as counted.
async function settleDelivery(db: SupabaseClient, a: SettleArgs): Promise<boolean> {
  const { data, error } = await db.rpc('settle_delivery', {
    p_delivery_id: a.row.id,
    p_project_id: a.projectId,
    p_claim_token: a.claimToken,
    p_status: a.status,
    p_next_attempt_at: a.nextAttemptAt,
    p_last_error: a.lastError,
    p_attempt_count: a.attemptCount,
    p_now: a.now,
    p_log: a.log,
    p_destination_id: a.row.destination_id,
    p_event_id: a.row.event_id,
    p_outcome: a.outcome,
    p_http_status: a.httpStatus,
    p_latency_ms: a.latencyMs,
  })
  if (error) {
    console.error('[delivery-dispatch] settle failed:', error.message)
    return false
  }
  return data === true
}

// Releases claimed-but-unsent rows back to pending (the deadline path), guarded by the claim token.
// Returns the SET of ids actually released, so the caller can report any row it FAILED to release as
// unsettled rather than as a clean deferral (cross-review, Codex round 3).
async function releaseUnsent(db: SupabaseClient, projectId: string, ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const nowIso = now.toISOString()
  const { data, error } = await db
    .from('event_deliveries')
    .update({ status: 'pending', claimed_at: null, updated_at: nowIso })
    .eq('project_id', projectId)
    .in('id', ids)
    .eq('status', 'in_flight')
    .eq('claimed_at', nowIso)
    .select('id')
  if (error) {
    console.error('[delivery-dispatch] release-unsent failed:', error.message)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.id as string))
}

// Maps an HTTP disposition + attempt count to the row's next state. The retry SCHEDULE is
// lib/retry-policy.ts's; this only translates its decision into a status + next_attempt_at.
function nextState(
  disposition: DeliveryDisposition,
  attemptCount: number,
  now: Date,
): { status: 'delivered' | 'failed' | 'dead'; nextAttemptAt: string | null } {
  if (disposition === 'delivered') return { status: 'delivered', nextAttemptAt: null }
  // A permanent 4xx (not 408/429): retrying identical bytes can't help, so dead-letter immediately
  // instead of burning the whole backoff schedule.
  if (disposition === 'permanent') return { status: 'dead', nextAttemptAt: null }
  // retryable: schedule the next attempt, or dead-letter if the budget is spent.
  const decision = retryDecision(attemptCount)
  if (!decision.retry) return { status: 'dead', nextAttemptAt: null }
  return { status: 'failed', nextAttemptAt: new Date(now.getTime() + decision.delayMs).toISOString() }
}
