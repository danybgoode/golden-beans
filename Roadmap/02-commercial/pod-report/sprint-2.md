# Pod Report + Roadmap Hub — Sprint 2: The Pod Report (computed, not claimed)

**Status:** ⬜ not started

## Stories

### Story 2.1 — Delivery metrics from the medusa-bonsai dataset
**As the** pods pitch, **I want** delivery metrics computed from the mb dogfood dataset (velocity
points/sprint, throughput stories+epics/period, cycle + lead time, the DORA five — deploy
frequency, change lead time, CFR, failed-deployment recovery time, rework rate — and
cost-per-shipped-point), human-baseline era vs agent-augmented-pod era of the *same repo*, pushed
as a report artifact, **so that** every number is reproducible, never claimed. Pattern-lifts mb's
`pmo-report.mjs`/`reports-data.json` rail. Cost model declared as data (rates/token costs
snapshotted at computation time, ledger-style — `profit-analyzer` prior).
**Setup:** requires a local `~/dobby/medusa-bonsai` checkout (Roadmap frontmatter + git history).
**Acceptance:** rerun from same inputs ⇒ byte-identical artifact; one hand-computed sample epic
matches (owed to Daniel at smoke); story-point caveat (within-dataset comparison only) embedded in
the artifact.
**Risk:** LOW

### Story 2.2 — The outcome layer
**As a** decision-maker, **I want** the outcome layer joined in — TARS adoption, North-Star input
movement, revenue-per-feature — queried from the engine (Medusa-truth boundary respected: revenue
reads attribution telemetry + derived reports, never a commerce replica), **so that** the report
says "shipped *and it mattered*", not just "shipped fast".
**Acceptance:** every outcome row traces to an engine query; no commerce data replicated into
report artifacts.
**Risk:** LOW

### Story 2.3 — The report surface (speed × stability, cited context)
**As the** brand, **I want** the Pod Report rendered in the design language with **speed and
stability paired** (DORA-2025 honesty: CFR/recovery/rework beside velocity — AI-era throughput
without stability is the known failure mode) plus benchmark context lines (DORA levels · LinearB
2026 · DX Core 4 · **Steps of AI Adoption — Cherny, 2026-07-16** — **cited + linked, never
republished wholesale**), **so that** it survives a skeptical PM.
**Acceptance:** frontend-design heuristics checklist run + noted in PR; every external number
carries its linked source; the story-point caveat is visible on the page, not a footnote.
**Risk:** LOW

### Story 2.4 — The AI-adoption maturity lens
**As a** product-org decision-maker, **I want** the Pod Report to place the pod on the published
Steps-of-AI-Adoption ladder (0–4), criterion by criterion, with computed evidence beside every
claimed criterion and an explicit **"not instrumented"** marker where we cannot measure, **so that**
"agent-augmented pod" becomes an auditable position on a named external scale instead of an
adjective.

Added by amendment 2026-07-20 — scope doc:
[`00-ideas/seeds/ai-adoption-maturity-lens.md`](../../00-ideas/seeds/ai-adoption-maturity-lens.md).

**Ships:** a `maturity` section **on the Pod Report artifact** (not a new artifact type, not a new
table, not a new ingest) — one row per ladder criterion, each `met` · `not met` · `not
instrumented`; every `met` row carries an evidence pointer to a real checkable object (PR number,
CI check name, git-derivable fact). A verdict line ("operates at step N") computed from met-criteria
coverage and **always rendered beside the not-instrumented count**, so coverage can never be hidden
by the score.

**Computed from Story 2.1's existing inputs** (mb Roadmap frontmatter + git history + PR metadata —
no new data source): automated code review present (reviewer-agent PR comments) · automatic
code-quality enforcement (CI check names per PR) · worktree isolation + parallel agents (overlapping
branch lifetimes) · "Claude writes most of the code" (`Co-Authored-By: Claude` trailer ratio) ·
risk-tier merge discipline (PR-body tier vs merging identity) · trusted self-verification loop
(green-gate-before-merge rate, revert rate) · trust in the loop (cycle/lead time, CFR, recovery,
rework — already computed in 2.1) · standards encoded in `CLAUDE.md`/Skills (`ways-of-work` plugin
provenance in the pushed extract).

**Rendered "not instrumented" in v1** (honest gaps, and each one an upsell line): auto-mode state ·
live agent-concurrency count · token/cost per outcome · automatic **security** review · proactive
Claude-kicks-off-Claude monitor · agent sandboxing. When medusa-bonsai's OTel/analytics export lands
(its own area-09 guardrail work), these rows flip to computed with **zero** change to this lens's
contract — that is the point of building it this way.

**Setup:** use `references/Steps-of-AI-Adoption.md` (the structured version) as the criteria source.
The old flat `StepsofAIAdoption.txt` collapsed the source table's columns and must not be used for
scoring — a truncated extraction is exactly what produced a wrong assessment on 2026-07-17.

**Acceptance:**
- Rerun from the same inputs ⇒ byte-identical maturity section (inherits 2.1's determinism spec).
- Every `met` row resolves to a real object — follow the evidence pointer, land on the PR/check.
- No row can be `met` without evidence — the evidence pointer is a **required field**, so the
  renderer is structurally incapable of an unevidenced claim.
- A deliberately **low-maturity fixture repo scores low** — the lens is not tuned to medusa-bonsai's
  shape (LEARNINGS → Review quality, the S4 realistic-input lesson).
- The not-instrumented count is visible wherever the verdict is, **including the investor lens**.
- Each derived row states its proxy (a trailer ratio is a proxy, not proof), same treatment as the
  story-point caveat.
- Ladder cited + linked and **version-pinned** (title + author + date) in the artifact, so an old
  report stays interpretable against the ladder it scored. Table never republished wholesale.

**Risk:** LOW — additive, read-only derivation over data Story 2.1 already loads. No table, no
ingest, no credential surface, no money/auth path.

## Sprint QA
- **api spec(s):** 2.1 → artifact determinism (same inputs ⇒ same output) · 2.2 → outcome rows
  present + traceable · 2.3 → citation fields non-empty for every benchmark line · 2.4 → maturity
  determinism · every `met` row has a resolvable evidence pointer · **low-maturity fixture scores
  low** · not-instrumented count present on the investor lens
- **pure-logic seam (2.4):** criterion-scoring functions live in a **zero-import `lib/` file**
  (LEARNINGS: a unit-tested pure helper can't share a file with framework-only imports). Free
  coverage, and it's where the fixture test lives.
- **browser smoke owed:** yes, to Daniel — (a) hand-verify one epic's cycle time + cost-per-point
  against raw mb history (numbers spot-check); (b) **read the rendered maturity section cold and
  check the verdict against your own judgement of where the pod actually sits.** If the lens says
  step 3 and you'd say step 2, the lens is wrong — that disagreement is the acceptance test no spec
  can write. Same sitting as (a).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs). Owed per Stage 8b:
the numbers spot-check against raw mb git history._
