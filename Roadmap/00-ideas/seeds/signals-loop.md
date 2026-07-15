---
title: "E4 — Signals loop: error/friction signals → structured tasks → the customer's own agent"
slug: signals-loop
status: scaffolded
area: "01"
type: feature
priority: "#4"
risk: high
epic: "01-growth-engine/signals-loop"
build_order: "#4"
updated: 2026-07-15
---

# Scope — E4 Signals loop (the PostHog steal, inverted)

## Mirror-back
> Build the **closed signal loop** — error + friction signals captured into the engine, deterministically
> grouped into **structured tasks with product context** (funnel position, flag state, experiment
> variant), delivered to **the customer's own agent over MCP** — read tools to pull tasks, staged
> write tools to claim/resolve them — with **no integrated AI anywhere in the engine**. The inversion
> is the pitch: PostHog's loop ends in *their* agent; ours ends in **yours**. Landing §4 lights up in
> the same epic (backfill contract). Groomed single-session (Fable cadence); forks decided 2026-07-15.

## Classification
**Feature / Builder** (new capture surface + first public *write* surface, full DoD), with a Grower
signal: acceptance for launch includes **one real task claimed and resolved by a customer's own agent
end-to-end** (dogfood: golden-beans' own errors → tasks → fixed by our agent), tracked in the engine
itself.

## Stage-2.5 bucket: genuinely new, with heavy reuse
Nothing in golden-beans captures errors, derives friction, groups signals, or exposes tasks — and the
connector (E1, build pending) is read-only by design. Not already-possible, not a light enhancement.
The reuse is structural, though: signals ride the **S1.1 `tags`/`metadata` envelope built for exactly
this** (`apps/web/lib/track-schema.ts:10-11` — "deliberately open"; the PRD-G forward-compat note),
friction derives from funnel events already ingested, and the write shape lifts mb
`catalog-management`'s staged pattern. No new repo, no new infra rail.

## Decisions locked (Daniel, 2026-07-15 groom session)
1. **Signal scope v1: errors + derived friction.** SDK `captureError` + a global error handler for
   runtime errors; friction computed **server-side from funnel events already flowing** (adoption
   drop-off, dead-end, abandoned-adoption — rules declared as data). No session replay, no
   rage-click/client-side friction instrumentation in v1.
2. **The connector's first WRITE tools land here: task-status writes, staged + dark.** The customer's
   agent can claim/update/resolve tasks via **propose→confirm→apply** (mb `catalog-management` lift),
   behind a new enablement gate, on scoped credentials. Without writes the loop ends in a human
   clicking a dashboard — that's not an inversion, it's a report.
3. **Task shaping: engine-side deterministic grouping — no integrated AI.** The engine fingerprints
   and clusters signals, ranks by user impact (users affected × frequency), and emits task rows with
   an **evidence bundle** (feature, flag state, funnel position, experiment variant, sample events).
   No LLM anywhere in the engine; the *structuring* is the product value, the *fixing* is the
   customer's agent's job. (Agent-created-tasks-only rejected: v1 would ship no value without a
   capable agent on the other end.)
4. **Sequencing: stays #4, after E3.** Re-affirms E2/E3 adjudications; nothing has started building,
   so no build learnings to resequence on. Hard dependency is E1 (connector = delivery surface);
   write tools want E2's `api_keys` taxonomy (degrade path below); E3 is not a dependency.

## Research (verified 2026-07-15, cited)
- **PostHog Code launches spring 2026** — a desktop coding agent that connects to signal sources
  (Error Tracking, support tickets, session replay, GitHub/Linear), researches each signal,
  **prioritizes by user impact, and opens a PR when a code fix is possible**; tasks are its unit of
  work, and an "enricher" surfaces flag rollouts/experiment status/error frequency next to the code.
  Sources: [posthog.com/code](https://posthog.com/code), [docs tour](https://posthog.com/docs/posthog-code),
  ["self-driving product"](https://posthog.com/blog/self-driving-product). **Scope consequence:** the
  loop we're inverting is now a real, launched competitor motion — §4's side-by-side ("their loop ends
  in their agent; ours ends in yours") is current, and our impact-ranking should speak the same
  language (users affected × frequency) so the comparison is legible.
- **Sentry ships the tasks-over-MCP precedent:** the official `sentry-mcp` server (85K weekly npm
  downloads) lets *your* agent pull issue details, search events, and invoke Seer root-cause analysis
  from your IDE; Seer Autofix drafts fixes from stack traces (explorer-mode migration May 2026).
  Sources: [docs.sentry.io/ai](https://docs.sentry.io/ai/), [sentry.io/product/seer](https://sentry.io/product/seer/),
  [getsentry/sentry-mcp](https://github.com/getsentry/sentry-mcp/issues). **Scope consequence:**
  errors-to-your-agent-over-MCP is a well-trodden route (validates the shape); our differentiator vs
  Sentry is **product context** (TARS/flag/experiment evidence on every task) + friction signals —
  not error tracking depth. Don't compete on stack-trace tooling.
- **MCP Tasks primitive is unstable — don't build on it.** Tasks shipped experimental in the
  2025-11-25 spec revision (SEP-1686), and the 2026-07-28 release candidate **reshapes it into an
  extension** after production redesign. Sources: [2026 MCP roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/),
  [2026-07-28 RC](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/),
  [SEP-1686](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1686). **Scope
  consequence:** v1 delivers tasks as **plain read/write tools** (list/get/claim/resolve) — stable
  everywhere today; re-check the extension's status at build time as a named step.

## What already exists (reuse, don't rebuild)
| Capability | Where | Reuse for |
|---|---|---|
| Open `tags`/`metadata` envelope, built for this (PRD-G forward-compat, S1.1) | `apps/web/lib/track-schema.ts` | Error/friction signals ride `/v1/track` as reserved-namespace events (`$error`, `$friction`) — no schema migration |
| Tenant-scoped ingest + hashed API-key auth (server-resolved `project_id`) | `apps/web/lib/auth.ts` + `apps/web/supabase/migrations/20260713220000_track_events.sql` | Signal ingest inherits tenancy + auth for free |
| TS SDK client | `packages/sdk/src/index.ts` | `captureError` + global handler extend the same client (batched, sampled, payload-capped) |
| TARS aggregation queries | `apps/web/lib/tars-query.ts` (+ `feature-schema.ts` registry) | Friction detectors = declared rules over these aggregates (drop-off, dead-end, abandoned-adoption) |
| Read-only MCP connector: tokenized URL, revocation, tools (funnel/north-star/experiments) | E1 story 2.1/2.2 (build pending) | The delivery surface — task read tools are additive siblings |
| Staged propose→confirm→apply MCP mutation pattern (agent-safe writes) | mb `catalog-management` | The write-tool shape for claim/resolve — pattern lift, not rebuild |
| `api_keys` scoped-credential taxonomy | E2 story 1.3 (build pending) | Write-capable tokens = scoped rows, not a third credential system |
| Enablement env-gate precedent (`CONNECTOR_ENABLED`, `SIGNUP_ENABLED`, `REPORT_SHARES_ENABLED`) | E1/E2/E3 Stage 6b | `CONNECTOR_WRITES_ENABLED`, same seam shape |
| Impact-ledger pattern (append-only, snapshot at event time) | mb `profit-analyzer` prior (via SCOPE.md reuse table) | Signal counters/first-seen/last-seen as append-derived, never retro-mutated |
| Telegram operator notify | `apps/web/lib/telegram.ts` (chore branch `chore/telegram-alerts`, merge pending) | Optional one-liner: notify on first task creation — only if merged by build time |
| Cross-tenant-403 + realistic-input lessons | LEARNINGS → Review quality (S4) | Specs fire errors through the normal SDK path **untagged** (no experiment/feature convenience-tagging), foreign-tenant reads use a real foreign key |
| Design direction + heuristics rail | `references/design-direction.md`, mb `frontend-design` skill | Task surface + landing §4 visual language |

**Dependency:** builds after E1 (hard — the connector is the delivery surface) and wants E2's
`api_keys` (write scopes). **Degrade path if E2 slips:** add a `scope` column to E1's connector-token
rows additively and migrate into `api_keys` when E2 lands — Sprints 1–2 don't touch credentials at
all. E3 not a dependency (order is sequencing, not need).

## v1 boundary
**In:** SDK error capture (`captureError` + global handler; batching, sampling, payload caps,
PII/secret scrubbing at SDK *and* ingest) riding the existing envelope as reserved events ·
deterministic fingerprinting + grouping into `signals` (fingerprint, first/last seen, event count,
users affected) · impact ranking (users × frequency) · derived friction detectors (rules-as-data over
existing funnel events: adoption drop-off, dead-end, abandoned-adoption) · signal→task promotion
(thresholds as data, dedupe) with **evidence bundle** (feature, flag state, funnel position,
experiment variant, sample events) · task lifecycle (open → claimed → resolved/dismissed) ·
dashboard task views · MCP **read** tools (list/get tasks + evidence) · MCP **write** tools
claim/resolve via propose→confirm→apply, **dark behind `CONNECTOR_WRITES_ENABLED`**, scoped
credentials · landing §4 backfill (teaser → live inverted-loop section) · dogfood (gb's own errors →
tasks → resolved by our agent; loop events tracked in the engine).
**Out (named, not creep):** session replay · client-side friction instrumentation (rage clicks,
scroll maps) · any integrated AI/LLM in the engine · auto-PR creation (that's the customer's agent's
job — the inversion *is* the boundary) · the MCP Tasks extension (plain tools until it stabilizes;
re-verify at build) · alerting/paging product (one Telegram notify line at most) · support-ticket /
GitHub / Linear signal sources (PostHog Code parity — later seed if wanted) · non-TS SDKs · error
symbolication/source maps · task assignment to humans/teams · billing/quotas beyond E2's.

## Slicing (skateboard → car) — 3 sprints, ~3 stories each

### Sprint 1 — Signals in (capture + grouping, internal)
| Story | Ships | Risk |
|---|---|---|
| 1.1 As an app builder I want `captureError` + a global error handler in the SDK (batched, sampled, payload-capped, PII/secret-scrubbed) landing as reserved `$error` events through the existing envelope, so error capture is a one-line add. Acceptance: thrown error in a demo app → event row with fingerprint fields; malformed/oversized → 4xx; scrub verified on a seeded secret-shaped payload; foreign tenant can't read it. | error capture | LOW |
| 1.2 As the engine I want deterministic grouping of `$error` events into `signals` rows (fingerprint on message+stack-frame+feature; first/last seen, count, users affected) with impact rank, so a thousand repeats read as one problem. Acceptance: same error twice → one signal, count 2; distinct stacks → distinct signals; rerun over same inputs ⇒ identical grouping. | signal store + grouping | LOW |
| 1.3 As a PM I want friction detectors — rules declared as data over existing funnel aggregates (adoption drop-off, dead-end, abandoned-adoption) — emitting `$friction` signals, so friction needs zero new client code. Acceptance: seeded funnel fixture produces the expected friction signal; threshold change (data, not code) changes output; deterministic on rerun. | derived friction | LOW |

### Sprint 2 — Tasks out (structuring + the read surface)
| Story | Ships | Risk |
|---|---|---|
| 2.1 As a PM I want signals promoted to structured `tasks` (promotion thresholds as data; dedupe — an open task absorbs new matching signals) carrying the evidence bundle (feature, flag state, funnel position, experiment variant, sample events), so what reaches an agent is actionable, not raw. Acceptance: signal crossing threshold → exactly one task; evidence fields trace to engine queries; below threshold → none. | signal→task promotion | LOW |
| 2.2 As a team member I want dashboard task views (list ranked by impact, detail with evidence, lifecycle actions) in the design language, so humans see what agents see. Acceptance: statuses transition; foreign tenant on a real foreign projectSlug → 403/404; heuristics checklist run. | task surface (human) | LOW |
| 2.3 As a PM's agent I want connector **read** tools — `list_tasks` (ranked) + `get_task` (full evidence) — so my agent pulls work items, not raw logs. Additive to E1's read tools, same tokens. Acceptance: fresh Claude session reads the demo project's tasks via the connector; token sees only its own project's tasks (real foreign token spec'd). | task surface (agent, read) | LOW |

### Sprint 3 — The closed loop (writes + flip)
| Story | Ships | Risk |
|---|---|---|
| 3.1 As a PM's agent I want staged **write** tools — claim/resolve/dismiss via propose→confirm→apply (mb pattern: propose returns a diff-preview + confirmation token; nothing mutates without apply) — dark behind `CONNECTOR_WRITES_ENABLED`, on write-scoped credentials, fully audited. Acceptance: propose-without-apply mutates nothing; gate OFF → write tools absent/404; unscoped or revoked key → 401/403; every apply → audit row. | first public write surface | **HIGH — Daniel merges** |
| 3.2 As the landing I want §4 flipped teaser → live inverted-loop section (side-by-side with the integrated-AI alternative, via the section registry) and the dogfood loop running (gb's own errors → tasks → our agent fixes; loop events tracked in the engine), so we demo what we run. Acceptance: §4 renders real task output; one real gb task shows the full lifecycle in the engine's own funnel. | §4 backfill + dogfood | LOW |
| 3.3 As Daniel I want the launch: flip `CONNECTOR_WRITES_ENABLED`, run the loop end-to-end in a fresh session — customer's own agent pulls a real task, claims via propose→confirm→apply, resolves; revoke-confirm-dead; announce. Acceptance: flip recorded; one real task resolved by an external-shaped agent session; revocation verified live. | launch | **HIGH — Daniel flips/merges** |

## Stage 6b — kill-switch decision (`risk: high`)
Runtime seam exists → **enablement (dark-launch) gate as part of story 3.1**:
- **Gate:** `CONNECTOR_WRITES_ENABLED` env check at every write-tool registration/handler (house
  seam: env gate + redeploy; precedent `CONNECTOR_ENABLED`/`SIGNUP_ENABLED`/`REPORT_SHARES_ENABLED`).
  **Polarity:** enablement — ships dark/**OFF**, flipped deliberately at 3.3.
- **Fine-grained kill:** write scope lives on the credential row (E2 `api_keys`, or the additive
  scope column on E1 tokens if E2 slipped) — revoking/descoping a row cuts one agent's writes
  instantly, no deploy.
- **Carve-outs:** signal capture is client-controlled (the tenant's SDK init — removing the snippet
  stops capture; gb's own dogfood capture sits behind a gb env var) · read tools ride E1's existing
  `CONNECTOR_ENABLED` — no second flag · dashboards sit behind the team boundary (E2 auth or the
  interim path-gate). All migrations additive (`signals`, `tasks`, audit — no change to `events`).

## QA / smoke (Stage 8b owners)
Per story one Playwright api spec: error-ingest validation 4xx + scrub assertion · fingerprint/
grouping determinism · friction-rule determinism on a fixture · promotion threshold + dedupe ·
cross-tenant 403 with a **real** foreign key on signals, tasks, and both tool sets (S4 lesson) ·
propose-without-apply mutates nothing · gate-OFF → write tools absent · revoked/unscoped key 401/403.
**Realistic-input rule (S4 lesson, applied up front):** error specs fire through the normal SDK path
with NO experiment/feature convenience-tagging — the untagged event is the shape real callers send.
Sprint-end fool-proof walkthroughs in each `sprint-N.md`, real URLs. **Owed to Daniel by name:** S1
capture smoke (throw a real error in the demo app → watch the signal appear) · S2 agent-read smoke in
a fresh Claude session (connector → `list_tasks` → evidence sanity) · S3 full-loop smoke (fresh
session: pull → claim → confirm → resolve → revoke → confirm dead) + the production flip.

## Open risks
- **PII/secrets in error payloads** — the capture path is a new exfiltration surface: scrub at SDK
  *and* ingest (deny-list + shape heuristics), payload caps, sample bodies in evidence bundles are
  scrubbed rows only. Spec'd in 1.1; a leak here is a trust-killer for a multi-tenant engine.
- **Error storms / ingest volume** — a crash loop can flood `/v1/track`: SDK-side sampling +
  batching, per-key rate limits (E2 2.2 quotas apply when live), grouping absorbs volume into
  counters. E2's scale tripwires (~5M events/mo · p95 > 2s · ~50M rows) cover the rest — not re-adjudicated here.
- **Write-surface abuse** — first public mutation path: staged pattern, scoped keys, global gate,
  audit trail; HIGH-tier merges. Rule-3-style honesty: the connector manifest must describe write
  tools accurately once they exist (recorded at SCOPE.md panel adjudication #4).
- **Friction false positives** — a noisy detector destroys trust in the whole task queue: rules ship
  as data with conservative defaults, tuned on gb's own dogfood before any client sees them.
- **E1/E2 slip** — E1 is hard (no connector, no delivery surface): E4 cannot start before E1's 2.1.
  E2 slip is soft (degrade path above).
- **MCP tasks-extension drift** — plain tools are stable today; re-verify the extension + PostHog
  Code's shipped state at build time (named kickoff step) so §4's comparison copy stays checkable.

## Definition of Ready
- [x] Mirror-back confirmed; 4 forks decided by Daniel (2026-07-15: errors + derived friction ·
      write tools staged + dark · engine-side deterministic shaping · stays #4).
- [x] Stage-2.5 bucket named (genuinely new; envelope/ingest/connector/staged-write reuse cited from
      code + prior seeds); overlap checked (Sentry/PostHog differentiation recorded, not rebuilt).
- [x] Reuse list produced (code read: `track-schema.ts`, `auth.ts`, `tars-query.ts`, SDK, migrations);
      research cited (PostHog Code · Sentry Seer/MCP · MCP Tasks → extension, all verified 2026-07-15).
- [x] v1 in/out boundary written; evidence-bundle + lifecycle design specified; stories risk-tiered
      (2 HIGH — Daniel merges 3.1/3.3); QA stage + smoke owners named; realistic-input rule applied.
- [x] Kill-switch decision recorded (`CONNECTOR_WRITES_ENABLED` enablement gate, ships OFF;
      per-credential write-scope revocation; capture/read/dashboard carve-outs).
- [x] **Daniel approved this scope doc (2026-07-15)** → scaffolded `01-growth-engine/signals-loop/`
      (sprints 1–3), kickoffs emitted, BUILD-ORDER regenerated. Builds after E1 (hard) per the
      dependency note. Cross-panel not run (advisory; the offer stands for the 3.1 write surface —
      `node scripts/cross-panel.mjs` on this seed).
