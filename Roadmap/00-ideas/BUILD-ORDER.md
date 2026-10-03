<!-- GENERATED FILE — do not edit by hand.
     Regenerate:  node scripts/build-order.mjs
     Stage: scripts/lib/stage.mjs, from each initiative's frontmatter (docs only in this file; the
     live board with git/GitHub facts is `node scripts/build-order.mjs --live` and the Hub). -->

# Build order — the six stages

> **Generated 2026-10-03 — do not hand-edit.** One stage per initiative, decided in one place
> (`scripts/lib/stage.mjs`): To groom · Grooming · Ready to build · Building · QA · Shipped.
> This committed file reads the docs alone, so **Building and QA are not here** — they are facts git
> and GitHub hold. For the live board run `node scripts/build-order.mjs --live`, or open the Hub board.

## To groom (9)

_seeds with no pitch yet._

- [Scenarios freeze: archive the epic, correct the landing's SecOps claim, deprecate the SDK scenario API](seeds/scenarios-freeze.md) — #36 · 01 Growth Engine · seed · Chore · risk: Low · appetite S · _docs: status raw_
- [Verify module: the verification depth ladder as a product (after the spike)](seeds/verify-module.md) — #54 · 09 Platform Infra · seed · Feature · risk: High · appetite L · _docs: status raw_
- [A delivery whose settle keeps failing is re-sent every 5 minutes, uncounted and unlogged](seeds/delivery-stale-reclaim-uncounted.md) — 01 Growth Engine · seed · Bug · risk: High · appetite S · _docs: status raw_
- [gf north-star set --json: say whether --yes would be accepted](seeds/north-star-dry-run-sendable.md) — 09 Platform Infra · seed · Feature · risk: Low · appetite S · _docs: status raw_
- [perf-probe only requests the hosts a project names](seeds/perf-probe-target-allowlist.md) — 09 Platform Infra · seed · Chore · _docs: status raw_
- [Template scripts run when invoked through a symlinked path](seeds/script-ismain-realpath.md) — 09 Platform Infra · seed · Chore · _docs: status raw_
- [The CLI body-order guard misses req.clone().json()](seeds/cli-body-order-guard-clone.md) — 09 Platform Infra · seed · Chore · risk: Low · appetite S · _docs: status raw_
- [The docs name a kickoff-generator path that does not exist in an installed repo](seeds/kickoff-generator-path.md) — 09 Platform Infra · seed · Bug · risk: Low · appetite S · _docs: status raw_
- [This repo lints its template scripts the way its consumers do](seeds/foundation-lint-gate.md) — 09 Platform Infra · seed · Chore · _docs: status raw_

## Grooming (2)

_a pitch is waiting at the approval gate._

- [Analytics visualization — the charting-dependency decision (spike), then the layer](seeds/analytics-visualization-layer.md) — #14 · 01 Growth Engine · seed · Spike · risk: Low · appetite S · _docs: status ready_
- [Git & Releases — a PM-legible picture of what the agent shipped (discovery spike)](seeds/git-and-releases-legibility.md) — #17 · 02 Commercial · seed · Spike · risk: Low · appetite S · _docs: status ready_

## Ready to build (5)

_scaffolded (or a fixed-scope seed), in build order — pull from the top._

- [Scenarios made PM-operable — define, launch, and kill a scenario from the UI](../01-growth-engine/scenarios-pm-operable/README.md) — #16 · 01 Growth Engine · 10/10 stories · risk: High · appetite M · _docs: status in-progress_
- [CMS-neutral experiment integration + Payload go/no-go](../01-growth-engine/cms-integration-spike/README.md) — #18 · 01 Growth Engine · 0/6 stories · risk: Low · _docs: status scaffolded_
- [One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo](../09-platform-infra/golden-frijoles-plugin/README.md) — #34 · 09 Platform Infra · 14/23 stories · risk: High · appetite L · _docs: status in-progress_
- [One public monorepo — skills/ subtree, a lean install mirror, licences, a private docs repo](../09-platform-infra/public-monorepo/README.md) — #45 · 09 Platform Infra · 13/15 stories · risk: High · appetite M · _docs: status in-progress_
- [Board renders priority where it should render build_order](seeds/build-order-render-fix.md) — 09 Platform Infra · seed · Chore · risk: Low · appetite S · _docs: status queued_

## Building — live only

_a work branch is on origin. Not in this committed file: `node scripts/build-order.mjs --live` or the Hub board._

## QA — live only

_a PR is ready for review, or merged and waiting for its close-out. Not in this committed file: `node scripts/build-order.mjs --live` or the Hub board._

## Shipped (49)

_merged, deployed and closed._

- [✅ Epic: Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads](../09-platform-infra/think-skills/README.md) — #53 · 09 Platform Infra · 7/7 stories · risk: High · appetite M · _docs: status shipped_
- [✅ Epic: Sketch specs — a surface spec renders the grey wireframe and becomes the state contract](../09-platform-infra/sketch-specs/README.md) — #52 · 09 Platform Infra · 5/5 stories · risk: Low · appetite M · _docs: status shipped_
- [✅ Epic: Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured](../09-platform-infra/compiled-prompts/README.md) — #51 · 09 Platform Infra · 6/6 stories · risk: Low · appetite M · _docs: status shipped_
- [Session budget — one deep ask per approval gate, plus a measured line ✅](../09-platform-infra/session-budget/README.md) — #50 · 09 Platform Infra · 3/3 stories · risk: Low · appetite S · _docs: status shipped_
- [✅ Epic: Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow)](../09-platform-infra/semantic-lint/README.md) — #49 · 09 Platform Infra · 3/3 stories · risk: Low · appetite S · _docs: status shipped_
- [Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals](../09-platform-infra/intent-match/README.md) — #48 · 09 Platform Infra · 9/9 stories · risk: Low · appetite M · _docs: status shipped_
- [Distribute what we use — one review rail, Jev and notify setup, schedulers, build view](../09-platform-infra/distribute-what-we-use/README.md) — #47 · 09 Platform Infra · 11/11 stories · risk: High · _docs: status shipped_
- [Refit the Jev guard thresholds with DSPy ReAnchor on the labelled fixtures](seeds/jev-reanchor-thresholds.md) — #44 · 09 Platform Infra · seed · Spike · risk: Low · appetite S · _docs: status shipped_
- [✅ Epic: One Roadmap — the plugin's epics, seeds, bets and learnings move here](../09-platform-infra/one-roadmap/README.md) — #43 · 09 Platform Infra · 4/4 stories · risk: Low · appetite S · _docs: status shipped_
- [Portfolio view — every product in a workspace on one page, placed on the Consider · Operate · Exit loop ✅](../02-commercial/portfolio-view/README.md) — #41 · 02 Commercial · 7/7 stories · risk: High · appetite M · _docs: status shipped_
- [FinOps — quote vs actual per epic, measured from your own sessions, live in the build view, sent to the engine ✅](../09-platform-infra/finops/README.md) — #40 · 09 Platform Infra · 13/13 stories · risk: High · appetite L · _docs: status shipped_
- [One stage, every client: a six-stage board on the Hub, the CLI mod and every sink](../02-commercial/board-sinks-and-scrumban/README.md) — #39 · 02 Commercial · 15/15 stories · risk: High · appetite L · _docs: status shipped_
- [Workspaces become the tenant: one person, many products, one boundary ✅](../02-commercial/workspaces/README.md) — #38 · 02 Commercial · 8/8 stories · risk: High · appetite M · _docs: status shipped_
- [Verify spike: Quint on the outbox, Lean on the flag evaluator](../09-platform-infra/verify-spike/README.md) — #37 · 09 Platform Infra · 4/4 stories · risk: Low · appetite S · _docs: status shipped_
- [Experiments for humans](../01-growth-engine/experiments-for-humans/README.md) — #35 · 01 Growth Engine · 11/11 stories · risk: High · appetite L · _docs: status shipped_
- [Jev semantic guards — review-guard and prose-guard decide with Jev, not regex](../09-platform-infra/jev-semantic-guards/README.md) — #33 · 09 Platform Infra · 15/15 stories · risk: High · appetite L · _docs: status shipped_
- [The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod](../09-platform-infra/build-visualization-claude-mods/README.md) — #32 · 09 Platform Infra · 13/13 stories · risk: Low · appetite M · _docs: status shipped_
- [✅ Epic: Golden Frijoles by default — a spawned project already carries the flag provider](../09-platform-infra/golden-flags-by-default/README.md) — #31 · 09 Platform Infra · 6/6 stories · risk: High · appetite M · _docs: status shipped_
- [✅ Epic: Plugin audit + medusa extraction — pay the dark-skill debt, port what's stranded](../09-platform-infra/plugin-audit-and-extraction/README.md) — #30 · 09 Platform Infra · 14/14 stories · risk: Low · appetite L · _docs: status shipped_
- [Ways-of-work lean pass — remove the training wheels, close the adoption gap](../09-platform-infra/ways-of-work-lean-pass/README.md) — #29 · 09 Platform Infra · 19/19 stories · risk: High · appetite L · _docs: status shipped_
- [Golden Frijoles CLI v1 — the write surface an agent can actually drive](../02-commercial/golden-frijoles-cli/README.md) — #28 · 02 Commercial · 16/16 stories · risk: High · appetite L · _docs: status shipped_
- [The mockups, as built — delete the disclosures and finish the screens](../02-commercial/mockups-as-built/README.md) — #27 · 02 Commercial · 18/18 stories · risk: High · appetite M · _docs: status shipped_
- [✅ Epic: One design system, every surface — the rails that make a design outlive an epic](../02-commercial/design-system-rails/README.md) — #26 · 02 Commercial · 34/34 stories · risk: High · appetite L · _docs: status shipped_
- [Four destinations — an information architecture for the signed-in console](../02-commercial/console-ia-overhaul/README.md) — #25 · 02 Commercial · 13/13 stories · risk: High · appetite M · _docs: status shipped_
- [A preview deployment stops calling itself localhost](../09-platform-infra/site-url-preview-aware/README.md) — #24 · 09 Platform Infra · 4/4 stories · risk: High · _docs: status shipped_
- [The public surface names the category — agentic product management, a hero that hands you a prompt, and a North Star workshop worth the URL](../02-commercial/agentic-pm-public-surface/README.md) — #23 · 02 Commercial · 12/12 stories · risk: Low · appetite L · _docs: status shipped_
- [The methodology gets a room of its own](../02-commercial/methodology-experience/README.md) — #22 · 02 Commercial · 17/17 stories · risk: Low · appetite L · _docs: status shipped_
- [The landing reads at a glance — the maker-ops page, cut down to what it claims](../02-commercial/landing-readability-pass/README.md) — #21 · 02 Commercial · 4/4 stories · risk: Low · _docs: status shipped_
- [Maker ops — the landing repositions from a growth engine to an operating context](../02-commercial/landing-maker-ops/README.md) — #20 · 02 Commercial · 21/21 stories · risk: Low · appetite M · _docs: status shipped_
- [Golden Frijoles rebrand close-out](../02-commercial/frijoles-rebrand-closeout/README.md) — #19 · 02 Commercial · 5/5 stories · risk: Low · appetite S · _docs: status shipped_
- [Golden Frijoles — the rebrand, the material pass, and the controls that were broken](../02-commercial/landing-frijoles-rebrand/README.md) — #17 · 02 Commercial · 16/16 stories · risk: Low · _docs: status shipped_
- [Landing redesign v2 — the agent harness for product managers](../02-commercial/landing-redesign-v2/README.md) — #16 · 02 Commercial · 11/11 stories · risk: Low · _docs: status shipped_
- [Flags — a visual rule builder, rollout viz, and a plain-language version diff](../01-growth-engine/flags-visual-rule-builder/README.md) — #15 · 01 Growth Engine · 10/10 stories · risk: High · appetite M · _docs: status shipped_
- [Component-kit adoption sweep — bring the remaining /app routes onto the design system](../02-commercial/app-component-kit-adoption/README.md) — #13 · 02 Commercial · 12/12 stories · risk: Low · appetite M · _docs: status shipped_
- [App shell and agent rail — make the signed-in product show the agent it sells](../02-commercial/app-shell-and-agent-rail/README.md) — #12 · 02 Commercial · 10/10 stories · risk: High · appetite M · _docs: status shipped_
- [Flag control plane + Miyagi migration + resilience/SecOps](../01-growth-engine/flag-serving-and-prd-g/README.md) — #11 · 01 Growth Engine · 20/20 stories · risk: High · _docs: status shipped_
- [Notification rails — Telegram and Slack in lockstep](../09-platform-infra/notification-rails/README.md) — #10 · 09 Platform Infra · 3/3 stories · risk: High · _docs: status shipped_
- [Design system lift — the limitless golden-bean brand](../02-commercial/design-system-lift/README.md) — #9 · 02 Commercial · 7/7 stories · risk: Low · _docs: status shipped_
- [Signals loop — error/friction signals → structured tasks → the customer's own agent](../01-growth-engine/signals-loop/README.md) — #8 · 01 Growth Engine · 11/11 stories · risk: High · _docs: status shipped_
- [Pod Report + Roadmap Hub — benchmarks/ROI + live roadmap-vs-end-state views](../02-commercial/pod-report/README.md) — #7 · 02 Commercial · 10/10 stories · risk: High · _docs: status shipped_
- [Experiment governance v2 — registry, metrics, guardrails and decision record](../01-growth-engine/experiment-governance-v2/README.md) — #6 · 01 Growth Engine · 9/9 stories · risk: High · _docs: status shipped_
- [Entity journeys — configurable lifecycle projections beyond fixed TARS](../01-growth-engine/entity-journeys-projections/README.md) — #5 · 01 Growth Engine · 6/6 stories · risk: High · _docs: status shipped_
- [Event destination router — reliable fan-out to CRM and downstream tools](../01-growth-engine/event-destination-router/README.md) — #4 · 01 Growth Engine · 7/7 stories · risk: High · _docs: status shipped_
- [Multi-tenant activation — auth hardening, self-serve tenants, pod trials](../02-commercial/multi-tenant-activation/README.md) — #3 · 02 Commercial · 9/9 stories · risk: High · _docs: status shipped_
- [Commercial shell — Golden Beans landing, waitlist, connector install page](../02-commercial/commercial-shell/README.md) — #2 · 02 Commercial · 10/10 stories · risk: High · _docs: status shipped_
- [Growth Engine v1 — telemetry ingest, SDK, TARS funnel, North Star, A/B bucketing — ✅ shipped](../01-growth-engine/growth-engine-v1/README.md) — #1 · 01 Growth Engine · 13/13 stories · risk: Low · _docs: status shipped_
- [Golden Beans project rules and poster hardening](seeds/project-rules-and-poster-hardening.md) — 09 Platform Infra · seed · Chore · risk: Low · _docs: status shipped_
- [The board's epic links resolve one folder too high](seeds/board-link-depth.md) — 09 Platform Infra · seed · Bug · risk: Low · appetite S · _docs: status shipped_
- [The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics](../01-growth-engine/flags-console-parity/README.md) — 01 Growth Engine · 11/11 stories · risk: High · appetite M · _docs: status shipped_

---
_65 initiatives on the board. Regenerate with `node scripts/build-order.mjs`._
