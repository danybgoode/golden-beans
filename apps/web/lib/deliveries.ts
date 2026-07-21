import 'server-only'
import { getSupabaseServiceClient } from './supabase'

// event-destination-router · Sprint 2, Story 2.2 — delivery HISTORY (read) and operator REPLAY.
// Server-only DB orchestration; project-scoped like everything else.

export type DeliveryHistoryRow = {
  id: string
  destinationId: string
  destinationName: string | null
  eventId: string
  eventName: string | null
  status: string
  attemptCount: number
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  lastError: string | null
  createdAt: string
}

// Recent deliveries for a project, newest first, joined to their destination + event for a legible
// history. Bounded — a history view is a recent window, not an export. Throws on a query failure
// (an empty list must not be mistaken for "nothing was ever delivered" during an outage).
export async function listRecentDeliveries(projectId: string, limit = 50): Promise<DeliveryHistoryRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_deliveries')
    .select(
      'id, destination_id, event_id, status, attempt_count, last_attempt_at, next_attempt_at, last_error, created_at, event_destinations(name), events(event)',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[deliveries] list failed:', error)
    throw new Error('Could not load delivery history')
  }
  return (data ?? []).map((r) => {
    const dest = r.event_destinations as unknown as { name: string } | null
    const ev = r.events as unknown as { event: string } | null
    return {
      id: r.id as string,
      destinationId: r.destination_id as string,
      destinationName: dest?.name ?? null,
      eventId: r.event_id as string,
      eventName: ev?.event ?? null,
      status: r.status as string,
      attemptCount: (r.attempt_count as number) ?? 0,
      lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
      nextAttemptAt: (r.next_attempt_at as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }
  })
}

// Operator REPLAY — the deliberate, manual counterpart to a client's accidental at-least-once retry
// (which the RPC dedup path refuses, by design — see the outbox migration). Replay RE-USES the
// existing delivery row rather than inserting a second: the (event_id, destination_id) UNIQUE
// constraint means one logical (event, destination) owes exactly one delivery, forever, so replay
// resets THAT row to a fresh pending attempt. The delivery envelope's `id` is the canonical EVENT id,
// unchanged across the replay — which is exactly what lets a receiver DEDUPLICATE the replayed
// delivery against the original (at-least-once delivery is contractual; consumer idempotency keys off
// this stable id).
//
// attempt_count is reset to 0 so the full retry budget applies again — replay is a deliberate "try
// this again from scratch" act, not a continuation of the exhausted schedule that dead-lettered it.
// Scoped by id + project_id, and only replayable from a settled state (delivered/failed/dead) — a
// row already pending/in_flight is queued and must not be reset out from under a live dispatcher.
export async function replayDelivery(
  projectId: string,
  deliveryId: string,
  now: Date = new Date(),
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient()
  const nowIso = now.toISOString()
  const { data, error } = await supabase
    .from('event_deliveries')
    .update({
      status: 'pending',
      attempt_count: 0,
      next_attempt_at: nowIso,
      claimed_at: null,
      last_error: null,
      updated_at: nowIso,
    })
    .eq('id', deliveryId)
    .eq('project_id', projectId)
    .in('status', ['delivered', 'failed', 'dead'])
    .select('event_id')
  if (error) {
    console.error('[deliveries] replay failed:', error)
    return { ok: false, error: 'Could not replay that delivery.' }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Delivery not found, or already queued.' }
  }
  return { ok: true, eventId: data[0].event_id as string }
}

// event-destination-router · Sprint 3, Story 3.3 — the delivery operating view.
export type DeliveryHealthRow = {
  destinationId: string
  name: string
  enabled: boolean
  delivered: number
  failed: number
  dead: number
  pending: number
  inFlight: number
  totalAttempts: number
  lastDeliveryAt: string | null
}

// Per-destination rollup, aggregated in the DATABASE (delivery_health RPC) rather than by counting a
// fetched page in Node — counts derived from a bounded fetch would silently describe a window while
// claiming to describe everything. Includes destinations with zero deliveries (the LEFT JOIN), because
// "configured, nothing ever delivered" is the state an operator most needs to see.
//
// Carries NO secret and NO target URL — an operational view is not a place to re-expose a credential.
export async function getDeliveryHealth(projectId: string): Promise<DeliveryHealthRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('delivery_health', { p_project_id: projectId })
  if (error) {
    console.error('[deliveries] health failed:', error)
    throw new Error('Could not load delivery health')
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    destinationId: r.destination_id as string,
    name: r.name as string,
    enabled: Boolean(r.enabled),
    delivered: Number(r.delivered ?? 0),
    failed: Number(r.failed ?? 0),
    dead: Number(r.dead ?? 0),
    pending: Number(r.pending ?? 0),
    inFlight: Number(r.in_flight ?? 0),
    totalAttempts: Number(r.total_attempts ?? 0),
    lastDeliveryAt: (r.last_delivery_at as string | null) ?? null,
  }))
}

// The production trigger's fan-in: which projects currently have due work? A cheap DISTINCT the cron
// enumerates, then dispatches once per project (the dispatcher is always single-tenant). Bounded so
// one cron tick can't try to sweep an unbounded number of tenants.
export async function projectsWithDueWork(now: Date, limit = 200): Promise<string[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_deliveries')
    .select('project_id')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', now.toISOString())
    .limit(limit * 20) // over-read then de-dup in memory; PostgREST has no SELECT DISTINCT
  if (error) {
    console.error('[deliveries] projectsWithDueWork failed:', error)
    throw new Error('Could not enumerate due work')
  }
  const seen = new Set<string>()
  for (const r of data ?? []) {
    seen.add(r.project_id as string)
    if (seen.size >= limit) break
  }
  return [...seen]
}
