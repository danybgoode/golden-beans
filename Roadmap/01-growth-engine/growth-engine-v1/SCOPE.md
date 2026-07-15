---
title: "Golden Beans — Unified Growth Engine (standalone) + the dobby-foundation extraction"
slug: golden-beans-growth-engine
status: shipped
area: "09 · Platform & Infra"   # S0 lives here; the engine epic lives in golden-beans' own Roadmap
type: feature                   # one epic, two workstreams (S0 foundation is a chore-shaped enabler)
archetype: Builder              # S0: Maintainer
priority: null
risk: low                       # no money/auth/commerce paths; shared-surface stories flagged below
epic: "09-platform-infra/dobby-foundation"   # S0 workstream; engine epic scaffolds in golden-beans/Roadmap after S0.4
build_order: null
updated: 2026-07-11   # re-groomed: flag-reality correction + commercial frame (see Decisions 2026-07-11)
prd: "../../../references/prd-growth-engine.md"
prd_addendum: "../../../references/prd-g-chaos-secops.md"   # PRD-G: chaos + SecOps — deferred to v2, see Addendum section
---

# Scope — Golden Beans: Unified Growth Engine + portable ways-of-work

> **Relocated 2026-07-14** from `medusa-bonsai/Roadmap/00-ideas/2. readyforscope/golden-beans-growth-engine.md`
> (a stub pointer remains there). This is the canonical groomed scope for the shipped
> `growth-engine-v1` epic **and** the source of the named follow-on epics E1–E6.

## Mirror-back
> Build the **Unified Growth Engine** (PRD: flags + A/B + telemetry routing + North Star/TARS
> dashboards) as a **standalone project, maintained on its own** — and use it as the forcing function
> to **extract our ways of work** (groom, skills, scaffolds, WAYS-OF-WORKING, CI patterns) into a
> foundation any future isolated project spawns from. Design notes in the PRD are ignored per Daniel.

## Decisions locked (Daniel, 2026-07-03)
1. **Telemetry-first v1** — the engine does NOT serve flags in v1. Miyagi keeps `platform_flags` +
   `isEnabled()` (shipped 2026-07-01). Flag-serving + migration is a later epic, only once the engine
   is proven. (PRD Module B's sub-ms gateway is explicitly OUT of v1.)
2. **Miyagi is the first consumer** — acceptance = a real Miyagi feature instrumented, a real TARS
   funnel rendered from live traffic.
3. **Sibling repo + parent workspace** — `~/dobby/` is the workspace: `medusa-bonsai/`,
   `golden-beans/`, and `dobby-foundation/` as independent sibling repos.
4. **Plugin marketplace + template** — `dobby-foundation` carries (a) a Claude Code **plugin
   marketplace** distributing the living skills to every project, and (b) a **project template**
   skeleton new projects copy once.

## Decisions locked (Daniel, 2026-07-11 re-groom)
Re-groomed because (a) the original grooming assumed doc flag states that were wrong (see
*Flag-reality correction* below), and (b) the product frame grew: golden beans is now aimed at being
a **standalone commercial product** (PostHog as the quality bar) sold as **AI development pods**
(Globant/Anthropic model, [announced 2026-06-30](https://www.globant.com/news/globant-anthropic-alliance-claude-ai-pods)),
with miyagisanchez as client #1. Decisions 1–4 above stand. New:

5. **Engine first, commercial next.** S0–S4 remain v1 (amended below for flag reality + new reuse).
   The commercial layer — landing + waitlist, multi-tenant activation, pods/benchmarks report,
   signals loop, CMS integration — lands as **named, ordered follow-on epics** in golden-beans' own
   Roadmap (see *Follow-on epics*). Proof before pitch.
6. **CMS: integrate, don't own.** Golden beans exposes flag/experiment/cohort/telemetry primitives
   any CMS consumes via SDK/MCP; content storage is not engine scope. Miyagi keeps
   `content.overrides_enabled` admin-content and becomes the **reference integration**. A
   Payload-based CMS module is a **v2 spike** (Payload: MIT, Next.js-native, Figma-owned since
   2026-04; open-source + self-host publicly committed, Payload Cloud paused signups — roadmap-capture
   risk noted, self-hosting mitigates). Payload as golden-beans' own UI shell: rejected for now
   (couples the core product surface to Figma's roadmap).
7. **Headline operate route = tokenized connector URL.** Landing leads with "copy your unique MCP
   URL → *Add to Claude*" (`claude.ai/new?modal=add-custom-connector` deep-link; works on Claude free
   tier) — a direct reuse of the shipped `seller-agent-connect-mcp-url` pattern (opaque revocable
   credential in the path). Second: Cowork/Claude Code plugin (the full pods experience). Third:
   `npx` wizard for engineers. **SDK/npx instrumentation of the customer's app is orthogonal and
   always required** — it's how data gets in; the connector is how humans + their agents operate the
   engine. BYO-agent stays the stance: no integrated AI.
8. **Tenancy: design multi-tenant, run single.** From S1.1 the schema + tokens are tenant-scoped
   (`projectId` first-class, per-project credentials), but v1 runs one tenant (miyagisanchez), no
   self-serve signup; hand-provisioned pilot tenants are allowed for early pod trials. Auth
   hardening + self-serve signup stay a follow-on epic, built against a real consumer.

## Flag-reality correction (2026-07-11) — the chain effect
The 2026-07-03 grooming assumed the poster's flag claims. Reality (per Daniel): **every platform
flag is ON in production except `shipping.envia_enabled`** — many features documented "dark/default
OFF" have been live. Poster corrected 2026-07-11 (dated snapshot note + per-bullet fixes).
Consequences absorbed into scope:
- **S2's feature registry must seed from LIVE `platform_flags` rows (prod state), not `lib/flags.ts`
  code defaults** — code defaults are fail-safe fallbacks and systematically say OFF. Seeding from
  defaults would make every "Targeted" denominator lie — the exact class of drift that forced this
  re-groom. (Amended in S2 below.)
- **Golden beans is itself the structural fix for this drift class:** runtime flag state becomes a
  *displayed, queryable* surface (registry + funnel) instead of prose in docs. Worth one line on the
  landing page someday; recorded here so the positioning isn't rediscovered.
- **S1.3's instrumented feature can now be any live feature.** Proposed candidate:
  `onboarding.three_doors_enabled` (natural TARS story — Targeted: new sellers hitting first-run ·
  Adopted: completed a door · Retained: published listing/first share), with the setup-guide's
  existing GTM `dataLayer` events as a second, nearly-free source. Final pick at S1.3 build time.

## Product frame (2026-07-11): the PostHog bar, differentiators, pods GTM
Verified against posthog.com (+ docs/handbook), 2026-07-11:
- **PostHog today:** product/web analytics, session replay, error tracking, logs, feature flags,
  experiments/no-code A/B, surveys, data warehouse + CDP (120+ sources), workflows, endpoints/API,
  AI evals + AI observability, PostHog AI assistant, and **PostHog Code** (spring 2026): production
  signals → auto-diagnosed tasks → agent-generated PRs. Usage-based pricing, generous free tier.
- **They have NO chaos-engineering / DevSecOps product.** PRD-G (Modules E+F) remains a genuine
  differentiator — sequencing unchanged (v2, after flag-serving migration).
- **Steal from them:** the **closed signal loop** shape (error/friction signals → structured tasks →
  fixes) and error tracking with product context — slotted as follow-on epic E4, *ending in the
  customer's own agent over MCP* rather than an integrated agent. That inversion (their loop ends in
  their agent; ours ends in yours) is the crispest statement of our BYO-agent differentiator.
- **Persona & pitch:** elevate PMs → technical PMs; convert the product-development team from cost
  center to revenue engine. Quantified via standard metrics decision-makers already use — velocity
  (points/sprint), throughput (stories/epics per period), cycle + lead time, DORA (deploy frequency,
  change lead time, change-failure rate, MTTR), cost per shipped point — human-only baseline vs
  agent-augmented pod — layered with outcome metrics the engine itself produces (TARS adoption,
  North-Star input movement, revenue per feature). This is follow-on epic E3, and **medusa-bonsai is
  the dogfood dataset** (104 epics, 97 shipped, all dated in Roadmap frontmatter + git history — the
  case-study numbers are computable, not claimed).
- **UI bar:** PostHog-grade usability/beauty is the aspiration for the engine's UI surfaces (original
  "PRD design notes ignored" stands; this is a bar, not a spec).

## Stage-2.5 bucket
- **Engine core (TARS · North Star · A/B bucketing · unified `/v1/track` · SDK): genuinely new.**
  Nothing in the portfolio does this.
- **Flag serving: already possible** — in-house flags shipped 2026-07-01 (`platform_flags`, fail-open
  60 s cache, `/admin/flags`, audited). Rebuilding it would be the third flag backend in a month → OUT.
- **Vendor telemetry fanout: partially exists** — GTM (GA4 + Clarity) is live site-wide on Miyagi.
  PRD Module C's broker (Pub/Sub, retries, GA fanout) is deferred until a real second sink demands it.
- **Foundation extraction: light-enhancement whose trigger has fired** — the skills-library spike
  (2026-07-02) decided "stay repo-checked-in; **revisit when a second repo needs to selectively
  install a subset**." Golden-beans is that second repo.

## Research (verified 2026-07-03)
- Claude Code **plugins** bundle skills/commands/agents/MCPs; a **marketplace** is just a git repo
  with `.claude-plugin/marketplace.json`; consumers run `/plugin marketplace add <org>/<repo>` then
  `/plugin install <plugin>@<marketplace>`. Updates flow from the one repo — no per-project forks.
  Source: [code.claude.com/docs/en/plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
- This matches the house wiring decided in `spike-skills-library-audit.md` (script does the work ·
  skill wraps it · routine triggers it) — the plugin is the distribution layer on top, nothing rewires.

## The workspace shape (the education Daniel asked for)
Heuristics that survive contact with agentic + classic workspace practice:
- **One parent folder, independent sibling repos.** `~/dobby/` is the spawn point. Never nest a
  standalone product inside another product's monorepo — a monorepo is for things that *deploy and
  version together* (Miyagi FE+BE qualify; golden-beans doesn't).
- **Share by versioned distribution, not by path.** Cross-repo relative paths and copy-paste both rot.
  Skills reach projects via the marketplace (pull-based, versioned); the skeleton reaches them via the
  template (copy once, then it's yours). A groom improvement lands in `dobby-foundation` and every
  project picks it up.
- **Separate the universal from the project-specific.** WAYS-OF-WORKING (cadence, DoR/DoD, risk
  tiers, QA gate, gitflow) generalizes. The AGENTS five rules (Medusa-first, Supabase, UCP/MCP,
  Clerk, es-MX) are Miyagi's — the template ships an `AGENTS.md` **skeleton with a per-project rules
  slot**, not Miyagi's rules.
- **Each project owns its Roadmap.** golden-beans gets its own `Roadmap/` from the template; its epic
  docs live there, not in medusa-bonsai. (This scope doc lives here because the funnel is here today.)

```
~/dobby/
├── dobby-foundation/          ← marketplace (.claude-plugin/marketplace.json + plugins/ways-of-work/)
│   └── template/              ← Roadmap skeleton · WAYS-OF-WORKING (generalized) · AGENTS skeleton
│                                · CI workflows · scripts (build-order, cross-review) · e2e harness
├── medusa-bonsai/             ← consumes the marketplace; keeps its Miyagi-specific rules
└── golden-beans/              ← spawned from template; consumes the marketplace
```

## What already exists (reuse, don't rebuild)
| Capability | Where | Reuse for |
|---|---|---|
| Skills: `groom`, `doc-hygiene`, `standup-post`, `weekly-recap`, `babysit-pr`, `build-order-sync`, `vercel-prune`, **`live-smoke` (added since 2026-07-03 — re-inventory `skills/` at S0.1 build time)** | `skills/` (medusa-bonsai) | Move into the `ways-of-work` plugin; consumed back via marketplace |
| Vendored Stripe skills pattern | `.agents/skills/*` + symlinks | Stays as-is — vendored ≠ repo-original (spike §4) |
| Scaffolder + templates | `skills/groom/scaffold-epic.mjs` + `templates/` | Ships inside the groom skill in the plugin |
| `build-order.mjs`, `cross-review.mjs`, `cross-panel.mjs`, routine prompts, `.githooks` | `scripts/` | Template `scripts/` (portable — they read Roadmap frontmatter, not Miyagi code) |
| WAYS-OF-WORKING, LEARNINGS structure, SESSION-KICKOFFS, 00-ideas funnel + BUILD-ORDER guard | `Roadmap/` | Generalized into the template skeleton |
| CI gates (tsc + build + Playwright api; build-order-guard) | `.github/workflows/` | Template CI |
| Flag definitions + `isEnabled()` seam + `/admin/flags` | `platform_flags` (Supabase) + `lib/flags.ts` | Engine **reads** flag defs (read-only) as its feature registry seed; kill-switch home for S1.3 |
| Deploy rails: Vercel (FE), Cloud Run us-east4 pattern, Telegram notify | infra + `lib/telegram.ts` | golden-beans v1 = Next.js on Vercel + its **own** Supabase project (Pub/Sub/Redis deferred) |
| Playwright harness (api project) | `apps/miyagisanchez/e2e/` | Template e2e harness; golden-beans dogfoods it |

**Reuse added at the 2026-07-11 re-groom (shipped since 2026-07-03):**
| Capability | Where | Reuse for |
|---|---|---|
| Tokenized MCP connector URL + "Agregar a Claude" deep-link (opaque revocable path credential) | `seller-agent-connect-mcp-url` epic (**ON in prod**) | The headline operate route (Decision 7) — pattern lift, not a rebuild |
| Runtime admin content + announcements (`content.overrides_enabled`) | `admin-content-and-announcements` epic | The **reference CMS integration** seam for Decision 6 (engine primitives powering content experiments) |
| Setup-guide GTM `dataLayer` events + three-doors onboarding funnel | `seller-portal-setup-guide` / `seller-portal-onboarding-three-doors` | S1.3 instrumentation candidates (see Flag-reality correction) |
| Staged bulk propose→confirm→apply MCP mutation pattern (agent-safe writes) | `catalog-management` epic | Shape for ANY engine mutation exposed as an MCP tool |
| Append-only per-event financial ledger (snapshot at event time) | `profit-analyzer` epic | Pattern prior for S3 North-Star revenue inputs + E3 cost-per-point math |
| `/admin/flags` audited flag dashboard reading live `platform_flags` rows | `feature-flags-inhouse` epic | S2 registry seeds from THIS (live rows), not code defaults |
| House deploy rail moved: FE = Cloud Run behind Cloudflare; Vercel = per-PR previews + CI only (2026-07-10) | `frontend-vercel-to-cloudrun` epic | Deploy-rail note below needs this delta |

**Deploy-rail note (delta):** the 2026-07-03 line "golden-beans v1 = Next.js on Vercel" predates the
Vercel exit. **Decided at the 2026-07-11 panel adjudication (#5): Vercel for golden-beans v1** —
Miyagi's exit was about prod-scale cost, which an internal tool with free previews doesn't have. The
template carries the deploy rail as a per-project variable (S0.3), never both rails. Revisit at E2
(multi-tenant scale) together with the Postgres-ingest write-load ceiling. New-infra-cost rule
applies: surface to Daniel before provisioning.

**Five-rule check:** engine is non-commerce and standalone — Medusa N/A, Clerk untouched, UCP N/A.
Supabase rule honored *per project* (engine gets its own project — see `db-egress-and-account-strategy`
for the account-strategy prior). Bilingual rule is Miyagi-scoped; golden-beans admin UI ships in one
language (English, internal tool) unless Daniel says otherwise.

## v1 boundary
**In:** the foundation extraction (S0) · schema-validated `POST /v1/track` → Postgres, **tenant-scoped
from day one** (`projectId` first-class + per-project credentials — Decision 8: design multi-tenant,
run single) · TS SDK (`track`, `trackAdoption`, deterministic bucketing) · feature registry with
retention windows, **seeded from live `platform_flags` rows** · TARS funnel view · North Star metric +
inputs + per-feature report · basic A/B variant comparison · one real Miyagi feature instrumented
behind a kill-switch.
**Out (named later epics, not creep — see Follow-on epics):** landing page + waitlist + connector
install page (E1) · self-serve signup + auth hardening + trials (E2) · pods/benchmarks report (E3) ·
error/signals loop (E4) · flag-serving gateway + Miyagi `isEnabled()` migration (E5a) · **PRD-G
Modules E + F** (chaos · SecOps · circuit breakers — E5b, see Addendum) · CMS integration spike,
Payload (E6) · Pub/Sub broker + GA4/vendor fanout · `triggerSatisfaction()` micro-surveys · p99 < 5 ms
SLO · Redis cache-aside · statistical-significance engine (basic lift only in v1) · all PRD
design/branding notes (per Daniel; PostHog-grade usability stays the bar).

## Follow-on epics (named + ordered, groomed one-per-session in golden-beans' own Roadmap after S4)
| # | Epic | One line | Depends on |
|---|---|---|---|
| E1 | Commercial shell | Landing (PostHog-bar UI) + waitlist signup + install page: connector-URL headline ("Add to Claude" deep-link), Cowork/Code plugin, npx wizard docs | S2 (something real to show) |
| E2 | Multi-tenant activation | Auth hardening · hand-provisioned → self-serve tenants · pod trials ("integrate this pod, give it to your PM") | E1 + the S1 tenant-scoped schema |
| E3 | Pod Report (benchmarks & ROI) | Velocity/throughput/cycle/lead/DORA + cost-per-point vs industry benchmarks; outcome layer from TARS/North-Star; **dogfood: computed from medusa-bonsai Roadmap frontmatter + git history** — the cost-center→revenue-engine sales artifact | S2–S3 |
| E4 | Signals loop (the PostHog steal, inverted) | Error/friction signals → structured tasks → **the customer's own agent** over MCP (no integrated AI) | S1 SDK envelope |
| E5 | a) Flag-serving migration → b) PRD-G chaos/SecOps + circuit breakers | Unchanged from Addendum; E5b risk callouts recorded there stand | S4, then a→b |
| E6 | CMS integration spike (Payload) | Integrate-don't-own proven against miyagi's admin-content as reference; Payload module go/no-go decision | E1/E2 |

Ordering is the default; re-sequence at each groom. E1↔E3 may swap if a pods sales conversation
needs the report before the landing.

## Panel adjudication (2026-07-11 — codex + antigravity, both lenses; Daniel approved, adjudication delegated)
Absorbed (small amendments, no re-slice):
1. **S2 cross-project seeding is real** (both panels): golden-beans' own Supabase can't read Miyagi's
   `platform_flags` table. **Adjudicated: the client PUSHES** — SDK `syncFeatures()` / a one-command
   seed run from Miyagi POSTing its live flag rows to the engine. Keeps the engine client-agnostic
   (every future tenant can push; no bespoke Miyagi API coupling, no cross-DB creds). Registry sync
   stays a command, not a product; funnel labels Targeted as registry-declared. (S2 amended.)
2. **S3 revenue truth lives in Medusa** (codex-purist): North-Star revenue inputs for Miyagi read
   Medusa-owned order/payment surfaces; the engine stores attribution telemetry + derived reports
   only — never a commerce replica. (S3 amended.)
3. **S4 is NOT flag serving** (vs antigravity-pragmatist's blocking claim — rejected as overstated,
   clarified instead): deterministic hash bucketing computes a variant **client-side with no lookup
   and no resolve endpoint**; on/off gating stays with the client's own flags (`isEnabled()`).
   Decision 1 banned the serving gateway + migration, not local experiment assignment. (S4 amended.)
4. **F3 circuit-breaker flag WRITES must be backend-owned + allow-listed** (both purists): already in
   the Addendum's risk callouts; sharpened — money-path flag mutation is a Medusa/backend capability
   behind an explicit allow-list, never a generic engine write to a flag table. Also (codex-purist):
   once the connector operates commerce-adjacent experiments for Miyagi, Rule 3 applies — the UCP
   manifest/MCP surface must describe those controls accurately (recorded for E1/E5).
5. **Deploy rail decided: Vercel for golden-beans v1.** Miyagi left Vercel for prod-scale cost; an
   internal tool with free previews has none of that. The template carries the rail as a per-project
   variable (S0.3 already says so) — it never carries both. Revisit at E2 alongside the
   Postgres-write-load ceiling (antigravity-pragmatist's ClickHouse point — accepted as named v1
   debt with the same E2 revisit trigger).
6. **GTM-events-first check at S1 kickoff** (codex-pragmatist): before building the full SDK
   integration, check whether three-doors/setup-guide `dataLayer` events already yield
   Targeted/Adopted/Retained for the first funnel — the first consumer may be a light adapter; the
   SDK still ships (it's the product surface every other tenant uses).

Rejected:
- **"Defer S0 / spawn golden-beans minimal, extract later"** (codex-pragmatist): contradicts locked
  Decision 4 and the dogfood sequencing rationale ("spawned *from* the template or the foundation is
  fiction"); the marketplace/template is half the initiative's value, and Daniel confirmed the
  slicing. Kept: S0 strictly first.
- **"`checkout.stripe_enabled` in Supabase violates Rule 1"** (antigravity-purist): that flag is
  pre-existing, shipped app-layer kill-switch wiring — it gates the app seam, it doesn't replace
  Medusa's provider config, and this plan doesn't touch it in v1. The legitimate kernel (v2 flag
  writes) is item 4 above.

## Slicing (skateboard → car)

### S0 — dobby-foundation extraction *(epic docs: `09-platform-infra/dobby-foundation/` here)*
| Story | Ships | Risk |
|---|---|---|
| S0.1 As Daniel I want a `dobby-foundation` repo with a marketplace + `ways-of-work` plugin (skills moved in), so skills version once. Acceptance: `/plugin marketplace add` + `/plugin install` succeed in a scratch project; groom triggers. | marketplace + plugin | LOW |
| S0.2 As Daniel I want medusa-bonsai consuming the plugin (in-repo copies retired), so there's one source. Acceptance: a groom run here behaves identically post-switch. | consumption switch | LOW — **shared surface, announce** |
| S0.3 As Daniel I want a project template (Roadmap skeleton, generalized WAYS-OF-WORKING, AGENTS skeleton, CI, scripts, e2e harness), so new projects start operational. Acceptance: template contains no Miyagi-specific rule. | `template/` | LOW |
| S0.4 As Daniel I want `golden-beans` spawned from the template under `~/dobby/`, so the engine builds inside the system. Acceptance: groom + `build-order.mjs` + CI gate run green in the fresh repo. | the new repo | LOW |

### S1 — skateboard: events flow end-to-end *(this + later sprints: golden-beans' own Roadmap)*
| Story | Ships | Risk |
|---|---|---|
| S1.1 As a builder I want `POST /v1/track` rejecting malformed events (projectId/userId/event; featureId optional) and persisting to Postgres, so funnels stay accurate. Acceptance: bad payload → 4xx; good → row queryable. **Tenant-scoped by design (Decision 8):** `projectId` is first-class, auth is a per-project credential, and no query path can cross projects — run single-tenant, but the schema/token shape never needs a migration to go multi. **Forward-compat (PRD-G):** the event schema carries an extensible `tags`/`metadata` object from day one, so v2 friction/chaos tagging (F2) needs no migration. | ingest + store (own Supabase) | LOW |
| S1.2 As an app builder I want a TS SDK (`track`, `trackAdoption(featureKey)`) auto-appending context, so integration is minutes. Acceptance: fresh Next.js app fires an event with ≤5 lines. **Forward-compat (PRD-G):** any SDK resolve/config call returns an extensible **payload envelope** (not a bare boolean), so v2 fault injection (`delay_ms`, `force_error_code`) is additive, never a breaking SDK change. | SDK package | LOW |
| S1.3 As a PM I want one real Miyagi feature instrumented behind `growth.telemetry_enabled` (enablement, default **OFF**, in `platform_flags`), so real traffic proves the loop with an instant off-switch. Acceptance: flag ON → events land; OFF → zero calls. | first consumer | LOW — **touches marketplace FE, additive, announce** |

### S2 — TARS funnel v1
Feature registry (key · target rule · retention window; **seeded by the CLIENT PUSHING its live
`platform_flags` rows** — SDK `syncFeatures()` or a one-command seed run from Miyagi, per Panel
adjudication #1; live prod runtime state, never `lib/flags.ts` code defaults, per the Flag-reality
correction) · aggregation (Targeted denominator, Adopted = first event, Retained = repeat inside
window) · funnel page for the S1.3 feature. All LOW.

### S3 — North Star engine v1
Define metric + leading inputs · link feature→input · per-feature input-impact report over time. LOW.
**Commerce-truth boundary (Panel adjudication #2):** any revenue/order input for Miyagi reads
Medusa-owned surfaces; the engine stores attribution telemetry + derived reports only.

### S4 — A/B v1
Deterministic hash bucketing in the SDK (same user → same variant, **computed client-side, no lookup,
no resolve endpoint — this is experiment assignment, not flag serving; Decision 1 stands**, Panel
adjudication #3) · exposure events · side-by-side variant comparison (basic lift; significance =
later epic). LOW.
**Forward-compat (PRD-G):** variant resolution returns the S1.2 payload envelope; targeting rules
stored as data (cohort %, region — telemetry/GeoIP properties only, never Medusa's `Region`
currency/tax concept) — v2 chaos scenarios (E2 blast radius) reuse this rules shape.

## Addendum — PRD-G: Bottom-line optimization (chaos + SecOps) — deferred to v2 (Daniel, 2026-07-03)
PRD addendum at `../../../references/prd-g-chaos-secops.md` (Modules E + F). **Decision: v1 (S0–S4)
unchanged except the three forward-compat constraints marked above; PRD-G grooms as its own epic in
golden-beans' Roadmap after S4.** Why deferral is structural, not preference:
- **Dependencies point one way.** E3's target-vs-control post-mortems need S2 (TARS) + S4
  (bucketing); E1/E2 need the payload-resolving SDK seam + targeting rules S1/S4 lay down.
- **F3 circuit breakers need the engine to *write* flags** — v1 flags live in Miyagi's
  `platform_flags` (telemetry-first decision). Sequencing for v2: **E (chaos) → flag-serving
  migration epic → F3 circuit breakers.** F3 is now the strongest motivation for that migration.
- **Risk callouts for the v2 grooming (recorded now so they're not rediscovered):** F3 auto-toggling
  flags like `checkout.stripe_enabled` is money-path-adjacent → **HIGH**, Daniel merges, needs its
  own kill-switch + an allow-list of breaker-eligible flags (money/auth flags likely excluded or
  human-confirmed). **Sharpened per Panel adjudication #4:** money-path flag mutation is a
  Medusa/backend-owned capability behind that explicit allow-list — never a generic engine write to
  a flag table; and once the connector operates commerce-adjacent experiments, the UCP manifest/MCP
  surface must describe those controls accurately (Rule 3). F1 attack simulations (credential stuffing, rate abuse) against live surfaces
  touch **Clerk (third-party ToS)** and real buyers → v2 must decide staging-vs-prod + blast-radius
  policy before any simulation runs; client-side-SDK-level injection first (per Daniel's note),
  deep backend fault injection later still.

**Sequencing:** S0 strictly first (golden-beans must be spawned *from* the template — dogfood or the
foundation is fiction). Then S1→S4 linear. Kill-switch decided here per Stage 6b: `growth.telemetry_enabled`.

## QA / smoke
Per story: one Playwright api spec in the owning repo (golden-beans inherits the harness via S0.3 —
its gate must be green from S1 on). Sprint-end smoke walkthroughs per Stage 8b. Owed to Daniel by
name: S0 plugin-install smoke in a fresh session · S1.3 flag-flip + live-event smoke ·
S2 funnel-renders-real-data smoke.

## Open risks
- **Plugin-move regression:** groom is used daily; S0.2 must diff behavior before retiring in-repo
  copies (keep one revert-able commit).
- **New infra cost:** a second Supabase project (likely free tier) + a Vercel project — surfaced to
  Daniel before provisioning, per house rule on paid infra.
- **Targeted denominator honesty:** with flags served by Miyagi (not the engine), "Targeted" in v1 is
  registry-declared, not gateway-observed. Acceptable for v1; noted so the funnel isn't oversold.
- **Marketplace/plugin API drift:** research-preview-era surface; S0.1 re-verifies the docs at build time.

## Definition of Ready
- [x] Mirror-back confirmed; 4 forks decided by Daniel (2026-07-03).
- [x] **Re-groom 2026-07-11:** mirror-back confirmed; 4 new forks decided by Daniel (Decisions 5–8);
      flag-reality correction absorbed (poster fixed same day); research re-verified (PostHog suite +
      Code · Globant/Anthropic pods · Payload/Figma · connector deep-link).
- [x] Stage-2.5 buckets named; overlaps (in-house flags · GTM · skills-spike trigger · **connector-URL
      pattern · admin-content seam**) cited.
- [x] Reuse list produced (extended 2026-07-11); five-rule check done; research cited.
- [x] v1 in/out boundary written (amended: tenant-scoped design, live-row registry seed); follow-on
      epics E1–E6 named + ordered; kill-switch named (`growth.telemetry_enabled`, enablement, OFF).
- [x] Stories risk-tiered (all LOW; two shared-surface announcements); QA stage + smoke owners named.
- [x] **Daniel approved the re-groomed doc (2026-07-11)** — with the advisory panel run (codex +
      antigravity, both lenses) and adjudicated (see Panel adjudication). Scaffold docs already exist
      (`09-platform-infra/dobby-foundation/`, amended 2026-07-11); Sprint-1 kickoff re-emitted; the
      engine epic scaffold is held until golden-beans exists (S0.4), then S1–S4 scaffold there;
      E1–E6 groom later, one per session, in golden-beans' Roadmap.
