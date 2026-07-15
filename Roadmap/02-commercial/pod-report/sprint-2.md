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
2026 · DX Core 4 — **cited + linked, never republished wholesale**), **so that** it survives a
skeptical PM.
**Acceptance:** frontend-design heuristics checklist run + noted in PR; every external number
carries its linked source; the story-point caveat is visible on the page, not a footnote.
**Risk:** LOW

## Sprint QA
- **api spec(s):** 2.1 → artifact determinism (same inputs ⇒ same output) · 2.2 → outcome rows
  present + traceable · 2.3 → citation fields non-empty for every benchmark line
- **browser smoke owed:** yes, to Daniel — hand-verify one epic's cycle time + cost-per-point
  against raw mb history (numbers spot-check)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs). Owed per Stage 8b:
the numbers spot-check against raw mb git history._
