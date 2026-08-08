---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: signals-loop
build_order: 8
---

# Epic: Signals loop — error/friction signals → structured tasks → the customer's own agent

> **Area:** 01-growth-engine · **Risk:** high · **Scope seed:** [`00-ideas/seeds/signals-loop.md`](../../00-ideas/seeds/signals-loop.md)

## Why
The PostHog steal, inverted. Error and friction signals flow into the engine, get deterministically
grouped into **structured tasks with product context** (feature, flag state, funnel position,
experiment variant, sample events), and are delivered to **the customer's own agent over MCP** —
read tools to pull ranked tasks, staged write tools to claim/resolve them. **No integrated AI
anywhere in the engine**: PostHog's loop ends in *their* agent; ours ends in **yours** — the
crispest statement of the BYO-agent differentiator, and landing §4 lights up in this same epic
(backfill contract).

## Platform-primitives note
Additive only: signals ride the existing `/v1/track` envelope as reserved events (`$error`,
`$friction` — the S1.1 `tags`/`metadata` forward-compat, built for this), grouped into new
`signals` + `tasks` tables; no change to `events`. Task tools are additive siblings of the
connector's read tools; write-capable credentials join `api_keys` as a third `scope` value with
its own welded resolution view. MCP Tasks primitive NOT used (now SEP-2663, an official
*extension* — see Amendment 1).

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

---

## Amendments (build-time audit, 2026-07-26)

The scope doc was groomed 2026-07-15, when E1 (connector) and E2 (`api_keys`) were both *pending*.
Both shipped, along with E3 and three further growth-engine epics. Re-verifying the doc against the
codebase and against its own named research step produced five amendments. Each is recorded here
rather than silently reinterpreted (WAYS-OF-WORKING, "surface scope-breaking findings").

### Amendment 1 — the external research premises moved (verified 2026-07-26)
- **PostHog Code has NOT launched.** It is now **PostHog Desktop**, *"launching Summer 2026."* The
  seed described it as "a real, launched competitor motion." It is **announced, not shipped**.
  **Consequence:** landing §4's side-by-side must say *announced*, never *shipped* — the same
  honesty rail `pod-report` welded into §5. A comparison against a competitor's unreleased product,
  written as though it were released, is exactly the kind of unfalsifiable claim this repo refuses.
- **MCP Tasks is now SEP-2663, an official extension** (`io.modelcontextprotocol/tasks`), moved out
  of core after production feedback; the final 2026-07-28 spec ships two days from this amendment.
  **Consequence:** the groom decision (plain read/write tools in v1) is *unchanged and now
  better-founded*. Recorded for the v2 seed: promotion into core is intended once the extension
  stabilises, and that is the trigger to revisit — not a version bump.

Sources: [SEP-2663 Tasks Extension](https://modelcontextprotocol.io/seps/2663-tasks-extension) ·
[2026-07-28 release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) ·
[PostHog Desktop](https://posthog.com/desktop) · [posthog.com/code](https://posthog.com/code)

### Amendment 2 — write tools may NOT ride the connector token (Daniel, 2026-07-26)
The seed's plan was "write tools ride the connector, on scoped credentials," with a degrade path of
"a `scope` column on E1's connector-token rows." **Both are now unsafe, for a reason that did not
exist when the seed was written.**

`connector_tokens` are stored **in plaintext by design** and are **deliberately re-displayed on the
public `/install` page** (`lib/connector-tokens.ts`: *"the value is meant to be openly re-displayed
on the public install page, not kept secret"*). The `report_shares` migration then wrote down, at
length, why a URL-borne credential must never authenticate a mutation: it travels through browser
history, `Referer` headers, proxy logs, and screenshots. Adding writes to that token would hand a
mutation credential to everything that has ever seen an install page.

**Decision: writes require TWO credentials that must agree.**

| Layer | Credential | Where it lives |
|---|---|---|
| Identify the project · authorize reads | `gb_connector_…` | the MCP URL path (unchanged) |
| Authorize the mutation | `gb_key_…`, `api_keys.scope = 'agent_write'` | `Authorization: Bearer` header |

Both must resolve, and **both must resolve to the same `project_id`**, or the write tools are not
registered at all. The `agent_write` scope is hashed, revocable, expirable and audited exactly like
an ingest key, and gets its own welded resolution view (`active_agent_write_keys`) so — as with
`active_ingest_keys` — the scope filter cannot be dropped by a refactor, because there is no filter
in application code to drop.

This yields **three independent kill switches** on the write path (`CONNECTOR_WRITES_ENABLED` ·
revoke the connector token · revoke the write key), one better than AGENTS rule #3's two, which is
proportionate for the engine's first public mutation surface.

### Amendment 3 — friction runs lazily and project-scoped; no new scheduler (Daniel, 2026-07-26)
Friction detectors need to sweep funnel aggregates. The obvious shape — a cron like
`dispatch-deliveries` — would need a `projects_with_friction_due()` function and therefore **a new
row in AGENTS.md's scheduler-exemption registry**, which that file says must be a deliberate,
recorded decision and never an inference by analogy.

**Decision: don't take the exemption.** Detectors run **inside the already-tenant-scoped read
paths** (dashboard load, `list_tasks`) for that one resolved `project_id`, behind a Postgres
advisory lock plus a `friction_evaluated_at` throttle so concurrent readers neither race nor
thrash. Zero cross-tenant reads, zero new cron surface, zero amendments to AGENTS.md.

**Accepted cost, stated plainly:** a friction signal materialises when someone or their agent looks,
not before. For a queue whose entire purpose is to be pulled, that is the right trade. A cron sweep
is recorded as a deferred follow-up seed for when a real tenant wants a warm queue.

### Amendment 4 — four additions, approved (Daniel, 2026-07-26)
1. **Task lifecycle rides the destination router.** `task_opened` / `task_claimed` / `task_resolved`
   are emitted as first-class subject-bearing events through the *existing* event-destination-router.
   A tenant pipes their task queue into Linear, Slack or anything else via their own signed
   destination — and we build **zero** integrations. This is the highest value-per-line item in the
   epic precisely because the router already does the hard part.
2. **`resolve` carries an evidence pointer** — a commit SHA, PR URL or note, stored on the task.
   Mirrors `pod-report`'s rule that a claim with no resolvable evidence pointer is downgraded rather
   than asserted. It makes the closed loop *auditable*, not merely closed.
3. **The loop feeds the AI-adoption ladder.** Landing §5 currently *asserts* "step 1 · Assisted."
   Task-lifecycle facts become ladder evidence in `pod-report`'s scoring, so that claim is
   **computed** from real agent-resolved tasks. This epic is the first thing in the repo that could
   honestly move that number — see `references/Steps-of-AI-Adoption.md`, step 3→4 ("scaled
   automation of domain-specific use cases, e.g. feedback remediation").
4. **One Telegram line** when a project's first task is ever created (`lib/telegram.ts`). The seed
   capped this at "one notify line at most"; this is that line.

### Amendment 5 — a second enablement gate (architect, 2026-07-26)
The seed planned one flag (`CONNECTOR_WRITES_ENABLED`). But signal capture, grouping, promotion and
the task surface are a whole new ingest-and-storage seam, and every prior epic gave its new seam its
own born-OFF gate (`JOURNEY_PROJECTIONS_ENABLED`, `EXPERIMENT_GOVERNANCE_ENABLED`,
`REPORT_SHARES_ENABLED`). **`SIGNALS_ENABLED` joins them**, gating capture/grouping/tasks/read-tools,
independently of `CONNECTOR_WRITES_ENABLED` which gates only the mutation surface. Two flags, two
polarities of the same shape, both born OFF.

---

## Sprints
| # | Sprint | Ships |
|---|---|---|
| 1 | [Signals in (capture + grouping)](sprint-1.md) | SDK `captureError` + `$error` ingest (scrubbed, capped) · deterministic grouping into `signals` + impact rank · derived friction detectors (rules as data, lazily evaluated) |
| 2 | [Tasks out (structuring + read surface)](sprint-2.md) | signal→task promotion + evidence bundle · router fan-out + first-task ping · dashboard task views · connector read tools (`list_tasks`/`get_task`) |
| 3 | [The closed loop (writes + flip)](sprint-3.md) | `agent_write` credential scope · staged write tools · landing §4 backfill + ladder evidence · launch |

**Shipped 2026-07-27** — PR [#38](https://github.com/danybgoode/golden-beans/pull/38), merged after
**eight** cross-review rounds alternating between families, stopping on a Blocking-free round from
the other family. Migrations applied to production and verified there by property, not by the push
command's output: `agent_key_id` NOT NULL, the credential bound inside the atomic consume, zero
`anon`/`authenticated` grants on the credential view.

**Ship shape (Daniel, 2026-07-26):** one PR per sprint, three PRs, all gates OFF until the whole
loop is provable end to end, then one deliberate flip. Migrations apply as they land.

## Kill-switches (Stage 6b, as amended)
| Flag | Gates | Polarity |
|---|---|---|
| `SIGNALS_ENABLED` | grouping · friction · promotion · dashboard · connector read tools | enablement, born **OFF** |
| `CONNECTOR_WRITES_ENABLED` | the staged write tools only | enablement, born **OFF**, flipped at 3.4 |

**What `SIGNALS_ENABLED` does NOT gate (corrected 2026-07-26, cross-review Codex round 2):** ingest
of a `$error` event, and the redaction applied to it. This table previously said "capture", the code
never did that, and the doc was the side that was wrong. A `$error` is an ordinary event — it arrives
through `/v1/track`, it is the tenant's data, and storing it is the engine's job; rejecting it while
a seam they cannot see is dark would break a contractually valid SDK call. Redaction is ungated for a
sharper reason: a kill switch whose OFF position starts storing raw credentials is worse than no
switch.

Fine-grained kill: revoking or descoping an `agent_write` row cuts one agent's writes instantly, no
deploy; revoking the connector token cuts that agent entirely. Carve-outs: signal capture is
client-controlled (SDK init) · read tools also ride `CONNECTOR_ENABLED` · dashboards sit behind the
team boundary. All migrations additive.
