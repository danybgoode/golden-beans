# Event destination router — reliable fan-out to CRM and downstream tools — Retrospective

_Closed: 2026-07-22_

## What shipped

A tenant can create a **signed, filtered webhook destination** and have their project's events
delivered to it reliably, without ingest ever depending on a sink's health.

- **S1 (dark, `ce65993`)** — versioned actor/subject event contract + a transactional outbox: the
  event and its eligible delivery work commit in one Postgres transaction (`ingest_event`), so a sink
  can be down for a week and lose nothing.
- **S2 (`015eae4`, PR #16)** — the destination lifecycle (create/test/rotate/enable/disable/remove,
  secret shown once), a Stripe-shaped HMAC scheme with a copy-paste reference verifier, an SSRF-safe
  connection-**pinned** sender, a `FOR UPDATE SKIP LOCKED` claim with stale-reclaim, a deterministic
  retry/dead-letter engine, operator replay, an append-only attempt log, and a `CRON_SECRET`-gated
  `*/5` dispatch cron. Born dark behind `DESTINATION_DELIVERY_ENABLED`.
- **S3.1** — the Miyagi merchant-lifecycle consumer (shipped in `medusa-bonsai`): raw-body signature
  verification, a projection keyed idempotently on the canonical event id, and the six lifecycle
  milestones. The producer side needed no code — the generic S2 destination delivers it.
- **S3.3** — the delivery operating view (`delivery_health`, no secrets/PII) and the honest landing
  backfill (flipped 🔜 → ✅ only once delivery was actually live).
- **Production activation, 2026-07-22** — the ordered runbook: secret into Miyagi Cloud Run →
  destination created (born disabled) → hand-signed test delivery (`200 {"ok":true,"test":true}`) →
  destination enabled → `DESTINATION_DELIVERY_ENABLED` flipped ON. Cron verified live (`enabled:true`).

## What went well

- **Dark-by-default made a high-risk epic safe to merge in pieces.** S1 and S2 sat in production doing
  nothing until a deliberate flip, so partial merges never risked real delivery. The rollout order
  (secret in the receiver *before* the destination is enabled and *before* the flag) meant zero
  dead-letter risk — a 401 against an unset secret is a permanent 4xx that would have burned the whole
  backlog.
- **One signed-send code path** for both "send test" and the dispatcher — a receiver that validates
  against the test is validated against production, because the bytes are produced by the same code.
- **Property-bound rules over identity-bound ones.** The scheduler exemption and the "returns only
  project_id" guarantee are pinned by mutation-checked specs, so drift fails the gate rather than
  silently widening a carve-out.

## What we learned

Promoted to `Roadmap/LEARNINGS.md` (Review quality + the rollout-order rule):

- **On concurrency work, most late review findings are bugs in your own previous round's fix.** This
  epic's S2 took **24 cross-review rounds**; from ~round 12 on, each blocking finding was a race a
  prior round's fix introduced (drain-vs-in-flight → check-then-act liveness → unlocked `UPDATE … FROM`
  → a batched release that skipped the lock). Slow down on lock/settle/ordering changes.
- **`UPDATE … FROM other_table` does not lock the joined rows** — take an explicit `FOR SHARE` as its
  own statement, with one lock order for the whole subsystem.
- **`DROP`+`CREATE` on a function restores PUBLIC EXECUTE** — re-REVOKE, and pin it with a
  function-level-denial spec.
- **A comment cannot amend an architecture rule** — when a reviewer flags a documented invariant,
  bound the exposure and put an explicit either/or decision to the human (this produced the AGENTS.md
  scheduler exemption).
- **Rollout order is part of the design, not an afterthought:** the receiver must hold the shared
  secret before delivery is enabled, or an at-least-once system dead-letters its own backlog.
- **Vercel prod env vars are write-only (sensitive) and need a rebuild** (a commit to `main`) to reach
  running functions — `vercel env pull` returning empty is not a failure.

## Gaps / follow-ups

- **Story 3.2 (Attio adapter)** — deliberately deferred; optional, and needs a live workspace token.
  The adapter seam is a *destination kind*; scope it as its own sprint when a token exists.
- **The disposable-merchant business smoke** (Sprint 3 walkthrough) — Daniel's, via Miyagi's admin,
  where it writes a real, visible, reversible projection row. Machinery is verified; this is the
  business-level walk-through.
- **Secret-rotation grace window** — rotation invalidates the old secret immediately; a receiver not
  yet updated dead-letters until updated + replayed. A dual-secret grace window (the multi-signature
  header already supports it) is a worthwhile enhancement.
- **Dispatcher N+1** — `sendAndSettle` re-reads the event per row; foldable into the claim RPC when
  measured delivery volume justifies it.
- **True round-robin scheduling** — the cron uses `random()` ordering + a per-project budget as an
  anti-starvation floor; a cursor-based scheduler is the scale follow-up.
