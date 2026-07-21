// event-destination-router · Sprint 1, Story 1.2 — the outbox dispatcher, born dark.
//
// ── WHY THIS FILE EXISTS AT ALL IN A SPRINT THAT SENDS NOTHING ───────────────────────────────
// A kill switch with nothing behind it is not a kill switch, it is a comment. `DESTINATION_
// DELIVERY_ENABLED` can only be shown to prevent dispatch if there is a dispatch to prevent — and
// the acceptance criterion for this story is precisely "the flag born OFF prevents dispatch but not
// persistence", which is unfalsifiable against an empty file. So the claim path is real: it decides
// eligibility, it takes ownership of work, and it is spec-reachable in BOTH flag states.
//
// ── THE SPRINT BOUNDARY, STATED PLAINLY ──────────────────────────────────────────────────────
// This dispatcher performs NO OUTBOUND HTTP and NO HMAC SIGNING. Those, together with the target
// URL and the signing secret they need, are Sprint 2 Story 2.1 (destination lifecycle + signed
// webhook). Retry/backoff, terminal failure, dead-lettering and replay are Story 2.2. Nothing here
// increments `attempt_count` or writes `last_attempt_at`, because no attempt is made — a bookkeeping
// column that counts imaginary attempts would make Story 2.2's backoff maths wrong from row one.
//
// A PREPARATORY SEAM, NOT A WIRED PRODUCTION PATH (cross-review, Codex round 4). Nothing INVOKES
// `dispatchPendingDeliveries()` in production in Sprint 1 — no cron, no request handler, no queue
// consumer. It is exercised only by specs, and that is correct for a sprint whose whole job is "fill
// the outbox durably, send nothing." Story 2.1/2.2 add the production trigger (a cron or queue) and
// the real send. Until then the flag gates this function's BEHAVIOUR (it returns `disabled`), which
// is what makes the acceptance criterion "flag OFF prevents dispatch but not persistence" testable —
// it does not yet gate a live dispatch loop, because there isn't one to gate.
//
// CROSS-TENANT BY DESIGN, AND ONLY HERE. `dispatchPendingDeliveries()` with no `projectId` scans
// EVERY project's due work — the ONE deliberate exception to "no read path crosses projects"
// (AGENTS.md rule #1), because a delivery dispatcher is INFRASTRUCTURE, not a tenant request: it
// exists precisely to process all tenants' outbox work. This is not a tenant-facing read path and
// resolves no caller identity. Tenant isolation of the DATA it touches is still absolute — the
// composite FKs in 20260722110000_delivery_outbox.sql make a cross-tenant delivery row impossible to
// have been created in the first place, so a global scan can only ever see correctly-scoped rows.
// The optional `projectId` narrows a pass to one tenant for operational reasons (a targeted drain),
// not as the isolation control.
//
// ── DELIBERATELY (ALMOST) ZERO-IMPORT ────────────────────────────────────────────────────────
// The only runtime import is ./flags, which is itself zero-import; the Supabase client is INJECTED
// rather than imported. That is not ceremony — it is the LEARNINGS.md rule about guards behind
// preconditions: multi-tenant-activation S1 shipped four security specs that passed identically
// against a deliberately re-broken build, because an HTTP-level spec could not reach the guarded
// branch. Injecting the client means a spec can call `dispatchPendingDeliveries()` directly, with
// both flag values and with a deliberately broken client, and actually observe each branch.
//
// No `import 'server-only'` for the same reason — and it costs nothing here, because this module
// holds no secret and cannot do anything without a service-role client someone else hands it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDestinationDeliveryEnabled } from './flags'

/**
 * How many rows one dispatcher pass may take ownership of.
 *
 * Bounded because a dispatcher runs on a serverless function with a wall-clock limit: claiming
 * 10,000 rows and then timing out would strand all 10,000 in `in_flight` at once. A small batch
 * that runs again is strictly better than a large batch that might not finish.
 */
export const MAX_CLAIM_BATCH = 50

/**
 * Statuses a dispatcher may claim. `pending` is fresh work; `failed` is retryable work whose
 * backoff has elapsed (Story 2.2 sets that schedule — until then a `failed` row is unreachable
 * because nothing produces one). `in_flight` is deliberately EXCLUDED: claiming a row another
 * worker already owns is exactly the double-delivery this whole design is trying to bound.
 * `delivered` and `dead` are terminal.
 */
export const CLAIMABLE_STATUSES = ['pending', 'failed'] as const

export type ClaimedDelivery = {
  id: string
  project_id: string
  event_id: string
  destination_id: string
  attempt_count: number
}

export type DispatchOutcome =
  /** The gate is OFF. Nothing was read, nothing was claimed, nothing was sent. */
  | { ok: true; dispatched: false; reason: 'disabled'; claimed: [] }
  /** The gate is ON. `claimed` are the rows this pass took ownership of (and then released — see below). */
  | { ok: true; dispatched: true; reason: 'claimed'; claimed: ClaimedDelivery[] }
  /** The delivery subsystem itself is unhealthy. Reported, never thrown — see the note below. */
  | { ok: false; dispatched: false; reason: 'error'; error: string; claimed: [] }

export type DispatchOptions = {
  /** Restrict a pass to one tenant. Absent = all tenants, oldest work first. */
  projectId?: string
  limit?: number
  now?: Date
}

/**
 * One dispatcher pass.
 *
 * ORDER IS THE POINT: the gate is consulted BEFORE any query, so a disabled deployment does not so
 * much as read the outbox. Checking it after the claim would still "prevent sending", but it would
 * also transition rows to `in_flight` on a deployment that can never move them — turning a disabled
 * flag into a slow data-loss bug instead of a no-op.
 *
 * NEVER THROWS. A dispatcher is called from a background/cron context where an unhandled rejection
 * is an invisible failure; and more importantly, a caller must never be able to conclude anything
 * about ingest from a delivery failure. Errors come back as a value.
 */
export async function dispatchPendingDeliveries(
  db: SupabaseClient,
  options: DispatchOptions = {},
): Promise<DispatchOutcome> {
  // ── THE GATE ────────────────────────────────────────────────────────────────────────────────
  // Born OFF (lib/flags.ts). While this returns false, the outbox keeps filling and nothing moves —
  // which is the intended production state for the whole of Sprint 1.
  if (!isDestinationDeliveryEnabled()) {
    return { ok: true, dispatched: false, reason: 'disabled', claimed: [] }
  }

  const now = options.now ?? new Date()
  const limit = Math.max(1, Math.min(options.limit ?? MAX_CLAIM_BATCH, MAX_CLAIM_BATCH))

  try {
    const claimed = await claimDueDeliveries(db, { ...options, now, limit })

    // ── WHERE SPRINT 1 STOPS ──────────────────────────────────────────────────────────────────
    // Story 2.1 replaces this comment with: build the signed request, POST it to the destination's
    // URL, and transition the row to `delivered` / `failed` / `dead` on the answer.
    //
    // Until then the rows are RELEASED back to `pending` immediately. Leaving them `in_flight`
    // would strand every claimed row permanently, because the reclaim-stale-work loop that would
    // rescue them is Story 2.2 and does not exist yet — a dispatcher that quietly consumes the
    // queue while sending nothing is worse than one that does nothing at all.
    //
    // Residual risk, stated rather than glossed: a crash between the claim and this release leaves
    // rows in `in_flight` with no reclaimer. That window is acceptable only because the gate above
    // is OFF in every environment for this sprint, so the window does not exist in practice; Story
    // 2.2's stale-claim reclaim (which is what `claimed_at` is for) closes it before the flag flips.
    if (claimed.length > 0) {
      const released = await releaseDeliveries(db, claimed.map((d) => d.id), now)
      // We just claimed these rows this pass, so we expect to release exactly as many. A shortfall
      // means something moved them out from under us — which, in a gate-OFF single-worker Sprint 1,
      // should be impossible. Surface it as an error rather than reporting a clean pass over rows
      // that may now be stranded (cross-review, Codex round 2). Story 2.2's real reclaimer replaces
      // this claim/release dance with SKIP LOCKED, at which point a partial result is normal and
      // this strict check goes away.
      if (released !== claimed.length) {
        const error = `released ${released} of ${claimed.length} claimed deliveries — rows may be stranded in_flight`
        console.error('[delivery-dispatch]', error)
        return { ok: false, dispatched: false, reason: 'error', error, claimed: [] }
      }
    }

    return { ok: true, dispatched: true, reason: 'claimed', claimed }
  } catch (err) {
    // A sink-side outage — the DB, the claim, anything downstream of ingest — is reported here and
    // goes no further. Ingest already answered its caller from its own durable write; nothing about
    // this failure may ever reach that response path.
    const error = err instanceof Error ? err.message : String(err)
    console.error('[delivery-dispatch] pass failed:', error)
    return { ok: false, dispatched: false, reason: 'error', error, claimed: [] }
  }
}

/**
 * Takes ownership of due outbox work by flipping it to `in_flight`.
 *
 * TWO STATEMENTS, AND THE SECOND ONE IS THE RACE RESOLVER. Selecting candidate ids and then
 * updating them `.eq('status', ...)` means two dispatchers that both selected the same row have
 * their conflict settled by Postgres' row lock on the UPDATE: exactly one of them sees the row in a
 * claimable status, and only that one gets it back from `.select()`. A select-then-blindly-update
 * would let both believe they own it — the same check-then-act shape the rate_limit migration
 * exists to avoid, and here it would mean the same event delivered twice by two workers.
 *
 * (supabase-js cannot express `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` in one
 * call. When Story 2.2 builds the real retry engine, moving this into a plpgsql function alongside
 * `ingest_event` is the natural upgrade — SKIP LOCKED avoids the contention this shape merely
 * survives. It is not needed for a single-worker, gate-off sprint.)
 */
async function claimDueDeliveries(
  db: SupabaseClient,
  options: DispatchOptions & { now: Date; limit: number },
): Promise<ClaimedDelivery[]> {
  let candidates = db
    .from('event_deliveries')
    .select('id')
    .in('status', CLAIMABLE_STATUSES as unknown as string[])
    .lte('next_attempt_at', options.now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(options.limit)

  // Tenant scoping is an explicit narrowing of an already-scoped-by-nothing query: a dispatcher
  // pass legitimately spans tenants (it is infrastructure, not a request), so `project_id` here is
  // an operational filter, NOT the tenancy control. The tenancy control is the composite foreign
  // keys in the migration, which make a cross-tenant delivery row impossible to have created.
  if (options.projectId) candidates = candidates.eq('project_id', options.projectId)

  const { data: due, error: dueError } = await candidates
  if (dueError) throw new Error(`could not read due deliveries: ${dueError.message}`)
  if (!due || due.length === 0) return []

  const { data: claimed, error: claimError } = await db
    .from('event_deliveries')
    .update({ status: 'in_flight', claimed_at: options.now.toISOString(), updated_at: options.now.toISOString() })
    .in('id', due.map((row) => row.id as string))
    // The guard that makes this a claim rather than a stomp: a row another worker already took has
    // moved off a claimable status and simply will not match.
    .in('status', CLAIMABLE_STATUSES as unknown as string[])
    // AND re-assert due-time in the same atomic UPDATE (cross-review, Codex round 4): the candidate
    // list is a stale snapshot, so between the SELECT and here another worker could have failed a row
    // and pushed its next_attempt_at into the future (Story 2.2's backoff). Without this, we'd
    // reclaim it early and bypass the backoff we just set. Sprint 1 sets no backoff, so this is
    // defence for when 2.2 does — the real fix there is a SKIP LOCKED claim RPC, of which this is the
    // supabase-js-expressible half.
    .lte('next_attempt_at', options.now.toISOString())
    .select('id, project_id, event_id, destination_id, attempt_count')

  if (claimError) throw new Error(`could not claim deliveries: ${claimError.message}`)
  return (claimed ?? []) as ClaimedDelivery[]
}

/**
 * Hands claimed work back to `pending`, unattempted.
 *
 * Sprint 1 only — Story 2.1 replaces the call site with a real send whose RESULT decides the next
 * status. `attempt_count` is untouched on purpose: nothing was attempted, and a counter inflated by
 * a claim that never sent anything would make Story 2.2's backoff and dead-letter thresholds fire
 * early on rows that were never actually tried.
 *
 * Returns the number of rows actually released so the caller can assert it matches what it claimed
 * (cross-review, Codex round 2). Takes the same injected `now` the claim used, rather than reading
 * the clock again, so a deterministic test sees one consistent timestamp across the pass (Agy round
 * 2).
 */
async function releaseDeliveries(db: SupabaseClient, ids: string[], now: Date): Promise<number> {
  const { data, error } = await db
    .from('event_deliveries')
    .update({ status: 'pending', claimed_at: null, updated_at: now.toISOString() })
    .in('id', ids)
    .eq('status', 'in_flight')
    .select('id')

  if (error) throw new Error(`could not release claimed deliveries: ${error.message}`)
  return data?.length ?? 0
}
