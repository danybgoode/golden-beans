---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: signals-loop
---

# Epic: Signals loop — error/friction signals → structured tasks → the customer's own agent

> **Area:** 01-growth-engine · **Risk:** high · **Scope seed:** [`00-ideas/seeds/signals-loop.md`](../../00-ideas/seeds/signals-loop.md)

## Why
The PostHog steal, inverted. Error and friction signals flow into the engine, get deterministically
grouped into **structured tasks with product context** (feature, flag state, funnel position,
experiment variant, sample events), and are delivered to **the customer's own agent over MCP** —
read tools to pull ranked tasks, staged write tools to claim/resolve them. **No integrated AI
anywhere in the engine**: PostHog Code's loop ends in *their* agent; ours ends in **yours** — the
crispest statement of the BYO-agent differentiator, and landing §4 lights up in this same epic
(backfill contract). Verified at groom (2026-07-15): PostHog Code launches spring 2026 with exactly
this loop; Sentry's MCP server proves tasks-over-MCP is a trodden route — our edge is product
context + friction, not stack-trace depth.

## Platform-primitives note
Additive only: signals ride the existing `/v1/track` envelope as reserved events (`$error`,
`$friction` — the S1.1 `tags`/`metadata` forward-compat, built for this), grouped into new
`signals` + `tasks` tables (+ write audit); no change to `events`. Task tools are additive siblings
of E1's connector read tools; write-capable credentials join E2's `api_keys` taxonomy (or an
additive scope column on E1 tokens if E2 slips). MCP Tasks primitive NOT used (unstable — moving to
an extension per the 2026-07-28 RC; plain tools in v1, re-verify at build).

## Decisions locked (Daniel, 2026-07-15)
1. **Signals v1 = errors + derived friction** — SDK `captureError` + global handler; friction
   computed server-side from funnel events already flowing (rules as data). No session replay, no
   client-side friction instrumentation.
2. **The connector's first WRITE tools land here** — claim/resolve via propose→confirm→apply
   (mb `catalog-management` lift), dark behind `CONNECTOR_WRITES_ENABLED`, scoped credentials.
3. **Task shaping is engine-side and deterministic** — fingerprint/cluster, impact rank
   (users × frequency), evidence bundle. No LLM in the engine; fixing is the customer's agent's job.
4. **Stays #4, after E3** — hard dependency E1 (the connector is the delivery surface); E2 wanted
   for credential scopes (degrade path recorded); E3 not a dependency.

## Sprints
| # | Sprint | Ships |
|---|---|---|
| 1 | [Signals in (capture + grouping)](sprint-1.md) | SDK `captureError` + `$error` ingest (scrubbed, capped) · deterministic grouping into `signals` + impact rank · derived friction detectors (rules as data) |
| 2 | [Tasks out (structuring + read surface)](sprint-2.md) | signal→task promotion + evidence bundle · dashboard task views · connector read tools (`list_tasks`/`get_task`) |
| 3 | [The closed loop (writes + flip)](sprint-3.md) | staged write tools (dark) · landing §4 backfill + dogfood loop · launch |

**Build-time dependency:** cannot start before E1 story 2.1 (the connector). If E2 hasn't landed,
write scopes go on E1's token rows additively and migrate into `api_keys` later — Sprints 1–2 touch
no credentials. Named kickoff step: re-verify PostHog Code's shipped state + the MCP tasks
extension before building §4 copy and the tool surface.

## Kill-switch (Stage 6b, recorded at groom)
`CONNECTOR_WRITES_ENABLED` — enablement gate, ships dark/**OFF**, flipped deliberately at story 3.3.
Fine-grained kill: revoking/descoping a credential row cuts one agent's writes instantly, no deploy.
Carve-outs: signal capture is client-controlled (SDK init; gb dogfood behind a gb env var) · read
tools ride E1's existing `CONNECTOR_ENABLED` · dashboards sit behind the team boundary. All
migrations additive.
