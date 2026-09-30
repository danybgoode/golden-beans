// verify-spike S1.1 — the event-destination-router outbox, as a Quint model.
//
// Source of truth modelled (read 2026-09-29 on main e20afca):
//   apps/web/supabase/migrations/20260722110000_delivery_outbox.sql   (status machine)
//   apps/web/supabase/migrations/20260724100000_delivery_retry.sql    (claim_deliveries)
//   apps/web/supabase/migrations/20260726100000_fanout_serialization.sql
//     (ingest_event fan-out, delete_destination, settle_delivery w/ coercion, release_deliveries,
//      replay_delivery)
//   apps/web/lib/delivery-dispatch.ts  (sendAndSettle, nextState)   apps/web/lib/retry-policy.ts
//
// ASSUMPTIONS (abstractions — each one is a place the model is kinder or harsher than prod):
//   A1  Each SQL function is one atomic step. FOR UPDATE SKIP LOCKED / FOR SHARE are modelled as
//       atomicity, not as lock waits.
//   A2  Time is abstract: a `failed` row is always due (over-approximates the backoff), and a stale
//       reclaim may happen at any moment. STALE_SAFE=true restricts reclaim to rows whose claiming
//       worker is gone — the real-world guarantee that TICK_BUDGET_MS (240s) < maxDuration (300s)
//       <= STALE_CLAIM_MS (300s). STALE_SAFE=false drops that timing assumption.
//   A3  One project (the dispatcher is strictly single-tenant; tenancy is not what this checks).
//   A4  event_filter is ignored (every enabled destination matches).
//   A5  MAX_ATTEMPTS is 3 here (prod: 6) to keep the state space small; the shape is identical.
//   A6  A worker `crash` also stands for a settle RPC that errors: settleDelivery() returns null and
//       the row stays in_flight — the same observable effect.
//   A7  At most one operator replay per run (keeps the ghost counters bounded).
module outbox {
  const STALE_SAFE: bool
  // FIX_STALE_COUNT models the proposed fix for finding F2: a STALE reclaim counts the lost
  // attempt (the dead worker may have sent it), and a stale row whose budget is spent is
  // dead-lettered instead of reclaimed. false = the code as shipped.
  const FIX_STALE_COUNT: bool

  pure val EVS = Set("e1", "e2")
  pure val DESTS = Set("d1", "d2")
  pure val WORKERS = Set("w1", "w2")
  pure val MAX_ATTEMPTS = 3
  pure val KEYS = tuples(EVS, DESTS)

  type Key = (str, str)
  type Row = { status: str, attempts: int, token: int }
  type Dest = { enabled: bool, deleted: bool, up: bool }
  type Worker = { phase: str, key: Key, token: int, claimedAttempts: int, result: str }

  // the database
  var rows: Key -> Row            // event_deliveries; status "none" = no row
  var dests: str -> Dest          // event_destinations (+ `up` = the receiving sink's health)
  // the dispatchers
  var workers: str -> Worker
  var nextToken: int              // claimed_at, the ownership token
  // ghosts (observation only — nothing in the system reads these)
  var ingested: Set[str]
  var expected: Set[Key]          // rows ingest_event promised to create
  var sends: Key -> int           // real HTTP sends since the last replay of that row
  var replays: int
  var sentAfterTerminal: bool     // a send hit the wire while the row was already delivered/dead
  var deadByExhaustion: bool      // a row went dead purely by running out of retries
  var strandedInFlight: bool      // an in_flight row nobody holds and nothing can ever reclaim

  pure def isTerminal(s: str): bool = s == "delivered" or s == "dead"

  def deliverable(d: str): bool = dests.get(d).enabled and not(dests.get(d).deleted)

  def holderExists(k: Key, tok: int): bool =
    WORKERS.exists(w => workers.get(w).phase != "idle" and workers.get(w).key == k and workers.get(w).token == tok)

  def isOwner(w: str): bool =
    val wk = workers.get(w)
    rows.get(wk.key).status == "in_flight" and rows.get(wk.key).token == wk.token

  pure val IDLE: Worker = { phase: "idle", key: ("e1", "d1"), token: 0, claimedAttempts: 0, result: "" }

  action init = all {
    rows' = KEYS.mapBy(k => { status: "none", attempts: 0, token: 0 }),
    dests' = DESTS.mapBy(d => { enabled: true, deleted: false, up: true }),
    workers' = WORKERS.mapBy(w => IDLE),
    nextToken' = 1,
    ingested' = Set(),
    expected' = Set(),
    sends' = KEYS.mapBy(k => 0),
    replays' = 0,
    sentAfterTerminal' = false,
    deadByExhaustion' = false,
    strandedInFlight' = false,
  }

  // After every step, recompute the stranded ghost from the state it lands in.
  def stranded(r: Key -> Row, ds: str -> Dest, ws: str -> Worker): bool =
    KEYS.exists(k =>
      r.get(k).status == "in_flight"
      and ds.get(k._2).deleted
      and not(WORKERS.exists(w => ws.get(w).phase != "idle" and ws.get(w).key == k and ws.get(w).token == r.get(k).token)))

  // ingest_event(): insert the event, fan out one pending row per ENABLED destination (FOR SHARE).
  action ingest(e: str): bool = {
    val targets = DESTS.filter(d => dests.get(d).enabled)
    all {
      not(ingested.contains(e)),
      rows' = KEYS.mapBy(k =>
        if (k._1 == e and targets.contains(k._2) and rows.get(k).status == "none")
          { status: "pending", attempts: 0, token: 0 }
        else rows.get(k)),
      ingested' = ingested.union(Set(e)),
      expected' = expected.union(targets.map(d => (e, d))),
      dests' = dests, workers' = workers, nextToken' = nextToken, sends' = sends, replays' = replays,
      sentAfterTerminal' = sentAfterTerminal, deadByExhaustion' = deadByExhaustion,
      strandedInFlight' = strandedInFlight,
    }
  }

  // claim_deliveries(): due pending/failed OR stale in_flight, destination enabled + deliverable.
  action claim(w: str, k: Key): bool = {
    val r = rows.get(k)
    val stale = r.status == "in_flight"
    // FIX_STALE_COUNT: a stale reclaim charges the presumed-lost attempt to the budget.
    val charged = if (FIX_STALE_COUNT and stale) r.attempts + 1 else r.attempts
    val exhausted = FIX_STALE_COUNT and stale and charged >= MAX_ATTEMPTS
    all {
      workers.get(w).phase == "idle",
      deliverable(k._2),
      or {
        r.status == "pending",
        r.status == "failed",
        stale and (not(STALE_SAFE) or not(holderExists(k, r.token))),
      },
      if (exhausted) all {
        // dead-lettered in place of the claim; no worker takes it
        rows' = rows.set(k, { status: "dead", attempts: charged, token: 0 }),
        workers' = workers,
      } else all {
        rows' = rows.set(k, { status: "in_flight", attempts: charged, token: nextToken }),
        workers' = workers.set(w, { phase: "claimed", key: k, token: nextToken, claimedAttempts: charged, result: "" }),
      },
      nextToken' = nextToken + 1,
      dests' = dests, ingested' = ingested, expected' = expected, sends' = sends, replays' = replays,
      sentAfterTerminal' = sentAfterTerminal, deadByExhaustion' = deadByExhaustion,
      strandedInFlight' = strandedInFlight,
    }
  }

  // sendAndSettle(), part 1: the destination is re-read; if deliverable, the POST goes on the wire.
  action send(w: str): bool = {
    val wk = workers.get(w)
    val d = wk.key._2
    val outcomes = if (dests.get(d).up) Set("delivered", "permanent") else Set("retryable")
    all {
      wk.phase == "claimed",
      deliverable(d),
      nondet res = outcomes.oneOf()
      all {
        workers' = workers.set(w, { ...wk, phase: "sent", result: res }),
        sends' = sends.set(wk.key, sends.get(wk.key) + 1),
        sentAfterTerminal' = (sentAfterTerminal or isTerminal(rows.get(wk.key).status)),
      },
      rows' = rows, dests' = dests, nextToken' = nextToken, ingested' = ingested, expected' = expected,
      replays' = replays, deadByExhaustion' = deadByExhaustion, strandedInFlight' = strandedInFlight,
    }
  }

  // sendAndSettle(), part 2: settle_delivery() — token-guarded; coerces failed/pending to dead when
  // the destination was removed mid-flight. attempt_count = the CLAIMED count + 1.
  action settle(w: str): bool = {
    val wk = workers.get(w)
    val a = wk.claimedAttempts + 1
    val asked =
      if (wk.result == "delivered") "delivered"
      else if (wk.result == "permanent") "dead"
      else if (a >= MAX_ATTEMPTS) "dead"
      else "failed"
    val removed = dests.get(wk.key._2).deleted
    val final = if (removed and (asked == "failed" or asked == "pending")) "dead" else asked
    val owner = isOwner(w)
    val rows2 = if (owner) rows.set(wk.key, { status: final, attempts: a, token: 0 }) else rows
    val workers2 = workers.set(w, IDLE)
    all {
      wk.phase == "sent",
      rows' = rows2,
      workers' = workers2,
      deadByExhaustion' = (deadByExhaustion or (owner and wk.result == "retryable" and a >= MAX_ATTEMPTS and not(removed))),
      strandedInFlight' = (strandedInFlight or stranded(rows2, dests, workers2)),
      dests' = dests, nextToken' = nextToken, ingested' = ingested, expected' = expected, sends' = sends,
      replays' = replays, sentAfterTerminal' = sentAfterTerminal,
    }
  }

  // sendAndSettle(): destination disabled/cleared after the claim → release to pending, no attempt.
  // Deadline path: release_deliveries() → pending (or dead if the destination was removed).
  // Both are the same state change; `skipOrRelease` covers them.
  action skipOrRelease(w: str): bool = {
    val wk = workers.get(w)
    val removed = dests.get(wk.key._2).deleted
    val rows2 =
      if (isOwner(w)) rows.set(wk.key, { ...rows.get(wk.key), status: if (removed) "dead" else "pending", token: 0 })
      else rows
    val workers2 = workers.set(w, IDLE)
    all {
      wk.phase == "claimed",
      rows' = rows2,
      workers' = workers2,
      strandedInFlight' = (strandedInFlight or stranded(rows2, dests, workers2)),
      dests' = dests, nextToken' = nextToken, ingested' = ingested, expected' = expected, sends' = sends,
      replays' = replays, sentAfterTerminal' = sentAfterTerminal, deadByExhaustion' = deadByExhaustion,
    }
  }

  // The function dies (or settle_delivery errors, A6): the worker's local state is gone, the row stays.
  action crash(w: str): bool = {
    val workers2 = workers.set(w, IDLE)
    all {
      workers.get(w).phase != "idle",
      workers' = workers2,
      strandedInFlight' = (strandedInFlight or stranded(rows, dests, workers2)),
      rows' = rows, dests' = dests, nextToken' = nextToken, ingested' = ingested, expected' = expected,
      sends' = sends, replays' = replays, sentAfterTerminal' = sentAfterTerminal,
      deadByExhaustion' = deadByExhaustion,
    }
  }

  // Operator actions on a destination.
  action setEnabled(d: str, on: bool): bool = all {
    not(dests.get(d).deleted),
    dests' = dests.set(d, { ...dests.get(d), enabled: on }),
    rows' = rows, workers' = workers, nextToken' = nextToken, ingested' = ingested, expected' = expected,
    sends' = sends, replays' = replays, sentAfterTerminal' = sentAfterTerminal,
    deadByExhaustion' = deadByExhaustion, strandedInFlight' = strandedInFlight,
  }

  // delete_destination(): soft-delete + drain pending/failed to dead. in_flight is NOT drained.
  action deleteDest(d: str): bool = {
    val dests2 = dests.set(d, { ...dests.get(d), deleted: true, enabled: false })
    val rows2 = KEYS.mapBy(k =>
      if (k._2 == d and (rows.get(k).status == "pending" or rows.get(k).status == "failed"))
        { ...rows.get(k), status: "dead", token: 0 }
      else rows.get(k))
    all {
      not(dests.get(d).deleted),
      dests' = dests2,
      rows' = rows2,
      strandedInFlight' = (strandedInFlight or stranded(rows2, dests2, workers)),
      workers' = workers, nextToken' = nextToken, ingested' = ingested, expected' = expected,
      sends' = sends, replays' = replays, sentAfterTerminal' = sentAfterTerminal,
      deadByExhaustion' = deadByExhaustion,
    }
  }

  // The receiving sink goes down or comes back.
  action toggleSink(d: str): bool = all {
    dests' = dests.set(d, { ...dests.get(d), up: not(dests.get(d).up) }),
    rows' = rows, workers' = workers, nextToken' = nextToken, ingested' = ingested, expected' = expected,
    sends' = sends, replays' = replays, sentAfterTerminal' = sentAfterTerminal,
    deadByExhaustion' = deadByExhaustion, strandedInFlight' = strandedInFlight,
  }

  // replay_delivery(): TERMINAL rows only, destination live → pending, budget reset.
  action replay(k: Key): bool = all {
    replays < 1,
    isTerminal(rows.get(k).status),
    not(dests.get(k._2).deleted),
    rows' = rows.set(k, { status: "pending", attempts: 0, token: 0 }),
    sends' = sends.set(k, 0),
    replays' = replays + 1,
    dests' = dests, workers' = workers, nextToken' = nextToken, ingested' = ingested, expected' = expected,
    sentAfterTerminal' = sentAfterTerminal, deadByExhaustion' = deadByExhaustion,
    strandedInFlight' = strandedInFlight,
  }

  action step = any {
    nondet e = EVS.oneOf() ingest(e),
    nondet w = WORKERS.oneOf() nondet k = KEYS.oneOf() claim(w, k),
    nondet w = WORKERS.oneOf() send(w),
    nondet w = WORKERS.oneOf() settle(w),
    nondet w = WORKERS.oneOf() skipOrRelease(w),
    nondet w = WORKERS.oneOf() crash(w),
    nondet d = DESTS.oneOf() nondet on = Set(true, false).oneOf() setEnabled(d, on),
    nondet d = DESTS.oneOf() deleteDest(d),
    nondet d = DESTS.oneOf() toggleSink(d),
    nondet k = KEYS.oneOf() replay(k),
  }

  // ── Invariants ─────────────────────────────────────────────────────────────────────────────
  // I1 no vanish: every row ingest_event promised exists.
  val noVanish = expected.forall(k => rows.get(k).status != "none")
  // I2 no orphan: a re-queueable row never points at a deleted destination (nothing could claim it).
  val noOrphan = KEYS.forall(k =>
    (rows.get(k).status == "pending" or rows.get(k).status == "failed") implies not(dests.get(k._2).deleted))
  // I3 bounded attempts: the recorded attempt_count never exceeds the budget.
  val attemptsBounded = KEYS.forall(k => rows.get(k).attempts <= MAX_ATTEMPTS)
  // I4 bounded replay on the WIRE: real sends per row (since its last replay) stay within the budget.
  val sendsBounded = KEYS.forall(k => sends.get(k) <= MAX_ATTEMPTS)
  // I5 nothing is sent after the row is delivered or dead.
  val noSendAfterTerminal = not(sentAfterTerminal)
  // I6 no in_flight row is stranded beyond any reclaim.
  val noStrandedInFlight = not(strandedInFlight)
  // W1 (a WITNESS, expected to be violated): a sink outage longer than the retry budget dead-letters.
  val noDeadByExhaustion = not(deadByExhaustion)

  val safety = noVanish and noOrphan and attemptsBounded
}

// The production timing assumption holds (TICK_BUDGET 240s < maxDuration 300s <= STALE_CLAIM 300s).
module outbox_timed {
  import outbox(STALE_SAFE = true, FIX_STALE_COUNT = false).*
}

// The shipped code + the proposed F2 fix, under the production timing assumption.
module outbox_timed_fixed {
  import outbox(STALE_SAFE = true, FIX_STALE_COUNT = true).*
}

// The timing assumption dropped — what the code guarantees WITHOUT relying on the clock.
module outbox_untimed {
  import outbox(STALE_SAFE = false, FIX_STALE_COUNT = false).*
}
