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
- ✅ [Commercial shell](02-commercial/commercial-shell/README.md) (Golden Beans landing · waitlist ·
  read-only MCP connector + install page · dogfood instrumentation · SEO/OG + agent manifest) —
  **launched** and live in production at `https://golden-beans-gamma.vercel.app`. The landing tracks
  itself as a real tenant (visitor→waitlist funnel via the actual SDK), serves real OG cards +
  `/llms.txt`, and the read-only MCP connector is **enabled** (`CONNECTOR_ENABLED` flipped ON
  2026-07-20) with a live demo token on `/install`. Staying on the `vercel.app` domain for v1.

---

## Recent highlights

- **2026-07-23** — `experiment-governance-v2` **Sprint 3 code-complete & in review** (PR #23, CI-green):
  the epic's capstone — an **immutable human decision record** for a stopped experiment (ship/keep/iterate/
  inconclusive/invalid + rationale over a frozen definition/analysis/integrity snapshot, append-only,
  owner-only, and structurally unable to mutate a product flag or roll out a variant), plus one resolver so
  the authenticated UI, the Bearer compare API and the gated MCP tool serve byte-identical plan + diagnostics
  + metrics + decision. Sprints 1–2 (registry, immutable lifecycle, governed trust analysis/SRM/segments)
  already merged (#19, #22). A fresh cold review caught a real accepted-but-unreadable resource-cap defect
  (fixed, mutation-verified); Agy + Devin reviewed clean. Stays behind born-OFF `EXPERIMENT_GOVERNANCE_ENABLED`;
  production migration/flag rollout and the live Miyagi (Tiendas Fundadoras) decision are owed to Daniel.
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
