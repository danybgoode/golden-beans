---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: app-shell-and-agent-rail
---

# Epic: App shell and agent rail — make the signed-in product show the agent it sells

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/app-shell-and-agent-rail.md`](../../00-ideas/seeds/app-shell-and-agent-rail.md)
> **Appetite:** M (one wave) · **Underwritten by:** [`bets/wave-2026-08-06.md`](../../bets/wave-2026-08-06.md)
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §0, §2.1, §2.5, §6.1, §6.2, §6.5, §6.7, and its §10 verification pass.

## Why

A PM signs up because the landing page sold them on working alongside their agent. They sign in and
find a bare `<ul>` of project slugs behind a three-link header, with eleven feature areas and no way
to reach or relate them. The `AgentWindow` device that carries the entire brand promise renders in
exactly three places — all of them marketing components on the public page — and never once after
sign-in.

The backend already models the agent as an accountable actor: scoped revocable credentials, staged
writes bound to the credential that proposed them, an append-only trail. None of it reaches a
screen. This epic closes that gap — the shell, the rail, and a front door that answers *"did
anything need me today"* — so the product stops being something that was rendered and starts being
something that was designed.

## Platform-first note

Everything here reads from primitives that already exist. **No new event pipeline, no new analytics
route, no widening of `/api/v1/public/*`** (AGENTS rules #1 and #2). The two new `lib/` seams are
read-only projections over tables that already carry the data:

- `audit_log` — written by `lib/audit.ts`, already indexed `(project_id, created_at DESC)`.
- `task_write_confirmations` — the staged-proposal table signals-loop Sprint 3 shipped.

**No new runtime dependency.** The `.funnel` / `.bar` CSS is already imported into the signed-in app.

## What already exists (reuse, don't rebuild)

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The nav's information architecture | **`lib/project-route-inventory.ts`** — `PROJECT_ROUTE_INVENTORY`, every surface with `label`, `routeSegment`, `audience` (member/owner), `gate`, `status` (linked/gated/flow-only). Unit-tested, already consumed by `/app/page.tsx` via `getProjectSurfaceLinks`. | **Nothing.** The IA is not invented here — it is *rendered*. See D1. |
| Tenancy for a signed-in read | `lib/supabase-auth.ts` → `getSessionUser()`; `lib/membership.ts` → `getUserProjects`, `getMemberProjectId`, `isProjectMember`; `lib/dashboard-auth.ts` → `requireDashboardAccess` / `requireProjectMembership` / `requireProjectOwnership` | Nothing. Every new read resolves `project_id` through these — never from the URL. |
| Reading the activity trail | `lib/task-lifecycle-facts.ts` — the working precedent: `audit_log` filtered by `project_id` + `action`, ordered `created_at ASC`, with the reasoning written out | A general `lib/agent-activity.ts` in the same shape. `lib/audit.ts` is **write-only** (sole export `recordAudit`). |
| Agent-vs-human attribution | The audit row's `metadata.via === 'connector'` — a fact about which credential and code path performed the mutation | Nothing. Reuse the rule verbatim (D3). |
| A pending-proposal queue | `task_write_confirmations` (+ `consume_write_confirmation`), `project_id NOT NULL`, `agent_key_id NOT NULL`, `action` CHECK in `claim`/`resolve`/`dismiss` | A project-scoped read and a UI. **Not a new mechanic.** |
| Agent chrome | `components/ui/AgentWindow.tsx` — 28 lines: title bar, dots, status chip, `{children}` | The tool-call *line* itself, written ad-hoc in three landing components. Must be **extracted** (D5). |
| Funnel bars | `.funnel` / `.bar` in `references/design/assets/tokens.css`, imported first by `apps/web/app/globals.css` (the drift guard asserts that import) | Nothing. Point it at real data. |
| Kill switch | `lib/flags.ts` — thirteen env-backed gates, all exact `=== 'true'` | One more, born OFF (D6). |
| UI drift guard | `npm run check:design-drift` — already walks **all of `apps/web/app`** | It does **not** cover `components/ui` or `components/product`, where the new primitives land (D7). |

## Architecture decisions — locked before any builder starts

*Verified against live `main` (`36aceba`), not inferred from the plan. Builders **cite** these; they
do not re-derive them — a paraphrased contract drifts permissive.*

**D1 — The section nav renders `PROJECT_ROUTE_INVENTORY`; it does not define its own list.**
The audit's §6.1 proposes eight top-level sections as if the IA were missing. It isn't:
`project-route-inventory.ts` already carries every surface with a label, an audience and a gate, and
`/app/page.tsx` already renders it as a nested `<ul>`. The work is presentation, not taxonomy. A
second hardcoded list in `ProductShell` would be a duplicate SSOT that drifts the first time a
surface is added. **If the nav needs a grouping the inventory can't express, extend the inventory
(with its test) — never inline a list in the shell.**

**D2 — `lib/agent-activity.ts` renders an explicit allow-list of `AuditAction` values, never `select *`.**
`AuditAction` is a growing union (23 values today, spanning credentials, destinations, shares, tasks
and flags). A feed that renders whatever it finds will surface a new action the day someone adds one,
unreviewed and unlabelled. The allow-list is the review gate.

**D3 — Agent attribution comes from `metadata.via === 'connector'`, never from an actor string.**
Copied verbatim from `task-lifecycle-facts.ts`, whose header states the reasoning: pattern-matching
`claimed_by` for `claude`/`-bot` would infer identity from a caller-supplied free-text label, letting
a tenant move its own numbers by naming a human "claude-code". `via` is a fact about the credential
and code path.

**D4 — The rail is captioned as RECENT ACTIVITY, never as a complete ledger.**
`recordAudit` swallows its own failure by design so a successful revoke is never rolled back by a
failed log write; its own comment says *"this trail is best-effort, not a ledger you can prove
completeness against."* A rail captioned "everything your agent did" would claim completeness the
data structurally cannot support — the same failure as an artifact that lost its caveats, on the one
surface whose whole pitch is that it shows its work. **Copy is part of the acceptance criteria here,
not polish.**

**D5 — `AgentWindow` is chrome, not the device. Extract `ActivityFeedItem`, and refactor the three
landing callers onto it in the same sprint.** The tool-call vocabulary lives ad-hoc inside `Hero`,
`InvertedLoopSection` and `LiveProofSection`. Building a second one for `/app` ships two divergent
devices for one brand promise.

**D6 — `AGENT_RAIL_ENABLED`: enablement gate ⇒ default `false`, born OFF, created disabled.**
Exact `=== 'true'`, matching all thirteen existing gates. It gates the rail and Command Center's
agent strip. It explicitly does **not** gate the section nav — a nav that vanishes with a flag is a
worse failure than no flag. A `*-dark.spec.ts` sibling asserts the OFF path, matching
`flag-serving-dark.spec.ts` / `scenario-dark.spec.ts` / `journey-dark.spec.ts`.

**D7 — The glyphs fail the existing drift guard. Use `Icon`; do not weaken the rule.**
`check-design-drift.mjs` already sweeps all of `apps/web/app` for pictographs (`⚙`, `▸` and friends)
and raw hex. It is a shipped rail, not an obstacle. Extending its coverage to `components/ui` and
`components/product` is in scope for S1. Note the inline-style ban is **landing-only**, so dynamic
bar widths in `/app` are permitted.

**D8 — The pending list is TASK-scoped in v1, because that is all the table models.**
`task_write_confirmations.task_id` is `NOT NULL REFERENCES tasks(id)`. There is no staged-proposal
row for a flag activation or a scenario launch today. The rail must say what it covers rather than
implying it shows every pending agent action. Generalising the mechanic is P2 (`git-and-releases`
sibling seeds), not this bet.

**D9 — Owner-initiated actions get a `ConfirmDialog`; staging stays agent-only.**
Product-owner decision, 2026-08-06, recorded in the wave file. Answers audit §8's third open
question. Keeps the rail's pending list meaningful: everything in it is something an agent wants and
a human has not yet allowed.

**D10 — Never order `audit_log` by `id`.** It is `gen_random_uuid()`, so ordering by it is arbitrary
rather than chronological. `task-lifecycle-facts.ts` carries a cross-review scar for exactly this.
Order by `created_at`; the index `audit_log_project_created_idx (project_id, created_at DESC)`
already backs it.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `lib/agent-activity.ts` — project-scoped, allow-listed `audit_log` read | high |
| 1 | 1.2 `lib/pending-confirmations.ts` — project-scoped `task_write_confirmations` read | high |
| 1 | 1.3 `ProductShell` section nav rendering `PROJECT_ROUTE_INVENTORY` | low |
| 1 | 1.4 Extend `check-design-drift` to `components/ui` + `components/product` | low |
| 2 | 2.1 Extract `ActivityFeedItem`; refactor the three landing callers onto it | low |
| 2 | 2.2 `AGENT_RAIL_ENABLED` + the rail: recent activity, on every `/app` route | high |
| 2 | 2.3 Pending agent proposals in the rail (task-scoped, per D8) | high |
| 3 | 3.1 `StatCard` + the North Star / TARS strip | low |
| 3 | 3.2 `FunnelBars` over the existing `.funnel` CSS, on real TARS data | low |
| 3 | 3.3 Command Center replaces the bare `<ul>` at `/app` | low |

## Deploy order

Backend-first, and there is no migration in this epic — every read is over a table that already
exists, so nothing needs `supabase db push`. `AGENT_RAIL_ENABLED` is born OFF and absent, and an
absent var is already OFF (exact `=== 'true'`), so S1 and S2 merge dark with no env step. **Flipping
it ON requires a new deployment** — Vercel snapshots env vars at build time (AGENTS rule #4), so
setting the var is half the job. Verify by exercising the rail, never by `vercel env ls`.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Landing backfill check — this epic is signed-in only and changes no public claim, so none is
      expected; if S3 surfaces a claim the landing makes, that is a dated amendment here, never a
      silent reinterpretation
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — D6):** `AGENT_RAIL_ENABLED` exists in Vercel in every env
      with the stated polarity (born OFF), and the dark spec proves the OFF path. *Verify-only.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
