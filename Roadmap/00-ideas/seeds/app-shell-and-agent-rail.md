---
title: "App shell and agent rail — make the signed-in product show the agent it sells"
slug: app-shell-and-agent-rail
status: queued
area: "02"
type: feature
priority: "#1"
appetite: M
underwritten_by: "Roadmap/bets/wave-2026-08-06.md"
risk: high
epic: "02-commercial/app-shell-and-agent-rail"
build_order: null
updated: 2026-08-06
---

<!-- SCAFFOLDED 2026-08-06. The epic README's frontmatter `status:` is now the SSOT for the board;
     this seed is funnel-only from here and its `status:` no longer drives anything. Architecture
     decisions D1–D10 and the per-sprint build contracts live in the epic, not here. -->

> **Scaffolded → [`Roadmap/02-commercial/app-shell-and-agent-rail/`](../../02-commercial/app-shell-and-agent-rail/README.md).**
> The scaffolding pass verified this pitch against live code again and found one material
> simplification: **`lib/project-route-inventory.ts` already is the nav's SSOT** — every surface with
> a label, audience and gate, unit-tested and already consumed by `/app/page.tsx`. The audit's §6.1
> reads as though the IA had to be invented; it only has to be rendered. Recorded as decision **D1**.

# Pitch — the app shell and the agent rail

> **Lane: shaped bet. Funded 2026-08-06** at the betting table
> (`Roadmap/bets/wave-2026-08-06.md`) — it displaced the E4 signals-loop follow-ups and the E6 CMS
> spike for a third consecutive wave. `status: queued`; scaffolding follows.
>
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §0, §2.1, §2.5, §6.1, §6.2, §6.5,
> §6.7, §7 (P0), plus that document's §10 verification pass against live `main` (`36aceba`).

---

## Problem

A PM signs up because the landing page sold them on working alongside their agent. They sign in and
find a bare `<ul>` of project slugs behind a three-link header, and eleven feature areas with no way
to reach or relate them. The `AgentWindow` device that *is* the brand promise renders in exactly
three places, all of them marketing components on the public page. It never appears once inside
`/app`.

The audit's §0 names the root cause and it is worth restating in one line, because it is the thing
this bet buys down: **the product was built for an agent to operate and a PM to audit — it has been
rendered, not designed.** The backend already models the agent as an accountable actor with scoped
credentials, staged writes and an append-only trail. None of that reaches a screen.

**Why now, and why this slice first.** The audit's P0 also lists "adopt the component kit across all
26 routes" and "add a charting primitive." Neither is the bottleneck. A PM who cannot see what their
agent did is not helped by consistently-styled tables of the same illegible data. The say-do gap is
the expensive problem; the styling debt is a chore that can be paid down incrementally behind this.

## Appetite — **M (one wave)**

Fixed before any solutioning, per WAYS-OF-WORKING → *Betting & appetite*. One architect session +
builder fan-out + review rounds.

**M is smaller than the audit's P0, deliberately.** P0 as written — kit adoption across 26 routes,
the agent rail, Command Center, *and* a charting library — is an L. Rather than grow the appetite,
the problem is narrowed: this bet buys **the shell, the rail, and a front door that answers "did
anything need me today"**, using only primitives that already exist in the repo. The kit-adoption
sweep and any chart-library decision are explicitly displaced (see *No-gos*).

**Circuit breaker (M lane, hard).** If the appetite is exhausted, work **stops and returns to
shaping** — never extended in flight. The most likely trigger is named under *Rabbit holes*.

## Class and lane

- **Class:** genuinely-new product surface (a new signed-in shell + a new read seam), not a bug or
  a chore.
- **Lane:** **shaped bet** → the betting table.
- **Risk: HIGH.** Not because of the UI, but because Sprint 1 adds a **new tenant-scoped read path
  over `audit_log`**. AGENTS rule: no request-derived read path may cross projects. Treat as high
  under WAYS' "when unsure, treat it as high-risk" — product owner merges.

## Can we already do this? (the reuse gate)

Most of it, yes — which is what makes M plausible at all. Verified against live `main`:

| Need | Already exists | What's actually missing |
|---|---|---|
| Read what the agent did, per project | `lib/task-lifecycle-facts.ts` reads `audit_log` scoped by `project_id` + `action`, ordered by `created_at` | A general `lib/agent-activity.ts` in the same shape. `lib/audit.ts` is **write-only** — its only export is `recordAudit`. |
| Tell an agent's action from a human's | The audit row's `via: 'connector'` metadata — a fact about the credential and code path, not a free-text label a tenant could game | Nothing. Reuse the rule verbatim; do not re-derive it. |
| A pending-proposal queue | `task_write_confirmations` + `consume_write_confirmation`, with `agent_key_id` NOT NULL so a confirmation is minted *for* a credential | A read + a UI. **Not a new mechanic.** |
| Agent chrome | `components/ui/AgentWindow.tsx` | The tool-call *line* (`you ▸` / `⚙ tool_name` / result) is written ad-hoc in three landing components. It has to be **extracted** into a real primitive. |
| Funnel bars | `.funnel` / `.bar` in `references/design/assets/tokens.css`, already imported first by `apps/web/app/globals.css` and asserted by the drift guard | Nothing. **Point it at real data.** No chart library needed for this bet. |
| A kill switch for the surface | `lib/flags.ts` — thirteen env-backed `*_ENABLED` gates, all exact `=== 'true'` | One more, born OFF (see *Kill-switch*). |
| A UI drift guard | `npm run check:design-drift` already walks **all of `apps/web/app`** | It does **not** cover `components/ui` or `components/product` — where the new primitives land. Extending it is in scope. |

**The reframe this produces:** the audit reads as "build the propose→confirm pattern." The verified
answer is **"surface the propose→confirm pattern that already shipped, dark, in signals-loop Sprint
3."** `CONNECTOR_WRITES_ENABLED` gates it and the migration record states it has never been enabled
in production. That is a materially smaller bill of materials than §6.2 implies.

## Bill of materials

**New seams**

- `apps/web/lib/agent-activity.ts` — project-scoped `audit_log` read, modeled on
  `task-lifecycle-facts.ts`. An **explicit allow-list** of `AuditAction` values it renders; never
  `select *`. Returns `null`, not `[]`, when it cannot read (the `not_instrumented` vs `not_met`
  distinction this repo already draws).
- `apps/web/lib/pending-confirmations.ts` — project-scoped read over `task_write_confirmations`.

**New primitives** (`components/ui/`)

- `ActivityFeedItem` — one plain-language line: actor · action · target · relative time. Extracted
  from the landing components' ad-hoc tool-call markup, then *those* components refactored onto it,
  so there is one device and not two.
- `StatCard` — for the Command Center strip.
- `FunnelBars` — a thin React wrapper over the existing `.funnel` / `.bar` CSS.

**Changed surfaces**

- `components/product/ProductShell.tsx` — real section nav over the eleven areas; keep the existing
  narrow-width bottom-tab instinct and extend it with an overflow.
- `apps/web/app/app/page.tsx` — the bare `<ul>` becomes Command Center.
- The agent rail — collapsible right rail on desktop, pull-up sheet on mobile, on every `/app` route.

**Rails**

- Extend `scripts/check-design-drift.mjs` to cover `components/ui` and `components/product`.
- Specs accrete into the existing `apps/web/e2e/` — `design-system.authed.spec.ts`,
  `project-navigation.authed.spec.ts` are the neighbours.

## Kill-switch (WAYS Stage 6b — decided here, verified at epic DoD)

`AGENT_RAIL_ENABLED` in `lib/flags.ts`. **Enablement gate ⇒ default `false`, born OFF, created
disabled.** Exact `=== 'true'`, matching all thirteen existing gates. It gates the rail and Command
Center's agent strip; it must **not** gate the section nav (a nav that disappears with a flag is a
worse failure than no flag). A `*-dark.spec.ts` sibling asserts the OFF behaviour, matching
`flag-serving-dark.spec.ts` / `scenario-dark.spec.ts` / `journey-dark.spec.ts`.

## Slicing (three sprints, stacked per WAYS)

`feat/app-shell-and-agent-rail` → `-s2` → `-s3`, each cut from the previous, one PR per sprint,
merged in order.

**S1 — the read seam and the shell.** *As a PM, I want the signed-in app to have real navigation, so
that I can reach and relate the eleven feature areas without knowing URLs.*
`agent-activity.ts` + `pending-confirmations.ts` + `ProductShell` section nav + the drift-guard
extension. Shared surface, highest blast radius → **architect, first, not delegated.**
*Acceptance:* every feature area is reachable from the shell on desktop and narrow widths; a
cross-project read of `audit_log` is impossible by construction and a spec asserts it.

**S2 — the agent rail.** *As a PM, I want to see what my agent has been doing and what it's waiting
on me for, so that I can validate or override it instead of discovering it later.*
`ActivityFeedItem` extracted (landing refactored onto it), the rail behind `AGENT_RAIL_ENABLED`,
recent activity + pending confirmations.
*Acceptance:* with the flag OFF the rail is absent and nothing else changes (dark spec); with it ON,
a real audit row renders as a plain-language line correctly attributed via `via: 'connector'`; the
rail is captioned as *recent activity*, never as a complete ledger.

**S3 — Command Center.** *As a PM, I want the front door to answer "did anything need me today," so
that I can use this product in short bursts between meetings.*
`StatCard` strip (North Star + TARS, including the real Medusa revenue linkage the audit flags as an
underused asset) + `FunnelBars` pointed at real TARS data + recent activity summary.
*Acceptance:* `/app` no longer renders a bare `<ul>`; the funnel renders as bars from live data using
the already-loaded `.funnel` CSS; no new runtime dependency was added.

## Rabbit holes

- **The tool-call glyphs fail the guard.** `⚙` and `▸` are matched by `check-design-drift`'s
  pictograph rule, which already covers all of `apps/web/app`. Use the existing `Icon` component.
  **Disabling or narrowing the rule is a no-go** — it is a shipped rail, not an obstacle.
- **Claiming completeness the audit trail can't back.** `recordAudit` swallows its own failures by
  design and says so: *"best-effort, not a ledger you can prove completeness against."* Caption the
  rail accordingly. Getting this wrong is not cosmetic — it is the same failure as an artifact that
  lost its caveats, on the one surface whose whole pitch is that it shows its work.
- **`AgentWindow` looks more reusable than it is.** It is 27 lines of chrome. Budget for extracting
  the line component, and refactor the three landing callers onto it in the same sprint, or the
  product ships two divergent devices.
- **Rail noise scales with the propose/confirm policy** — see *Open decision*. If owner-initiated UI
  actions also stage, the rail's information architecture changes. **This is the most likely
  circuit-breaker trigger**; it is why the decision is asked for before the bet, not during it.

## No-gos (this bet does not buy these)

- **No charting library.** The funnel CSS exists; sparklines can wait. Adding a dependency is its own
  decision with its own bundle-size and token-conformance argument.
- **No component-kit sweep across the remaining 24 routes.** Separate, and an S-lane chore.
- **No Flags rule builder, no Scenarios redesign, no Git & Releases panel.** P1/P2 — separately
  seeded.
- **No chat surface.** The audit's §4 conclusion holds: accountable, legible, ambient — not
  conversational. Golden Beans does not compete with Slack.
- **No new event pipeline or bespoke analytics route** (AGENTS rule #1) and **no widening of
  `/api/v1/public/*`** (rule #2).

## Decided at the betting table, 2026-08-06 — was: open, owed before this is bet

**How far does propose → confirm go?** Audit §8, narrowed by the §10.4 verification:

- Already settled: **agent writes over the connector all stage** (`task_write_confirmations`,
  credential-bound, `CONNECTOR_WRITES_ENABLED`, never yet enabled in production).
- Still open: do **owner-initiated UI actions** — activate a flag, trip a breaker, revoke a key —
  adopt the same staged shape, or does a `ConfirmDialog` suffice for them?

**DECISION (product owner, 2026-08-06): `ConfirmDialog` for owner-initiated actions; staging stays
agent-only.** An owner confirming their own action a second time through a staging table is
ceremony, not accountability — the owner *is* the authority the staging step exists to defer to. It
also keeps the rail's meaning sharp: everything in the pending list is something an agent wants and
a human hasn't yet allowed. Restricting staging to agent writes keeps S2's scope honest at M, and
defuses the circuit-breaker trigger named under *Rabbit holes* before a builder starts.

## Success — what is true when this ships

1. A PM signing in can reach all eleven feature areas from the shell.
2. The rail answers *"what has my agent been doing"* in plain language, correctly attributed, without
   overclaiming completeness.
3. A pending agent proposal is visible and actionable on the same screen as the activity that
   produced it.
4. `/app` answers *"did anything need me today"* at a glance.
5. `AGENT_RAIL_ENABLED` exists, born OFF, with a dark spec proving the OFF path.
6. No new runtime dependency was added.

## Not shaped here

Anything that changes the **public offer** triggers the landing-backfill contract (WAYS epic DoD).
This bet is signed-in only; §6.1's IA does not alter a public claim, so no backfill is expected. If
S3's Command Center ends up surfacing a claim the landing makes, that is an amendment, recorded and
dated in the epic README — never a silent reinterpretation.
