import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { dispatchPendingDeliveries } from '@/lib/delivery-dispatch'
import { projectsWithDueWork } from '@/lib/deliveries'
import { isDestinationDeliveryEnabled } from '@/lib/flags'

// event-destination-router · Sprint 2, Story 2.2 — the production dispatch trigger.
//
// This is the cron target (see vercel.json's `crons`). Story 1.2's dispatcher was a seam nothing
// invoked in production; this is what finally invokes it — enumerating the projects with due work and
// dispatching once PER PROJECT, because the dispatcher is unconditionally single-tenant (AGENTS.md
// rule #1). One tenant's flaky receiver cannot stall another's queue.
//
// TWO GATES, in order:
//   1. AUTH — this endpoint moves outbound traffic, so it must not be publicly triggerable. Vercel
//      Cron sends `Authorization: Bearer $CRON_SECRET`; we require it and compare constant-time. With
//      CRON_SECRET unset we FAIL CLOSED (401) rather than open — an unauthenticated dispatcher is a
//      worse failure than a cron that 401s until the secret is set.
//   2. DELIVERY FLAG — even authenticated, a pass no-ops while DESTINATION_DELIVERY_ENABLED is OFF.
//      The dispatcher itself also checks this (defence in depth), but short-circuiting here means a
//      dark deployment does not even enumerate due work.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PROJECTS_PER_TICK = 200

// A wall-clock budget for the whole tick. The per-delivery timeout is 10s and one project can hold
// up to MAX_CLAIM_BATCH rows, so a naive "process every project sequentially" tick could run for
// minutes and blow the function deadline — stranding every project after the slow one (cross-review,
// Codex 2026-07-21). We stop enumerating once we are within one project-batch of the deadline; the
// unprocessed projects still have due work and are simply picked up by the next */5 tick.
const TICK_BUDGET_MS = 60_000

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  // Compare BYTE lengths, not string (char) lengths (cross-review, Antigravity 2026-07-21): a
  // multi-byte UTF-8 header can match `expected` in char-length while differing in byte-length, and
  // timingSafeEqual THROWS a RangeError on a byte-length mismatch — which, unguarded, would surface
  // as an unhandled 500 instead of a clean 401 (and the throw is itself an observable signal).
  const headerBuf = Buffer.from(header)
  const expectedBuf = Buffer.from(expected)
  if (headerBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(headerBuf, expectedBuf)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isDestinationDeliveryEnabled()) {
    return NextResponse.json({ enabled: false, projects: 0, dispatched: 0 })
  }

  const db = getSupabaseServiceClient()
  const now = new Date()

  let projects: string[]
  try {
    projects = await projectsWithDueWork(now, MAX_PROJECTS_PER_TICK)
  } catch (err) {
    console.error('[dispatch-cron] enumerate failed:', err)
    return NextResponse.json({ error: 'enumerate_failed' }, { status: 500 })
  }

  const startedAt = Date.now()
  const deadlineMs = startedAt + TICK_BUDGET_MS
  let delivered = 0
  let errored = 0
  let unsettled = 0
  let processed = 0
  for (const projectId of projects) {
    // Stop before we risk overrunning the function deadline; the rest is due work the next tick
    // claims. Leaving early is safe — no row is lost, only deferred. The SAME deadline is passed into
    // the dispatcher so it also stops mid-batch (one project's 50 slow sends can't overrun alone).
    if (Date.now() >= deadlineMs) break
    processed += 1
    const outcome = await dispatchPendingDeliveries(db, projectId, { now, fetchImpl: fetch, deadlineMs })
    if (outcome.ok && outcome.dispatched) {
      // Count only settlements PERSISTED as delivered — never merely claimed (cross-review, Codex:
      // reporting a claim as success without the write landing lets the same event be resent while
      // the tick claims it done). A send whose settlement did NOT persist is surfaced as `unsettled`
      // rather than silently counted as clean.
      for (const c of outcome.claimed) {
        if (!c.persisted) unsettled += 1
        else if (c.status === 'delivered') delivered += 1
      }
    }
    if (!outcome.ok) errored += 1
  }

  return NextResponse.json({
    enabled: true,
    projects: projects.length,
    processed,
    deferred: projects.length - processed,
    delivered,
    unsettled,
    errored,
  })
}

// GET mirrors POST so a platform cron that issues GET still works; both require the bearer secret.
export const GET = POST
