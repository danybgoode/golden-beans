---
title: 'A delivery whose settle keeps failing is re-sent every 5 minutes, uncounted and unlogged'
slug: delivery-stale-reclaim-uncounted
status: raw
area: '01'
type: bug
priority: unranked
appetite: S
underwritten_by: null
risk: high
epic: null
build_order: null
updated: 2026-09-29
---

# Seed: a stale reclaim re-sends a delivery without charging its retry budget

**Found by** the `verify-spike` Quint model (finding **F2**), exhaustive to 12 steps. Evidence:
[`DECISION.md`](../../09-platform-infra/verify-spike/DECISION.md) § Findings, trace
`verify-spike/quint/traces/sends-unbounded-timed.itf.json`.

## Problem

`claim_deliveries` reclaims a row stuck `in_flight` for more than `STALE_CLAIM_MS` (5 min) **without
touching `attempt_count`**. Only `settle_delivery` increments it. So if a worker sends a webhook and
then fails to settle (the function dies, or the `settle_delivery` RPC errors, in which case
`settleDelivery()` returns null and the row stays `in_flight`), the next tick re-sends it, and the
send is never counted or written to `event_delivery_attempts`. If the settle keeps failing, the same
event reaches the customer's endpoint every 5 minutes with no bound, while the operating view shows
0 attempts.

The model's counterexample is `claim → send → settle fails` repeated 4 times: 4 sends, with
`attempt_count` still 0. `MAX_ATTEMPTS` was 3 in the model.

## Severity

It is **low-likelihood**. The error strings reaching `settle_delivery` are fixed transport text
(`guarded-http.ts` `boundedError`), so a receiver cannot make settle fail on purpose. It takes a
partial database failure where settle fails and claim keeps succeeding, repeatedly. It is
**high-impact when it happens**: unbounded duplicate sends that no dashboard shows.

## Fix sketch (already model-checked)

In `claim_deliveries`, a **stale** reclaim charges the presumed-lost attempt (`attempt_count + 1`).
A stale row whose charged count reaches the budget is dead-lettered instead of reclaimed. The model
variant `outbox_timed_fixed` removes the violation beyond the depth where it appeared (checked to 14
steps), and no other invariant regresses (see `quint/check.sh`). An implementation needs the
budget in SQL (`p_max_attempts`, since `MAX_ATTEMPTS` lives in `lib/retry-policy.ts`), a signature
change (drop the old one, re-`REVOKE`/`GRANT`), and ideally a logged attempt row for the presumed
send, so that the attempt log and `attempt_count` agree. It needs a regression e2e spec: seed a stale
`in_flight` row at `MAX_ATTEMPTS-1`, claim, and assert `dead`; seed one lower, and assert it is
claimed with `attempt_count+1`.

**Why this is a seed and not a fix inside the spike:** it changes the live claim path (`risk: high`,
the full review route; delivery PRs have historically taken many rounds) to fix a low-likelihood bug.
The spike's fix policy (clause 3) sends a fix that would exhaust the appetite to a seed.
