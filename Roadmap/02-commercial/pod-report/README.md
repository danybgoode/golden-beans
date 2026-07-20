---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: pod-report
---

# Epic: Pod Report + Roadmap Hub — benchmarks/ROI + live roadmap-vs-end-state views

> **Area:** 02-commercial · **Risk:** high · **Scope seed:** [`00-ideas/seeds/pod-report.md`](../../00-ideas/seeds/pod-report.md)

## Why
Two things, one primitive. The **Pod Report** is the cost-center→revenue-engine sales artifact:
velocity, throughput, cycle/lead time, the DORA five (incl. rework rate), cost-per-shipped-point —
human-baseline vs agent-augmented pod eras of the *same* repo, computed from medusa-bonsai's real
104-epic dataset (never claimed), layered with the outcome metrics the engine itself produces
(TARS adoption, North-Star movement, revenue per feature). The **Roadmap Hub** is why we plan
top-down at all: a live, beautiful "here's the destination, here's where we are on the road"
surface — portfolio → epic → sprint, always shown against the desired end-state — shareable with
clients and investors via revocable scoped links. Both are rendered report artifacts, so this epic
resolves the named decision gate **YES: report-rendering becomes an engine primitive**
(Daniel, 2026-07-15). ReportHub-as-Notion stays in medusa-bonsai; this is pattern lift, never
absorption.

## Platform-primitives note
Additive only: a `report_artifacts` table (versioned, immutable) + a `roadmap-push` rail (clients
POST their extract-schema JSON with their own API key — same client-pushes shape as the S2
registry seed; no engine-side git access). Rendering lives in `apps/web` beside the existing
funnel/impact/experiments pages. Share links join E2's `api_keys` credential taxonomy as scoped
revocable rows — one taxonomy, not a third system.

## Decisions locked (Daniel, 2026-07-15)
1. **Report-rendering = engine primitive** (the E3 decision gate, resolved YES — two consumers at
   birth: Pod Report + Roadmap Hub; investor-shareable views can't be "here's my Notion").
2. **Hub inside E3, builds at its turn (#3)** — no E1↔E3 swap; interim visibility = the Notion ops
   projection (wired 2026-07-15 as bookkeeping).
3. **Share model: tokenized revocable links, per-audience lenses (team/client/investor), ships
   dark** behind `REPORT_SHARES_ENABLED`; auth-only and fully-public rejected.
4. **Speed and stability paired** (DORA-2025 honesty): CFR/recovery/rework rendered beside
   velocity — the report that only shows speed is the vendor-ware our audience smells.

## Amendment — the AI-adoption maturity lens (Daniel, 2026-07-20)

Scope doc: [`00-ideas/seeds/ai-adoption-maturity-lens.md`](../../00-ideas/seeds/ai-adoption-maturity-lens.md).
Adds **one LOW story (2.4)** to Sprint 2 and widens 2.3's citation set + the v1 boundary. No new
sprint, no new epic, no new primitive.

**Why it rides E3 rather than standing alone:** E3's metrics answer *how fast, how stable*. They
don't answer *why, and what's next*. The lens places the pod on the published Steps-of-AI-Adoption
ladder (Cherny, 2026-07-16) — a scale the buyer's leadership already reads — computed from the very
inputs Story 2.1 loads. Standalone it's a questionnaire; as a section it's the interpretation layer,
and **every "not instrumented" row names a guardrail a pods engagement installs**. That's the
cost-center→revenue-engine pitch closing itself.

**Evidence rule (the decision that keeps it a product):** git/PR-derived only. No self-declared
criteria, no telemetry prerequisite. What can't be computed renders as **"not instrumented"** —
honesty as a design element, same grammar as the registry-declared-Targeted caveat and the ✅/🔜
badges. medusa-bonsai's own OTel/analytics guardrail work later flips those rows to computed with
zero contract change.

## Sprints
| # | Sprint | Ships |
|---|---|---|
| 1 | [The rendering primitive + hub skateboard](sprint-1.md) | `report_artifacts` + `roadmap-push` rail · journey + drill-down views (gb as tenant #0) · horizon view vs end-state registry |
| 2 | [The Pod Report (computed, not claimed)](sprint-2.md) | delivery metrics from the mb dataset · outcome layer · designed report surface with benchmark citations · **AI-adoption maturity lens** |
| 3 | [Share links + backfill (the flip)](sprint-3.md) | scoped share tokens (dark) · landing §5 backfill + hub dogfood · launch |

**Build-time dependency:** Sprint 2 requires a local `~/dobby/medusa-bonsai` checkout (dogfood
dataset = its Roadmap frontmatter + git history). Builds after E1/E2; if E2 slips, Sprint 1
path-gates internally and only Sprint 3 hard-needs the credential taxonomy.

## Kill-switch (Stage 6b, recorded at groom)
`REPORT_SHARES_ENABLED` — enablement gate, ships dark/**OFF**, flipped deliberately at story 3.3.
Fine-grained kill: revoking a share-token row. Internal hub views (Sprints 1–2) sit behind the
team boundary — no flag; rollback = revert on `main`. All migrations additive.
