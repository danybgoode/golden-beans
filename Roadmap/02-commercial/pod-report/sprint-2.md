# Pod Report + Roadmap Hub — Sprint 2: The Pod Report (computed, not claimed)

**Status:** 🟨 **COMPUTATION SHIPPED · SURFACE NOT SHIPPED.** PR
[#32](https://github.com/danybgoode/golden-beans/pull/32) squash `0eca9fc`, deployed to production
`success`. Every number the Pod Report needs is computed, deterministic and unit-tested — and **no
human can see any of it**: nothing renders it, and no `pod_report` artifact has ever reached the
engine.

## Status re-derived from the tree, not from the PR description (2026-07-26)

The close-out below was written by validating against `origin/main`, the production database and the
live site — not by reading the previous session's own summary. Two of its claims did not survive.

| Story | Previously claimed | Verified reality |
|---|---|---|
| 2.1 Delivery metrics | built `8cc093b` | ✅ **computation shipped.** `scripts/lib/pod-metrics.mjs` + `scripts/pod-report.mjs` run clean against the real checkout (841 commits · 133 epics · 98 merged PRs · 49-day window). ⚠️ **`--push` is NOT wired** — it prints `⚠ --push is not wired yet` and exits 0, so a run that looks successful stores nothing. |
| 2.2 Outcome layer | "built against the real `miyagisanchez` tenant" | ❌ **overstated.** `lib/pod-outcome.ts` is pure shaping with 6 unit tests. A repo-wide grep finds **zero callers**: nothing joins it to `lib/tars-query.ts` or `lib/north-star-query.ts`, so no outcome row has ever traced to an engine query. The acceptance criterion is unverifiable as shipped. |
| 2.3 Report surface | "view + honesty layer tested, no page component" | ✅ **accurate, and understated.** `lib/pod-report-view.ts` + 14 tests exist and no route renders them (`/hub/<slug>/report` → **404** in production). The view seam also has **no `maturity` field at all**, so Story 2.4's output has nowhere to go even once a page exists. |
| 2.4 Maturity lens | built `14202d5` | ✅ **computation shipped** (`scripts/lib/maturity-lens.mjs`, 599 lines, mutation-verified). ❌ **Not rendered anywhere**, so three of its acceptance criteria — the verdict shown beside the not-instrumented count, the count present *on the investor lens*, each row stating its proxy — are structurally unmet: there is no lens and no page. |

**Evidence for the two hard claims.** `select kind, count(*) from report_artifacts group by kind` on
production returns exactly one row — `roadmap`, 3 versions. `curl -o /dev/null -w '%{http_code}'
…/hub/golden-beans-demo/report` returns **404** (its two siblings, the journey and horizon views,
return 200).

**What this is not.** None of the shipped work is wrong — the computation is the hard half and it is
genuinely good (it caught and rejected two flattering-but-false numbers of its own accord). The gap
is that a report nobody can read is not a sales artifact, and Sprint 3's share links have nothing to
share until it renders.

**Carry-over, tracked as Sprint 2.5 below and shipped before Sprint 3 starts** — because Story 3.2
("§5 flipped teaser → live Pod Report section") and Story 3.1 (a client lens showing "their Pod
Report") both hard-depend on a surface that does not exist yet.

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

### Follow-up owed — epic ship-date detection is exact-string, not robust
Cross-review flagged that `readEpics` finds the shipped flip with `git log -S 'status: shipped'`, an
EXACT-string search that a YAML variation (`status: "shipped"`, unusual spacing) would miss —
silently dropping a genuinely shipped epic out of lead time. **The finding is correct and the
obvious fix is wrong.** Two `-G` regex replacements were tried against the real dataset and both
CHANGED verified numbers instead of preserving them: one returned zero measurable epics, the other
123 with a 3.6-day median where the validated answer is ~47 and ~7.2 days.

The cause is semantic. `-S` counts OCCURRENCES of a string, so it matches the commit where the count
went 0→1 — the flip itself. `-G` matches any commit whose diff merely TOUCHES a matching line, and
this dataset appends a growing changelog to the `status:` comment, so those edits are numerous.

Doing it properly means parsing the frontmatter at each revision rather than pattern-matching the
diff, with a fixture proving it reproduces the validated numbers first. Left as a follow-up rather
than shipped as an unverified swap that silently moves a headline metric.

## Sprint 2.5 — the carry-over that makes Sprint 2 real

Scoped from the verified gaps above. Not new scope: this is the unshipped half of stories 2.1–2.4,
and it is the hard dependency Sprint 3 sits on.

### 2.5a — Wire `--push` (completes 2.1)
`POST /api/v1/reports/pod/push` — its own payload contract (`lib/pod-report-schema.ts`), the same
`push_report_artifact` RPC + advisory lock Story 1.1 built, `kind='pod_report'`. The tenant comes
from the hashed API key and never from the body, exactly like the roadmap rail. Then
`scripts/pod-report.mjs --push` actually pushes.
**Acceptance:** unauthenticated → 401 · wrong `schemaVersion` → 400 · a real push produces a new
queryable version · a foreign tenant's key cannot read it. **Risk:** LOW.

### 2.5b — The lens seam (shared surface, and the reason it is built now)
`lib/pod-report-lens.ts` — `team` | `client` | `investor`, a **pure, zero-import** module. The lens
decides which sections and which rows a viewer receives, and it is resolved **server-side from a
credential, never from a URL**. Built in Sprint 2.5 rather than Sprint 3 because Story 3.1's share
links inherit it: a lens invented inside the share route would be a second policy that can drift
from the one the internal page uses.
**The invariant it carries:** no lens may drop the not-instrumented rows, the caveats, or the
verdict's not-instrumented count. `investor` narrows *detail*, never *honesty* — that is Story 2.4's
acceptance criterion made structural instead of remembered. **Acceptance:** a spec asserts every
lens keeps them, mutation-verified. **Risk:** LOW (pure), but load-bearing.

### 2.5c — The report surface (completes 2.3 + renders 2.4)
`/hub/[projectSlug]/report`, behind the same `requireDashboardAccess` gate as its sibling hub views.
Renders speed **with** stability and gaps beside it (never speed alone — Decision 4), composition,
the maturity ladder with a resolvable evidence pointer on every `met` row, the verdict beside the
not-instrumented count, and every benchmark cited + linked. `lib/pod-report-view.ts` grows a
`maturity` section so the artifact's lens output has somewhere to land.
**Acceptance:** frontend-design heuristics run + noted in the PR · every external number carries its
linked source · the caveats are on the page, not in a footnote · `isHonest()` refuses to render a
numbers-without-caveats view. **Risk:** LOW.

### 2.5d — The outcome layer, actually joined (completes 2.2)
`lib/pod-report-query.ts` reads the stored delivery artifact and joins a **live** outcome read
through `lib/tars-query.ts` / `lib/north-star-query.ts` — the canonical query libs, never a fresh
`events` query (AGENTS rule #1). Wired against a real tenant with real registered features.
**Acceptance:** every rendered outcome row traces to an engine query; no commerce data is copied
into an artifact; a tenant with no registered features renders "not instrumented", never zeros.
**Risk:** LOW.

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
