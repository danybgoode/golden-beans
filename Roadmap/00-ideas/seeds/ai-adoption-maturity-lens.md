---
title: "AI-adoption maturity lens — the Pod Report places the pod on the published ladder (E3 amendment)"
slug: ai-adoption-maturity-lens
status: scaffolded
area: "02"
type: feature
priority: "#3 (rides E3)"
risk: low
epic: "02-commercial/pod-report"
build_order: null
updated: 2026-07-20
---

# Scope — the AI-adoption maturity lens, as an amendment to E3 `pod-report` v1

> **This seed does NOT scaffold its own epic.** It amends the already-approved E3 scope
> (`seeds/pod-report.md`, Daniel 2026-07-15) by adding one story to Sprint 2 and widening two
> existing lines. `epic:` points at E3 deliberately, so no fifth epic is ever created. Groomed
> 2026-07-20 from a Cowork session run *out of golden-beans* precisely to test the "build it here,
> consume it in medusa-bonsai" thesis.
>
> **Board mechanics (verified against `scripts/build-order.mjs`):** the funnel section filters on
> `status ∈ {raw, ready, queued}` — it does **not** check `epic:`. Set to `scaffolded` on approval
> (2026-07-20), so this stays out of the funnel and E3's README remains the sole status SSOT,
> exactly as `00-ideas/README.md` prescribes.
>
> **Approved by Daniel 2026-07-20** — amendment applied to `seeds/pod-report.md`,
> `02-commercial/pod-report/README.md` and `sprint-2.md` in the same pass.

## Mirror-back

> You want to know whether "AI-adoption maturity benchmark" — today a hand-written prose assessment
> living in medusa-bonsai's funnel — is really a **golden-beans product capability**: something the
> engine computes and renders, that medusa-bonsai then consumes as tenant #1, rather than an
> internal process spike that can only ever describe one repo.

**Verdict: yes for the benchmark, no for the rest of that seed.** The source seed
(`medusa-bonsai/Roadmap/00-ideas/seeds/ai-adoption-maturity-benchmark.md`) is three asks wearing one
filename, and only one of them is product.

## Classification

**Feature / amendment to an existing scaffolded-not-started epic.** Zero new epic, zero new
primitive, zero new table. One LOW story + two copy-level widenings.

## Stage 2.5 bucket — **light enhancement**, and that is the whole finding

Not "genuinely new." E3 `pod-report` already ships every primitive this needs:

- **`report_artifacts`** — versioned, immutable, tenant-scoped rendered artifacts. E3's own
  out-of-scope list names *"non-roadmap report types (the primitive allows them; v1 ships these
  two)"* — the primitive was designed to take a third type. This is that third type, except it
  isn't even a separate artifact: it's a **section on the Pod Report**.
- **The computation rail** — Sprint 2.1 already reads medusa-bonsai's Roadmap frontmatter + git
  history + PR metadata to compute the DORA five, cycle/lead time, rework rate and
  cost-per-shipped-point. The maturity lens reads **the same inputs**, no new data source.
- **The citation posture** — Sprint 2.3 already renders "our own numbers against named external
  levels — cited + linked, never republished wholesale" (DORA-2025 · LinearB 2026 · DX Core 4).
  The Steps-of-AI-Adoption ladder is a fourth external scale of exactly that shape.
- **The audience** — landing persona #2 ("the product-org decision-maker — buys the pods story")
  *is* the reader of a maturity score. §5 of `references/landing-end-state.md` is already reserved
  for it.

So the honest answer to "should this be built in golden-beans and consumed by medusa-bonsai?" is:
**yes, and it's cheaper than you think, because 90% of it is already scoped.** The expensive
version — a standalone maturity-benchmark product — is the one to refuse.

## Why this is genuinely good product (not just a cheap fit)

E3's existing metrics answer *"how fast, and how stable."* They do not answer *"why, and what's
next."* The maturity lens converts computed delivery numbers into **a position on a scale the
buyer's own leadership already reads** — Anthropic's published ladder, not a golden-beans
invention. Two consequences:

1. **The verdict is citable, not adjectival.** "We're an agent-augmented pod" is marketing.
   "This pod operates at step 2 of Cherny's published ladder, with these 9 of 14 criteria met and
   the evidence for each" is a claim a skeptical PM can audit — which is the entire E3 posture.
2. **The un-met and un-instrumented rows are the offer.** Every "not instrumented" row is a
   guardrail a pods engagement installs. The report that diagnoses the gap and names what closes it
   is the cost-center→revenue-engine pitch closing itself, without a single line of sales copy.

## Decision recorded (Daniel, 2026-07-20 groom)

1. **Split the source seed three ways** — the guardrail moves stay in medusa-bonsai and build on
   their own schedule; the benchmark comes to golden-beans; the process-distribution items go to the
   `ways-of-work` plugin. See "The split" below. Rationale: rehoming wholesale would park mb's
   step-2 guardrail gaps behind E1+E2+E3.
2. **Amend E3 v1 rather than seed an E7.** E3 is scaffolded and *not started* — nothing is built, so
   the amendment costs a doc edit. Consciously reverses E3's `non-roadmap report types` out-of-scope
   line, narrowly: this rides the Pod Report as a section, it does not open the primitive to
   arbitrary report types in v1.
3. **Evidence = git/PR-derived only; gaps render as gaps.** No self-declared criteria, no telemetry
   prerequisite. Criteria that cannot be computed render as **"not instrumented"** rows — honesty as
   a design element, same device as the registry-declared-Targeted caveat and the shipped/coming
   badges. This is the decision that keeps it a product rather than a quiz.

## Research / source material (verified 2026-07-20 against both checkouts)

- **The ladder:** *Steps of AI Adoption*, Boris Cherny, 2026-07-16. Five rungs — 0 Gated · 1 Assisted
  (~1 agent) · 2 Parallel (orchestrator, 5–10) · 3 Supervised autonomy (~100) · 4 AI-native
  (~1,000+) — each with a **bottleneck**, a **products** list and a **guardrails** list. The
  guardrails/products columns are what make it scoreable: they are discrete, nameable criteria, not
  a vibe.
- **Licensing posture:** identical to E3's existing rule — **cite + link, render our own evidence
  against the named rungs, never republish the table wholesale.** Re-verify terms at build.
- **⚠️ Reference-hygiene finding (act on this at build):** golden-beans'
  `references/StepsofAIAdoption.txt` (5,831 B) is a **lossier flat extraction** than medusa-bonsai's
  `references/Steps-of-AI-Adoption.md` (6,903 B). gb's copy collapses the source table's column
  semantics — bottleneck / products / guardrails run together as unlabelled lines, and step 4 loses
  its guardrail labels entirely. **The lens scores against named criteria columns, so the structured
  `.md` must be the source of truth.** Copy mb's version into gb's `references/` and delete the
  `.txt`. This is not pedantry: the source seed's own recorded history is that a truncated
  extraction produced a *wrong* assessment on 2026-07-17 that had to be re-benchmarked on 07-19.
  Same class of defect, still live in this repo.

## What already exists (reuse, don't rebuild)

| Capability | Where | Reuse for |
|---|---|---|
| `report_artifacts` (versioned, immutable, tenant-scoped) | E3 Sprint 1.1 | The lens is a **section on the Pod Report artifact**, not a new artifact type |
| `roadmap-push` rail (tenant POSTs extract JSON with own API key) | E3 Sprint 1.1 | Unchanged — no new ingest, no engine-side git access |
| Delivery-metrics computation over mb frontmatter + git + PR metadata | E3 Sprint 2.1 | **Same inputs**, same `~/dobby/medusa-bonsai` checkout requirement — the lens adds derivations, not sources |
| DORA rework rate + CFR + recovery time | E3 Sprint 2.1 | Feeds the ladder's step-2 "Claude checks its own work" and step-3 "trust in the loop" criteria directly |
| Benchmark context lines, cited + linked, never republished | E3 Sprint 2.3 | The ladder joins DORA/LinearB/DX as the fourth named external scale |
| Honesty badges (✅ shipped / 🔜 coming / hazy-horizon) as design elements | `references/landing-end-state.md`, E3 hub | The **"not instrumented"** row treatment — third badge state, same visual grammar |
| Audience lenses (team / client / investor) in the share token | E3 Sprint 3.1 | Maturity section inherits scoping free — investor lens sees the verdict + evidence counts, never per-story internals |
| Landing §5 (Pods & proof) backfill contract | E3 Sprint 3.2 | The maturity verdict is the §5 headline; no new landing section |
| Realistic-input review lesson (S4, LEARNINGS → Review quality) | `Roadmap/LEARNINGS.md` | Score a repo that is **not** medusa-bonsai in the spec — a synthetic low-maturity fixture — or the lens will silently encode mb's shape as the definition of "met" |

## The amendment — exactly what changes in E3

### New: Sprint 2, Story 2.4 — the AI-adoption maturity lens · **LOW**

> **As a** product-org decision-maker, **I want** the Pod Report to place the pod on the published
> Steps-of-AI-Adoption ladder (0–4), criterion by criterion, with computed evidence beside every
> claimed criterion and an explicit **"not instrumented"** marker where we cannot measure,
> **so that** "agent-augmented pod" becomes an auditable position on a named external scale instead
> of an adjective.

**Ships:** a `maturity` section on the Pod Report artifact — one row per ladder criterion (drawn
from the step-1/2/3 guardrail + product columns), each row `met` · `not met` · `not instrumented`;
every `met` row carries an evidence pointer that is a real, checkable object (a PR number, a CI
check name, a git-derivable fact). A verdict line ("operates at step N") computed from met-criteria
coverage, **rendered beside the not-instrumented count** so coverage is never hidden by the score.

**Computable from E3 2.1's existing inputs (the `met`/`not met` population):**

| Ladder criterion | Derived from |
|---|---|
| Automated code review on by default | reviewer-agent PR comments present per PR |
| Automatic code-quality enforcement (lint/tests/typecheck) | CI check names attached per PR |
| Worktree isolation · parallel agents | overlapping branch lifetimes in git history |
| "Claude writes most of the code" | `Co-Authored-By: Claude` trailer ratio over commits |
| Manual review + merge held to the same bar (risk tier) | PR-body risk tier vs. merging identity |
| Self-verification loop that is trusted | green-gate-before-merge rate; revert rate |
| Trust in the loop / decision throughput | cycle + lead time, CFR, recovery, rework (already computed) |
| `CLAUDE.md` + Skills encode standards | presence + provenance of the `ways-of-work` plugin in the pushed extract |

**Explicitly rendered "not instrumented" in v1** (each one is an honest gap, and each is an upsell
line): auto-mode state · live agent-concurrency count · token/cost per outcome (needs OTel or the
analytics API) · automatic **security** review · proactive Claude-kicks-off-Claude monitor ·
agent sandboxing.

**Acceptance:**
- Rerun from the same inputs ⇒ byte-identical maturity section (inherits 2.1's determinism spec).
- Every `met` row resolves to a real object — click the evidence pointer, land on the PR/check.
- No row is ever `met` without evidence; **the renderer must be structurally incapable of it**
  (evidence pointer is a required field, not a convention).
- A **deliberately low-maturity fixture repo** scores low — the lens is not tuned to medusa-bonsai's
  shape (the S4 realistic-input lesson, applied).
- The not-instrumented count is visible wherever the verdict is, including the investor lens.
- Ladder source is cited + linked; the table is not republished wholesale.

**Risk:** LOW — additive read-only derivation over data Sprint 2.1 already loads; no new table, no
new ingest, no credential surface, no money/auth path.

### Widened: Sprint 2, Story 2.3
Benchmark context lines become **DORA-2025 · LinearB 2026 · DX Core 4 · Steps of AI Adoption
(Cherny, 2026-07-16)**. Same cite-and-link-never-republish rule, unchanged acceptance shape.

### Widened: E3 v1 boundary
**In (added):** the maturity lens as a section of the Pod Report, computed from git/PR-derived
evidence, with not-instrumented rows rendered honestly.
**Out (added, named so it can't creep):** maturity as a **standalone** shareable scorecard or
separate artifact type · cross-tenant maturity leaderboards or ranking · **any self-declared or
questionnaire-sourced criterion** · telemetry/OTel ingestion to close the not-instrumented rows
(that is medusa-bonsai's guardrail work — see the split; when it lands, rows flip from
not-instrumented to computed with **zero** change to this lens's contract, which is the point of
building it this way) · scoring golden-beans' own repo as a *sold* artifact in v1 (gb is tenant #0
and dogfoods it internally; the sold artifact is mb's).

### Unchanged
E3's sprint count, story count elsewhere, risk profile (still 2 HIGH: 3.1 share links, 3.3 launch —
both Daniel-merged), kill-switch decision (`REPORT_SHARES_ENABLED`, ships dark), build order (#3,
after E1/E2), and the `~/dobby/medusa-bonsai` checkout requirement at Sprint 2 build time.

## The split — where the rest of the source seed goes

The source seed's other two thirds are **not** golden-beans product and must not be rehomed here.

**A · Stays in medusa-bonsai (area 09) — guardrails on our own rung, build on their own schedule.**
These are the seed's plan items 2, 5, 6, 7 plus the OTel gap:
- **Credentialed browser smoke in CI** — the re-benchmark correctly reframed this as an *unfinished
  step-2 guardrail*, not a step-3 reach. Highest priority of the four; converts the standing
  owed-smoke ledger into gate coverage.
- **Automatic security review** — verified repo-wide 2026-07-20: outside the source seed and the
  reference itself, the phrase appears in medusa-bonsai exactly once, as a *manual* requirement in
  one epic's cross-cutting risks (`07-agentic-and-federated-commerce/custom-domain-checkout` —
  "requires a security review in the build", for the open-redirect surface). That is an ad-hoc
  human step on one epic, not a gate. `cross-review.mjs` is advisory and single-pass by design and
  does not count either. **No automatic security review exists** — genuinely unclaimed, and the
  ladder lists it separately from code review at both step 2 and step 3.
- **One proactive monitor** ("let Claude kick off Claude") — narrow: the daily prod-smoke output
  opens a seed or a draft PR instead of emailing Daniel. Draft-only, never auto-merge.
- **OTel / analytics export** — a *step-1* guardrail we skipped. Dual value: it is the only thing
  that flips this lens's not-instrumented rows to computed. Name it as such in the mb seed so the
  dependency is legible in both directions.

**B · Comes to golden-beans** — this document.

**C · Goes to the `ways-of-work` plugin (`dobby-foundation`, mb area 09, scaffolded/ready)** —
`prose-draft` port (seed plan item 1) + the wakeup-resilient orchestration note (item 3). Process
distribution, neither product. Every `~/dobby/` sibling inherits it from one versioned place.

**Not rehomed, kept as evidence:** the Codex/Sol controlled-trial log stays in the mb seed as a
recorded orchestration shape. Its own "out of scope" line (does not change the standing
Claude-family policy) stands.

## QA / smoke (Stage 8b)

- **api spec (story 2.4):** maturity-section determinism · every `met` row has a resolvable evidence
  pointer · the low-maturity fixture scores low · not-instrumented count present on the investor
  lens · citation field non-empty.
- **Pure-logic seam:** put the criterion-scoring functions in a zero-import `lib/` file (LEARNINGS:
  a unit-tested pure helper can't share a file with framework-only imports). Free coverage, and it
  is where the fixture test lives.
- **Owed to Daniel by name:** read the rendered maturity section cold and check the verdict against
  your own judgement of where the pod actually sits. If the lens says step 3 and you'd say step 2,
  the lens is wrong — that disagreement is the acceptance test no spec can write. Fold into the
  existing Sprint 2 numbers spot-check, same sitting.

## Open risks

- **The lens grades its own author.** golden-beans is built by the pod it scores. A criterion set
  chosen by that pod will flatter it. Mitigation is structural, not procedural: criteria are lifted
  verbatim from the published ladder's own columns (no golden-beans-invented criteria in v1), and
  the fixture-repo spec proves the scale discriminates.
- **Over-claiming from thin evidence.** A `Co-Authored-By` trailer ratio is a proxy, not proof, for
  "Claude writes most of the code." Every derived row must state its proxy in the artifact, the same
  way the story-point caveat is already stated on the page.
- **Ladder drift.** A published ladder can be revised. Version-pin the reference (title + author +
  date) in the artifact so an old report stays interpretable against the ladder it scored.
- **Scope gravity toward a standalone product.** The out-list above exists because "maturity
  scorecard" is a seductive standalone SKU. In v1 it is a section. Revisit only with a real second
  buyer, not an internal hunch.
- **E3 slip.** This rides E3 entirely. If E3 moves, this moves; it never builds standalone. Accepted
  deliberately — it is the cost of the light path.

## Definition of Ready

- [x] Mirror-back confirmed; three forks decided by Daniel (2026-07-20: split three ways · amend E3
      v1 rather than seed E7 · git/PR-derived evidence with gaps rendered as gaps).
- [x] Stage-2.5 bucket named — **light enhancement** on a scaffolded-not-started epic; the expensive
      standalone framing explicitly refused.
- [x] Overlap checked against `Roadmap/README.md` + `BUILD-ORDER.md`: no gb epic claims maturity
      assessment; E3 is the only report-rendering surface and it is unbuilt.
- [x] Reuse list produced (8 rows, all E3/landing primitives — zero new architecture).
- [x] v1 in/out boundary written, including the four named out-of-scope additions to E3.
- [x] Source material verified in both checkouts; the reference-hygiene defect found and given a
      build action.
- [x] Story risk-tiered (LOW); QA stage named; smoke owner identified (Daniel, folded into the
      existing Sprint 2 spot-check).
- [x] **Daniel approved this amendment (2026-07-20)** → applied: the edits to
      `seeds/pod-report.md`, `02-commercial/pod-report/README.md` and `sprint-2.md`; flip this
      seed to `status: scaffolded`; narrow the mb seed to part A; file part C against
      `dobby-foundation`; run `node scripts/build-order.mjs` (the funnel count changes when this
      seed leaves it — no epic is added or removed).
