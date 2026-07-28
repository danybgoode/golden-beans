# Golden Beans — Product Roadmap & Feature Poster

> **Mission:** Give a product team one primitive set — telemetry ingest, an SDK, a TARS funnel, a
> North Star metric, and A/B experiments — to run growth and experimentation without stitching
> vendors together. Multi-tenant by design; dogfooded against real product funnels.

This folder is the **product source of truth**. It speaks in plain product language for product,
design, and business — **no engineering or tech specs here** (those live in `tasks/` and team memory).

---

## How this roadmap is organized

```
Roadmap/
├── README.md                ← you are here · the product poster (all features)
├── WAYS-OF-WORKING.md       ← how we plan, build, ship (scrum cadence) + tooling
├── LEARNINGS.md             ← the cross-cutting retro digest, read at every session start
├── SESSION-KICKOFFS.md      ← thin-pointer prompt cheat sheet for starting a session
├── 00-ideas/                ← the idea funnel (seeds, audits, the generated BUILD-ORDER.md)
└── <Macro-section>/         ← a product domain (a journey, not a component)
    ├── README.md            ← what this area is, for whom, current features
    └── <Epic>/              ← a meaningful body of work
        ├── README.md        ← the epic's product overview
        ├── sprint-N.md      ← the sprint's user stories (As a… I want… so that…)
        └── RETROSPECTIVE.md ← what we learned
```

**Levels:** `Roadmap → Macro-section → Epic → Sprint → User Story`. Each user story is a small,
independently shippable slice of value.

---

## The macro-sections (product domains)

| # | Macro-section | Covers |
|---|---|---|
| 01 | Growth Engine | Telemetry ingest, SDK, TARS funnel (Targeted/Adopted/Retained), North Star metric, A/B bucketing — the core engine. |
| 02 | Commercial | The public offer: landing page (end-state-driven, backfilled by every epic), waitlist, connector install page, tenancy/pricing, pod reports — Golden Beans as a product, not just an engine. |
| 09 | Platform & Infra | Engineering/observability work that isn't a user-facing product domain — deploy pipeline, dev tooling, cross-cutting process (this convention — reserving `09` for platform/infra — is a deliberate carry-over from the origin project; keep the number stable so tooling that reads it doesn't need per-project config). |

---

## Feature map

<!-- Convention: ✅ means enforced in code, not merely intended — partial/aspirational is 🚧.
     Updating this map is part of the epic Definition of Done (see WAYS-OF-WORKING.md); one
     `### <NN> · <name>` heading per macro-section row above. -->

### 01 · Growth Engine
- ✅ [Growth Engine v1](01-growth-engine/growth-engine-v1/README.md) (telemetry ingest · SDK · TARS
  funnel · North Star metric · A/B bucketing) — live in production at
  `https://golden-beans-gamma.vercel.app`, dogfooded against Miyagi's real setup-guide funnel.
- ✅ [Event destination router](01-growth-engine/event-destination-router/README.md) (versioned
  actor/subject event contract · transactional outbox · tenant-managed **signed webhook
  destinations** · bounded retry/dead-letter + operator replay · delivery operating view) —
  **delivery LIVE in production** (2026-07-22). A tenant creates a signed, filtered destination and
  receives their events reliably, at-least-once, without ingest ever depending on a sink's health.
  First real consumer: Miyagi's merchant-lifecycle projection (Story 3.1, in `medusa-bonsai`). The
  optional Attio adapter (3.2) is deferred until a workspace token exists.
- ✅ [Entity journeys](01-growth-engine/entity-journeys-projections/README.md) (versioned,
  tenant-defined lifecycles · deterministic subject history · cohort conversion/aging/drop-off ·
  exact retention · authenticated UI/API + gated MCP parity) — **live in production** (2026-07-23).
  Miyagi's 13-stage founding-merchant lifecycle is the first proof. Measured production p95 stayed
  under 120 ms with 13 relevant events, so the engine keeps its simpler query-time architecture.

### 02 · Commercial
- 🚧 [Design system lift](02-commercial/design-system-lift/README.md) (gold-ingot Lucide bean mark ·
  approved dark-roast/kraft/foil system · reusable public/product rails · restrained route loaders
  · automated drift guard) — corrective implementation on `fix/apply-approved-design-handoff`,
  sourced directly from the supplied proposal folder and round-two mark exploration.
- ✅ [Multi-tenant activation](02-commercial/multi-tenant-activation/README.md) (auth hardening ·
  self-serve tenants · pod trials) — **Sprint 1 live in production** (2026-07-21): Supabase Auth +
  per-tenant membership, dashboards behind real authorization (slug-guessing returns 404, no
  existence oracle; the public demo still renders anonymously), and API keys as a revocable
  lifecycle (issue/rotate/revoke; owner-only). **Sprints 2–3 built and merged, shipping dark**:
  a confirmed signup provisions a whole tenant (project + owner membership + first key + connector
  token + a starter feature so the funnel isn't empty), the shared ingest path is bounded per
  tenant (payload cap · per-key rate limit · per-project monthly quota, all configurable as data on
  the project row), credential actions are audited append-only, and the landing's §1 hero + §7
  tiers show a real "Start free" CTA. **Launched 2026-07-21** — a real user signed up and received a
  working tenant (project, owner membership, API key, connector token, starter feature) with nobody
  touching the database, verified row by row in production.
- ✅ [Pod Report + Roadmap Hub](02-commercial/pod-report/README.md) (benchmarks/ROI + live
  roadmap-vs-end-state views · scoped share links) — **shipped and live in production 2026-07-26**
  (PRs #30/#32/#33/#34). The report-rendering primitive became an engine primitive with two consumers
  at birth: a **Pod Report** whose every figure is computed from a repository's own git and
  pull-request history, and a **Roadmap Hub** (journey · epic drill-down · horizon) rendering a
  tenant's own pushed roadmap artifact. What makes it a product rather than a dashboard is the
  honesty, and it is structural: speed is never rendered without its gaps beside it, the ladder
  verdict and its not-instrumented count live in one element, a `met` criterion with no resolvable
  evidence pointer is downgraded rather than claimed, and an artifact that lost its caveats is
  REFUSED rather than shown. The baseline is published benchmarks (DORA 2025 · LinearB 2026 · DX
  Core 4), cited and linked, never republished — because the dataset has no human-majority era to
  compare against and that comparison is therefore not claimed. **Landing §5 is live with real
  numbers** (13 days · 88 commits · 2.2 d median epic lead time · step 1 "Assisted" · **11 things we
  do not measure, named**), and **share links** (`/s/<token>`, team/client/investor lenses, revocable
  and expirable) are enabled — as scoped rows in the existing `api_keys` taxonomy, with the ingest
  scope filter welded into a Postgres view so a URL-borne token can never authenticate against the
  API. Six cross-review rounds across two model families; Codex caught a Blocking cross-tenant read
  that four agy rounds had read past. **Owed to Daniel:** minting the first real share links.
- ✅ [Commercial shell](02-commercial/commercial-shell/README.md) (Golden Beans landing · waitlist ·
  read-only MCP connector + install page · dogfood instrumentation · SEO/OG + agent manifest) —
  **launched** and live in production at `https://golden-beans-gamma.vercel.app`. The landing tracks
  itself as a real tenant (visitor→waitlist funnel via the actual SDK), serves real OG cards +
  `/llms.txt`, and the read-only MCP connector is **enabled** (`CONNECTOR_ENABLED` flipped ON
  2026-07-20) with a live demo token on `/install`. Staying on the `vercel.app` domain for v1.

### 09 · Platform & Infra
- 🚧 [Notification rails](09-platform-infra/notification-rails/README.md) (Telegram + Slack
  mechanical push/deploy pings · identical reviewed prose reports · per-channel retry checkpoints)
  — merged in PR #51; Slack uses a channel-scoped Incoming Webhook and plain-text response handling.

---

## Recent highlights

- **2026-07-26** — `pod-report` **epic shipped & LIVE** (PRs #30/#32/#33/#34): the Pod Report and the
  Roadmap Hub, both rendered from the same versioned immutable artifact primitive. Sprint 2 had
  computed every number and shipped none of the surface — a re-derivation against production found
  `--push` exiting 0 without storing anything and an outcome module with zero callers, so a Sprint 2.5
  carry-over built the surface those numbers had nowhere to render into. Three latent bugs were found
  by running things rather than reading them, including a payload CHECK that would have rejected every
  `pod_report` push (verified against production before the fix). Review took six rounds across two
  model families: agy found seven Should-fix and went clean on the auth surface, then Codex opened with
  a Blocking finding on that same surface plus a `CHECK` constraint that evaluated to NULL and so
  permitted exactly the row it appeared to forbid. Also fixed the Telegram rail properly — a rejected
  ping now turns its workflow red instead of leaving a green check, and the escaping/length rule is one
  tested function instead of two.
- **2026-07-23** — `experiment-governance-v2` **epic shipped & LIVE in production** (PRs #19/#22/#23):
  the capstone — an **immutable human decision record** for a stopped experiment (ship/keep/iterate/
  inconclusive/invalid + rationale over a frozen definition/analysis/integrity snapshot, append-only,
  owner-only, and structurally unable to mutate a product flag or roll out a variant), plus one resolver so
  the authenticated UI, the Bearer compare API and the gated MCP tool serve byte-identical plan + diagnostics
  + metrics + decision. Registry, immutable lifecycle and governed trust analysis (SRM/segments) shipped in
  Sprints 1–2. A fresh cold review caught a real accepted-but-unreadable resource-cap defect (fixed,
  mutation-verified); Agy + Devin reviewed clean. Rolled out 2026-07-23: migration applied to prod,
  `EXPERIMENT_GOVERNANCE_ENABLED` flipped ON, flag flip verified live (governed routes now authenticate
  instead of 404); the ledger's behaviour is covered by the 307-spec gate, and the authenticated
  prod decision round-trip validated on the UI.
- **2026-07-28** — `experiment-governance-v2` **proven on its first real customer surface**: the Tiendas
  Fundadoras promise/CTA test ran end to end through Miyagi's own flags (`miyagisanchezcommerce` #316/#317),
  with assignment staying local and Golden Beans never reading or changing a Miyagi flag. A clean 12/12 fixture
  was decision-ready with SRM clear and measured control 25.0% vs treatment 58.3% at metric addressability 1.0;
  a deliberately skewed 12/30 fixture flipped it to `srm_detected` (χ²=7.71, p=0.0055 < α=0.01) with every
  metric still visible. Close-out decision recorded as `invalid`. The dogfood paid for itself three times over:
  metrics join by `context.subject` (Miyagi sent none), the conversion lived in a different id space from the
  exposure, and the v1 plan declared an eligibility tag the emitter never sends — the last of which **the
  governance layer caught itself in production**, naming the cause instead of reporting a plausible zero.
- **2026-07-23** — `entity-journeys-projections` **epic shipped**: a tenant can define an ordered
  lifecycle beyond fixed TARS and read deterministic subject history plus cohort conversion, aging,
  drop-off and retention through one project-scoped UI/API/MCP resolver. The live
  `merchant_activation` v1 proof reached all 13 Miyagi founding-merchant stages from normal
  `/api/v1/track` facts, with no merchant PII or copied CRM/commerce state. Production query evidence
  (p95 <120 ms; 13 relevant events) stays far below the >2 s / >1M-event tripwires, so no projector
  or materialized subject table is justified.
- **2026-07-22** — `event-destination-router` **epic shipped**: the event stream is now
  *operational*. A tenant creates a signed, filtered webhook destination and their events are
  delivered reliably — at-least-once, with bounded retries, dead-lettering and operator replay —
  while ingest stays fully decoupled from sink health (a transactional outbox). Delivery was
  activated in production 2026-07-22 with its first real consumer, Miyagi's merchant-lifecycle
  projection. Hardened over a 24-round cross-agent review (SSRF closed with a connection-pinned
  sender; a tightly-scoped, property-bound AGENTS.md exemption for the background scheduler). Attio
  adapter deferred (optional, needs a token).
- **2026-07-21** — `multi-tenant-activation` **epic shipped**: the engine was multi-tenant by
  design and single-tenant in practice; it is now multi-tenant in operation. A stranger goes from
  the landing page to their own isolated, credentialed, quota-bounded tenant with no human in the
  loop — and that path was walked by a real user in production on launch day. A confirmed signup now becomes a working tenant with no human in the loop, and the
  shared ingest path grew per-tenant isolation limits so an open signup can't hurt a real tenant or
  the bill. Everything customer-facing sits behind `SIGNUP_ENABLED`, born OFF — the launch itself is
  Story 3.3, an env flip followed by a Git-tracked redeploy. Three rounds of cross-family review (Codex + Agy) found
  **12 blocking issues** pre-merge — including an infinite redirect loop, a quota-accounting bug
  that would have made "raise the ceiling" silently fail to restore service, and a **live
  production bug in the already-shipped landing funnel**: its dogfood events were never tagged with
  a feature id, so the funnel had been reading zero since launch while ingesting perfectly (fixed,
  and the four orphaned historical events were backfilled).
- **2026-07-21** — `multi-tenant-activation` **Sprint 1 shipped to production**: the account
  boundary. Dashboards were anonymous (anyone who guessed a project slug could read any tenant's
  data) and each project had one unrotatable key — both closed. Supabase Auth + `project_members`,
  per-tenant authorization, and `api_keys` as a revocable lifecycle, with every existing tenant's
  live ingest key migrated in (verified in prod: a real backfilled key still authorizes). Two rounds
  of cross-family review (Codex + Gemini) caught 6 blocking issues pre-merge, including a live open
  redirect and a cross-tenant credential bind.
- **2026-07-20** — `commercial-shell` **launched** (epic shipped): the landing dogfoods the growth
  engine as its own tenant (a real visitor→waitlist funnel + a `waitlist_conversion` Grower signal),
  serves real OG/Twitter cards and an `llms.txt` agent-readable manifest (Stories 3.1–3.2, PR #11),
  and the read-only **MCP connector is now enabled in production** with a live demo token
  (Story 3.3 — self-tenant seeded, demo token minted, `CONNECTOR_ENABLED` flipped ON; domain stays
  on `golden-beans-gamma.vercel.app` for v1).
- **2026-07-16** — `growth-engine-v1` shipped: a standalone telemetry engine (event ingest + SDK),
  a TARS (Targeted/Adopted/Retained) funnel, a North Star metric with real Medusa revenue inputs,
  and client-side A/B bucketing with a basic-lift comparison view — all proven against one real
  Miyagi feature (the setup-guide funnel) with live production traffic.

## License

Private / internal. Not open-source; all rights reserved.
