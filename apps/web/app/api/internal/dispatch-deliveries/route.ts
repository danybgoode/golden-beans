import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { dispatchPendingDeliveries, PER_SEND_BUDGET_MS } from '@/lib/delivery-dispatch'
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
// PIN the function's wall-clock limit rather than assuming the platform default (cross-review, Codex
// round 24): TICK_BUDGET_MS below is sized against this number, and if the deployment's limit were
// lower, Vercel would kill the worker mid-batch and leave claims to stale recovery. Declaring it here
// makes the budget's assumption explicit and enforced.
export const maxDuration = 300

const MAX_PROJECTS_PER_TICK = 200

// A wall-clock budget for the whole tick. The per-delivery timeout is 10s and one project can hold
// up to MAX_CLAIM_BATCH rows, so a naive "process every project sequentially" tick could run for
// minutes and blow the function deadline — stranding every project after the slow one (cross-review,
// Codex 2026-07-21). We stop enumerating once we are within one project-batch of the deadline; the
// unprocessed projects still have due work and are simply picked up by the next */5 tick.
// Vercel's default function timeout is 300s, so a 60s tick was leaving most of the window unused
// while forcing tiny per-project slices (cross-review, Codex round 17: an 18s reservation inside a
// 30s slice meant a slow project managed roughly ONE send per tick and released the other 49).
// 240s leaves a 60s margin under the platform limit.
const TICK_BUDGET_MS = 240_000

// A per-PROJECT slice of the tick, so ONE slow tenant cannot monopolize the whole budget and starve
// the others (cross-review, Codex round 5; anti-starvation ORDER is random() in the enumeration RPC).
// Each project is dispatched under a deadline of min(tick deadline, now + this), then defers its
// remainder and yields.
//
// SIZED AGAINST THE TICK, not in isolation (cross-review, Antigravity round 6 then Codex round 10).
// Two failure modes bracket this number:
//   • too small → after the dispatcher's PER_SEND_BUDGET_MS reservation (~18s) a project gets almost
//     no ACTIVE dispatch time (the 15s version left ~-3s, i.e. nothing);
//   • too large → project #1 eats the tick and project #2 is claimed with less than one send budget
//     left, so its rows are claimed and immediately released without ever being sent — churn.
// 60s of a 240s tick leaves ~42s of ACTIVE dispatch per project after the ~18s per-send reservation
// (enough for many normal sends, or ~3 worst-case timeouts), and still lets a tick serve several
// projects. The loop below also refuses to START a project without a full send budget remaining.
const PER_PROJECT_BUDGET_MS = 60_000

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

  // Start the tick clock BEFORE enumeration (cross-review, Codex round 8): the enumeration query
  // itself consumes wall-clock, so basing the deadline on a post-enumeration timestamp would let the
  // dispatch loop overrun the function deadline by however long enumeration took.
  const deadlineMs = Date.now() + TICK_BUDGET_MS

  let projects: string[]
  try {
    projects = await projectsWithDueWork(new Date(), MAX_PROJECTS_PER_TICK)
  } catch (err) {
    console.error('[dispatch-cron] enumerate failed:', err)
    return NextResponse.json({ error: 'enumerate_failed' }, { status: 500 })
  }

  let delivered = 0
  let errored = 0
  let unsettled = 0
  let internalErrors = 0
  let processed = 0
  for (const projectId of projects) {
    // Stop before we risk overrunning the function deadline; the rest is due work the next tick
    // claims. Leaving early is safe — no row is lost, only deferred. The SAME deadline is passed into
    // the dispatcher so it also stops mid-batch (one project's 50 slow sends can't overrun alone).
    // Don't START a project unless a FULL send budget remains — otherwise its rows get claimed and
    // instantly released without a send, pure churn that also disturbs their claimed_at
    // (cross-review, Codex round 10). Defer it to the next tick instead.
    if (Date.now() + PER_SEND_BUDGET_MS >= deadlineMs) break
    processed += 1
    // A FRESH clock per project (cross-review, Antigravity round 3): a single `now` captured at the
    // top would be up to a full budget behind wall-time for the last projects, making their
    // claim_deliveries see fewer rows as due than actually are.
    const now = new Date()
    // Per-project deadline: the smaller of the tick deadline and this project's own slice — bounds a
    // slow tenant's share so later projects still get served this tick. No fetchImpl → the dispatcher
    // uses the connection-PINNED default sender (SSRF-safe), not global fetch.
    const projectDeadline = Math.min(deadlineMs, Date.now() + PER_PROJECT_BUDGET_MS)
    const outcome = await dispatchPendingDeliveries(db, projectId, { now, deadlineMs: projectDeadline })
    if (outcome.ok && outcome.dispatched) {
      // Count only settlements PERSISTED as delivered — never merely claimed (cross-review, Codex:
      // reporting a claim as success without the write landing lets the same event be resent while
      // the tick claims it done). A send whose settlement did NOT persist is surfaced as `unsettled`
      // rather than silently counted as clean.
      for (const c of outcome.claimed) {
        // An internal (our-side) failure is counted separately from a benign deferral, so a
        // persistent DB fault can't hide behind a green tick (cross-review, Codex round 13).
        if (c.disposition === 'internal_error') internalErrors += 1
        else if (!c.persisted) unsettled += 1
        else if (c.status === 'delivered') delivered += 1
      }
    }
    if (!outcome.ok) errored += 1
  }

  // Return a FAILURE status when any project errored or any settlement didn't persist, so cron
  // monitoring records a failed invocation instead of a green 200 that hides the problem
  // (cross-review, Codex round 7). The body still carries the counts for diagnostics.
  const status = errored > 0 || unsettled > 0 || internalErrors > 0 ? 500 : 200
  return NextResponse.json(
    {
      enabled: true,
      projects: projects.length,
      processed,
      deferred: projects.length - processed,
      delivered,
      unsettled,
      internalErrors,
      errored,
    },
    { status },
  )
}

// GET mirrors POST so a platform cron that issues GET still works; both require the bearer secret.
export const GET = POST
