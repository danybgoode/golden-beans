---
title: "E3 — Pod Report + Roadmap Hub: benchmarks/ROI + live roadmap-vs-end-state views"
slug: pod-report
status: scaffolded
area: "02"
type: feature
priority: "#3"
risk: high
epic: "02-commercial/pod-report"
build_order: "#3"
updated: 2026-07-15
---

# Scope — E3 Pod Report + Roadmap Hub (the rendering primitive)

## Mirror-back
> Build the **cost-center→revenue-engine sales artifact** (velocity/throughput/cycle/lead/DORA/
> cost-per-shipped-point — human baseline vs agent-augmented pod — layered with the outcome metrics
> the engine produces) **and** the surface Daniel actually asked for when describing why we plan
> top-down: a **live Roadmap Hub** — where we are vs where we're heading, shown *against the desired
> end-state*, at every grain (portfolio → epic → sprint), beautiful enough to share with clients and
> investors, synced from the docs that are already the SSOT. One epic because both are the same
> primitive: **report-rendering in the engine** (decision gate resolved YES, below). Groomed
> single-session (Fable cadence); forks decided 2026-07-15.

## Classification
**Feature / Builder** (rendering primitive + external share surface, full DoD), with a Grower
signal: the hub dogfoods the engine on itself — report/hub views are tracked as engine events, and
acceptance for launch includes one real external audience (client or investor) viewing a live
share link.

## Stage-2.5 bucket: genuinely new, with heavy reuse
No rendering primitive or report surface exists in golden-beans (`apps/web` renders live
dashboards, not versioned artifacts; nothing is externally shareable). Not already-possible, not a
light enhancement. The **already-possible slice was carved off during this groom as funnel
bookkeeping**: Notion visibility via the existing `scripts/roadmap-to-notion.mjs --sync` (wired
2026-07-15; area-label hardcode fixed same pass) — the ops projection Notion board is NOT this
epic. This epic is the *product* surface.

## Decisions locked (Daniel, 2026-07-15 groom session)
1. **Decision gate resolved: report-rendering becomes an engine primitive** (tenant-facing rendered
   artifacts), closing the gate named at the 2026-07-14 session. Grounds: two consumers exist at
   birth (Pod Report + Roadmap Hub); client/investor-shareable views can't be "here's my Notion";
   SmallDocs license/fork posture weighs against coupling the commercial product to it (recorded
   2026-07-14); rendered views stay MCP-queryable too (BYO-agent stance). ReportHub-as-Notion
   **stays in medusa-bonsai** (their build #5) — E3 lifts its projection-rail patterns, never
   absorbs it.
2. **Roadmap Hub lands inside E3 and builds at its turn** (#3, after E1/E2 — re-affirms no E1↔E3
   swap; no pods sales conversation is waiting). Interim roadmap visibility = the Notion projection
   (bookkeeping, this session), superseded as the *presentation* surface when the hub ships.
3. **Notion wired now as bookkeeping, not epic scope.** gb's own Notion DB + `NOTION_TOKEN`/
   `NOTION_DB_ID`, same one-way docs→board contract as mb. Stays alive after E3 as the ops
   projection; the hub is the human/external surface.
4. **Share model: tokenized revocable share links, ships dark.** Per-audience scoped views
   (investor · client · team), opaque token in the path (lift of E1's connector-token pattern),
   behind a `REPORT_SHARES_ENABLED` enablement gate (OFF until deliberately flipped). Row-delete =
   instant revoke. Auth-only and fully-public models rejected (too heavy for a glance-at-a-link
   investor / too open while pods sales are early).

## Research (verified 2026-07-15, cited)
- **DORA 2025 = "State of AI-assisted Software Development"** ([dora.dev](https://dora.dev/dora-report-2025/),
  [Google Cloud](https://cloud.google.com/resources/content/2025-dora-ai-assisted-software-development-report)):
  the four keys are now five — deployment frequency, lead time for changes, change failure rate,
  **failed deployment recovery time** (the MTTR rename), plus **rework rate**. Headline finding:
  AI adoption correlates with **throughput ↑ AND instability ↑** (more change failures/rework)
  ([DevOps.com](https://devops.com/dora-2025-faster-but-are-we-any-better/),
  [Faros take](https://www.faros.ai/blog/key-takeaways-from-the-dora-report-2025)). **Direct scope
  consequence:** a credible agent-pod report MUST pair speed metrics with stability metrics
  (CFR + recovery + rework) — the report that only shows velocity is exactly the vendor-ware our
  audience smells. This is our honesty-as-aesthetic applied to data.
- **Benchmark sources for context lines:** [LinearB 2026 Software Engineering Benchmarks](https://linearb.io/resources/software-engineering-benchmarks-report)
  (8.1M+ PRs, 4,800+ orgs; 20 metrics incl. new AI metrics) · [DX Core 4](https://getdx.com/dx-core-4/)
  (speed/effectiveness/quality/business-impact; diffs-per-engineer; benchmarks from 500+ companies)
  · DORA quick-check performance levels. **Licensing posture: cite + link, render our own numbers
  against named external levels — never republish vendors' benchmark tables wholesale.**
- **Story-point caveat is real:** velocity/points are gameable and non-comparable across teams —
  the report frames cost-per-point as *within-dataset* (same team, human-baseline vs pod eras of
  the same repo), not cross-company. DORA/cycle metrics carry the cross-industry comparison.

## The Roadmap Hub — view design (the design thinking, made concrete)
**The device: every view is "current state vs desired end-state," never a backlog.** golden-beans
already invented this device — `references/landing-end-state.md`'s section↔epic map ("built
backwards from the end vision"). The hub generalizes it: a project's **end-state registry**
(named destinations, each tagged by the epic that lights it up) + the live status projection =
"here's the destination, here's where we are on the road, here's what lights up next."

**Grains (drill-down, each a view):**
| Grain | View | The one question it answers |
|---|---|---|
| Portfolio | **Horizon** — end-state destinations as cards, each showing % lit and the epic that lights it | "What does *done* look like, and how much of it is real today?" |
| Initiative (macro-section) | **Journey** — the build order as a path (E1→E6), a "you are here" marker, shipped behind / next ahead | "Where are we on the road?" |
| Epic | **Drill-down** — sprints + stories, ✅ ticks, risk tiers, commit-fresh status | "What's inside the thing being built now?" |
| Sprint/Story | rows inside the drill-down (no separate page in v1) | "What ships next?" |
| Funnel | seeds rendered as "on the horizon" (deliberately hazy — un-groomed ≠ promised) | "What's coming after?" |

**Audience scoping (one dataset, three lenses):** *team* = everything · *client* = their pod's
journey + their Pod Report (never other tenants' data) · *investor* = portfolio horizon + momentum
(shipped cadence, TARS/North-Star movement), no per-story internals. Scope lives in the share
token, enforced server-side.

**"Real-time," honestly:** the SSOT is the Roadmap docs in git. The hub re-projects **on every
merge to `main`** (CI step pushes the extract JSON) + on demand — and displays its own data
freshness ("as of merge `abc123`, 2h ago") as a design element. No websockets theater; merge
cadence *is* the truth cadence.

**Design language:** `references/design-direction.md` (roastery world · agent-window frame device ·
kraft/foil + dark-roast + brass) extends to the hub — the journey view is a natural fit for the
frame device (the roadmap as something your agent narrates). Honesty badges (✅/🔜/hazy-horizon)
are design elements. frontend-design heuristics (mb skill) apply as the quality rail. **Not** the
plain generated-board aesthetic — that's what Notion is for.

**Data rail (multi-tenant from birth):** the hub renders whatever a tenant pushes as roadmap/report
data — golden-beans pushes its own extract (tenant #0), miyagisanchez pushes theirs (client #1,
104-epic dataset). The **client pushes** (same shape as Panel adjudication #1 for S2): a
`roadmap-push` command POSTs the extract JSON via the tenant's API key. No engine-side git access,
no bespoke coupling.

## What already exists (reuse, don't rebuild)
| Capability | Where | Reuse for |
|---|---|---|
| Roadmap extractor (epic/sprint/seed rows + status derivation + kickoffs) | `scripts/roadmap-to-notion.mjs --extract` (area-label fix 2026-07-15) | The push payload IS this JSON — the extract schema is the contract |
| mb reporthub projection rail (`pmo-report.mjs` metrics, `reports-data.json` generator) | medusa-bonsai (build #5 there) | Pattern lift for delivery-metrics computation — **mb repo checkout required at E3 build time** (not mounted at groom) |
| Dogfood dataset: 104 epics, 97 shipped, dated frontmatter + git history | medusa-bonsai Roadmap + git log | The Pod Report's computed (not claimed) numbers — human-baseline vs pod eras of the same repo |
| Landing end-state section↔epic registry | `references/landing-end-state.md` + E1 story 1.4 registry file | The end-state-registry device, generalized into the horizon view |
| Funnel/impact/experiments pages + own Supabase | `apps/web/app/*` | Rendering home (`/app/reports/…`) + outcome-layer queries (TARS, North Star, A/B) |
| Tokenized opaque-credential-in-path + revocation | E1 story 2.1 connector tokens (build pending) | Share-token model — one credential taxonomy with E2's `api_keys` (scoped rows), not a third system |
| Enablement env-gate precedent (`CONNECTOR_ENABLED`, `SIGNUP_ENABLED`) | E1 6b / E2 6b | `REPORT_SHARES_ENABLED`, same seam shape |
| Append-only per-event financial ledger pattern | mb `profit-analyzer` | Cost-per-point inputs (snapshot cost model at computation time, never retro-mutated) |
| Design direction + heuristics rail | `references/design-direction.md`, mb `frontend-design` skill | Hub + report visual language |
| Cross-tenant-403 realistic-input lesson | LEARNINGS → Review quality (S4) | Share-scope specs use a real foreign tenant/token, not a made-up one |

**Dependency:** builds after E2 (#3 in order; wants E1's section registry + connector-token pattern
and E2's auth boundary for team views). If E2 slips, Sprint 1 can path-gate internally the way
`/app` does today; only Sprint 3 hard-needs the credential taxonomy.

## v1 boundary
**In:** report-rendering primitive (versioned, immutable report artifacts rendered by the engine,
tenant-scoped) · roadmap-push rail (extract JSON via tenant API key + CI step on merge) · Roadmap
Hub views: horizon · journey · epic drill-down · funnel-haze, with freshness stamp · audience
scoping (team/client/investor) enforced server-side · Pod Report v1: velocity, throughput,
cycle/lead time, DORA five (incl. rework), cost-per-shipped-point — human-baseline vs pod eras
computed from the mb dataset · outcome layer (TARS adoption, North-Star movement, revenue-per-
feature from engine data) · benchmark context lines (DORA/LinearB/DX, cited not republished) ·
tokenized share links, dark behind `REPORT_SHARES_ENABLED` · landing §5 backfill (teaser → live) ·
hub dogfoods itself (views tracked as engine events).
**Out (named, not creep):** custom report-builder UI · PDF/export polish · cross-company benchmark
republishing · real-time websockets (merge cadence is the honest truth cadence) · Notion two-way
sync (one-way ops projection stays) · SmallDocs coupling · significance stats · billing ·
engine-side git/repo access (clients push) · non-roadmap report types (the primitive allows them;
v1 ships these two).

## Slicing (skateboard → car) — 3 sprints, ~3 stories each

### Sprint 1 — The rendering primitive + hub skateboard (internal)
| Story | Ships | Risk |
|---|---|---|
| 1.1 As a tenant I want to push my roadmap projection (extract-schema JSON via my API key) and have it stored as a **versioned report artifact**, so the engine renders from data I control. Ships `report_artifacts` (additive table, immutable versions) + `roadmap-push` command + CI step for gb's own repo. Acceptance: push → new version queryable; malformed → 4xx; foreign key can't read it. | data rail + artifact store | LOW |
| 1.2 As a team member I want the hub's **journey + epic drill-down** views rendering gb's own pushed roadmap (tenant #0) with a freshness stamp, so "where are we" is a page, not a doc dive. Acceptance: views render latest artifact; stamp shows source commit + age; matches BUILD-ORDER content. | hub skateboard | LOW |
| 1.3 As a stakeholder I want the **horizon view** — end-state destinations (from the generalized section↔epic registry) each showing what's lit vs coming — so progress reads against the destination, not a backlog. Acceptance: every destination shows its lighting epic + honest badge; nothing claims ✅ unshipped (poster rule). | horizon view | LOW |

### Sprint 2 — The Pod Report (computed, not claimed)
| Story | Ships | Risk |
|---|---|---|
| 2.1 As the pods pitch I want delivery metrics computed from the mb dataset (velocity, throughput, cycle/lead, DORA five incl. rework, cost-per-shipped-point; human-baseline era vs pod era of the same repo) pushed as a report artifact, so every number is reproducible. Pattern-lifts mb `pmo-report.mjs`; **requires mb checkout at build**. Cost model declared as data (rates/token costs snapshotted, ledger-style). Acceptance: rerun ⇒ identical artifact from same inputs; a hand-computed sample matches. | metrics computation | LOW |
| 2.2 As a decision-maker I want the outcome layer joined in (TARS adoption, North-Star movement, revenue-per-feature — engine-queried, Medusa-truth boundary respected), so the report says "shipped *and it mattered*". Acceptance: outcome rows trace to engine queries; no commerce replica. | outcome layer | LOW |
| 2.3 As the brand I want the report rendered in the design language with **speed and stability paired** (DORA-2025 honesty: CFR/recovery/rework beside velocity) + benchmark context lines (cited, linked), so it survives a skeptical PM. Acceptance: heuristics checklist run; every external number carries its source; the story-point caveat is on the page. | report surface + design pass | LOW |

### Sprint 3 — Share links + backfill (the flip)
| Story | Ships | Risk |
|---|---|---|
| 3.1 As Daniel I want scoped share links (team/client/investor lenses; opaque revocable token in path; `REPORT_SHARES_ENABLED` gate, ships **dark**) so externals glance at a link, never an account. One credential taxonomy with E2 `api_keys` (scoped rows). Acceptance: each lens shows only its scope (spec uses a real foreign tenant); revoked token → 401 instantly; gate OFF → routes 404. | share surface | **HIGH — Daniel merges** (public read of internal data + credential surface) |
| 3.2 As the landing I want §5 flipped teaser → live Pod Report section (backfill contract) and the hub dogfooding itself (view events tracked in the engine), so we sell what we use. Acceptance: §5 renders real report output via the section registry; hub views appear in gb's own funnel. | §5 backfill + dogfood | LOW |
| 3.3 As Daniel I want the launch: flip `REPORT_SHARES_ENABLED`, mint the first real investor + client links, verify revocation, announce. Acceptance: flip recorded; one real external audience viewed a live link; revoke-confirm-dead executed. | launch | **HIGH — Daniel flips/merges** |

## Stage 6b — kill-switch decision (`risk: high`)
Runtime seam exists → **enablement (dark-launch) gate as part of story 3.1**:
- **Gate:** `REPORT_SHARES_ENABLED` env check at every share route (house seam: env gate + redeploy,
  precedent `CONNECTOR_ENABLED`/`SIGNUP_ENABLED`). **Polarity:** enablement — ships dark/**OFF**,
  flipped deliberately at 3.3.
- **Fine-grained kill:** revoking a share-token row cuts one audience instantly, no deploy.
- **Carve-out:** internal hub views (Sprints 1–2) sit behind the team boundary (E2 auth or interim
  path-gate) — no flag; rollback = revert on `main`. All migrations additive.

## QA / smoke (Stage 8b owners)
Per story one Playwright api spec: foreign-tenant 403 on artifact reads (real foreign key, S4
lesson) · share-lens scope assertions (investor lens must NOT return story internals) · revoked
share token 401 · gate-OFF 404 · artifact immutability/version determinism · push validation 4xx.
Sprint-end fool-proof walkthroughs in each `sprint-N.md`, real URLs. **Owed to Daniel by name:**
S1 hub smoke (push → views match BUILD-ORDER) · S2 numbers spot-check (hand-verify one epic's
cycle time + cost-per-point against the raw mb history) · S3 share smoke in a fresh incognito
session (open each lens → revoke → confirm dead) + the production flip.

## Open risks
- **mb repo access at build time:** the dogfood computation reads medusa-bonsai's frontmatter +
  git history; not mounted at groom (facts taken from SCOPE.md's record). Build session must run
  where `~/dobby/medusa-bonsai` is checked out — named setup step in the S2 kickoff.
- **Metric honesty is the product:** gameable velocity, story-point non-comparability, and the
  DORA-2025 speed-vs-instability finding are *displayed caveats*, not fine print — the audience is
  PMs who smell vendor-ware (same guardrail as the landing).
- **Investor/client leakage via share links:** lens enforcement is server-side and spec'd with real
  foreign inputs; no cross-tenant data on any lens; links are revocable rows + a global gate.
- **Extractor schema drift (gb vs mb copies):** gb's `--extract` JSON is the push contract; mb's
  copy has diverged before (area-label hardcode). Contract-pin: version field in the payload,
  validate on ingest.
- **Benchmark citation licensing:** cite + link only; re-verify each source's terms at build.
- **E1/E2 slip:** Sprint 1 degrades to path-gated internal views; Sprint 3 hard-needs the E2
  credential taxonomy — resequence only if E2 slips badly (recorded, not expected).

## Definition of Ready
- [x] Mirror-back confirmed; 4 forks decided by Daniel (2026-07-15: decision gate YES · hub inside
      E3 at its turn, no E1↔E3 swap · Notion wired now as bookkeeping · tokenized dark share links).
- [x] Stage-2.5 bucket named (genuinely new; the already-possible Notion slice carved off to
      bookkeeping, done this session); overlap checked (mb reporthub stays in mb — pattern lift only).
- [x] Reuse list produced; research cited (DORA 2025 five-keys + AI throughput/instability ·
      LinearB 2026 · DX Core 4, all verified 2026-07-15); dogfood-dataset access constraint named.
- [x] v1 in/out boundary written; hub view design specified (grains · desired-state device ·
      audience lenses · honest freshness); stories risk-tiered (2 HIGH — Daniel merges 3.1/3.3).
- [x] Kill-switch decision recorded (`REPORT_SHARES_ENABLED` enablement gate, ships OFF; per-token
      revocation; internal-views carve-out).
- [x] **Daniel approved this scope doc (2026-07-15)** → scaffolded `02-commercial/pod-report/`
      (sprints 1–3), kickoffs emitted, BUILD-ORDER regenerated. Builds after E1/E2 per the
      dependency note. Cross-panel offered and declined (E2 precedent).
