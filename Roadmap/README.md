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
- 🚧 [Scenarios made PM-operable](01-growth-engine/scenarios-pm-operable/README.md) (owner define ·
  bounded launch/retry/stop · explicit target state · honest impact comparison and immutable evidence
  links) — **code and migration are live, authoring remains dark** (2026-08-13, PR #98, `5bca24c`).
  Signed-in owners now have one project-scoped operating surface over the existing scenario engine;
  members keep the read-only evidence view. The enablement gate stays OFF until a verified synthetic
  production launch/stop and the product owner's rendered-claim judgment are complete. #14's chart
  decision remains open, so impact uses the documented comparison-table fallback.
- ✅ [Flag control plane + Miyagi migration + resilience/SecOps](01-growth-engine/flag-serving-and-prd-g/README.md)
  (typed/versioned flag registry · local snapshot provider · complete 40-key Miyagi cutover · closed
  resilience/security scenarios · policy-bound circuit breakers · generic project catalog sync ·
  discoverable Flags/Tasks) — Golden authority is live in both Miyagi services on snapshot `47`; the
  owned-shop feature remains ON behind its normal Golden-managed killswitch, the internal production
  exercise and manual/automatic protective transitions are evidenced, and all three proof-only gates
  are back OFF. The authenticated browser walkthrough was unavailable to this session; HTTP
  auth-boundary proof is recorded.
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
- ✅ [Golden Frijoles rebrand close-out](02-commercial/frijoles-rebrand-closeout/README.md)
  (published `@golden-frijoles/sdk@0.4.0` · explicit OpenFeature identity break · deprecated old SDK
  pointer · footer-ledger deletion · authenticated mobile sweep) — **live in production 2026-08-13**
  (PR #96, `0a0beb0`). The package clean-installs from npm, §9 names the package that exists, and the
  signed-in sweep repaired shared sortable-header targets plus scenario/destination table overflow.
  Wire envelope `golden_beans.webhook.test`, historical tenant slugs, and integration addresses stay
  deliberately stable because other systems resolve them.
- ✅ [Maker ops — the landing repositions from a growth engine to an operating context](02-commercial/landing-maker-ops/README.md)
  (the maker-ops spine · four operating surfaces whose status is computed, never written down ·
  FinOps shipped as an explicit concept · the Pods booking flow at `/talk`) — **live in production
  2026-08-19** (PR #100, `46c7e80`), serving on **https://goldenfrijoles.com**. The page stopped selling a primitive set: the buyer changed underneath it,
  because agents made it possible for one person to hold a product that used to need a department.
  Twelve sections retired; Proof, Connect, SDK and Pricing were kept against the mockup, since they
  are the page's only live numbers and both of its conversion paths. Three cross-family review
  rounds found the two failure modes a repositioning is uniquely good at producing: a **claim that
  outlived its qualifier** (retiring §4 took `isConnectorWritesEnabled()` with it while the new
  authority section inherited the argument), and a **shared component that moved from one route to
  many**, silently invalidating the spec that only ever loaded `/`. The consulting tier lost its
  price and gained a real conversation.
- ✅ [Golden Frijoles — the rebrand, the material pass, and the broken controls](02-commercial/landing-frijoles-rebrand/README.md)
  (the product's name and its own domain · two live-page defects repaired · the chat-shaped agent
  surfaces · the infomercial and the flag-honest resilience drills · one elevation ladder and one
  motion vocabulary) — **live in production 2026-08-13** (PR #95, `5544c06`), serving on
  **https://goldenfrijoles.com**. This epic deliberately stopped at public surfaces; the follow-up
  rebrand close-out above published the renamed SDK while leaving the GitHub, Vercel, Supabase, wire,
  tenant-data, and caller-owned integration addresses stable. Two controls were genuinely broken and both
  were specificity accidents — the primary CTA lost its label on hover (`a:hover` at (0,1,1) beating
  `.btn-gold` at (0,1,0), so only *anchor*-based golds were affected, which is why it read as "some
  of them"), and selecting a paragraph on a phone painted an opaque gold slab. The section stamps
  are drawn discs now rather than `①` glyphs, which are illegible at any size a text run tolerates
  because the ring is part of the character.
- ✅ [Landing redesign v2](02-commercial/landing-redesign-v2/README.md) (the decision-first
  narrative · mobile heuristics as site-wide rails · `/northstar-self-serve.md` · proof that carries
  both the Pod Report and a live engine read) — **live in production 2026-08-12** (PR #92, `4553767`).
  The landing sold an *engine* — "The growth engine your agent operates" — which accurately described
  what was built and poorly described who buys it: it opened on the primitive set for a reader who
  had not yet been told what primitives are *for*. It now opens on the problem a PM already has, and
  the engine is the reason the receipts exist rather than the thing being sold. **Give-before-you-ask
  is the second section:** a prompt a stranger can paste into their own ChatGPT or Claude, which
  sends it to two public routes and runs a real North Star workshop with them — no account, no
  connector, nothing to install. §6 is the only section with numbers, and it carries **both** proofs:
  the Pod Report computed from this repo's own git history, and a live read of the demo tenant that
  reconciles exactly with the `/api/v1/public/north-star` the page invites you to curl (verified in
  production: `value: 35, wow: 0.409` both ways). Every other framed surface is labelled an
  illustration, and **a spec checks that it is** — because the footer's ledger claimed the hero was
  labelled before it actually was. Four collisions between the mockup's copy and what is checkable
  were resolved in favour of checkable, including a `$49` tier that ships with its price *and* the
  fact that nobody can be charged it yet. The mobile work is deliberately **rails, not an audit**:
  zero-specificity floors any component can step over, plus a guard that sweeps a list of routes —
  it found the site's most-tapped control sitting 4px under the accessibility floor on its first run.
- ✅ [App shell and agent rail](02-commercial/app-shell-and-agent-rail/README.md) (section nav over
  the route inventory · the agent's activity rail · Command Center) — **merged to `main` 2026-08-07**
  (PRs #71/#75/#73). The backend had modelled the agent as an accountable actor since signals-loop —
  scoped revocable credentials, staged writes bound to the credential that proposed them, an
  append-only trail — and **none of it reached a screen**. Now it does: a rail on every `/app` route
  showing what your agent and your team actually did, and what your agent has staged and is waiting
  on you to allow. `/app` stopped being a bulleted list of project slugs and became a front door that
  answers *did anything need me today* — North Star, adoption and retention, the TARS funnel drawn as
  a funnel over CSS that already shipped, and an explicit list of what this project is **not**
  measuring (including the Medusa-truth revenue boundary) so "where's my revenue number?" is answered
  with a reason rather than a plausible figure. No migration, no new query, **no new dependency**:
  the nav renders the inventory `project-route-inventory.ts` already carried, and the stat strip
  reuses the same `getProjectOutcome` the client-facing Pod Report reads, so an owner's numbers and a
  client's cannot drift. The rail is **dark in production** behind `AGENT_RAIL_ENABLED`, born OFF —
  and the var does not exist in Vercel yet, which is the one item owed.
- 🟡 [Flags — a visual rule builder](01-growth-engine/flags-visual-rule-builder/README.md) (rule
  builder · rollout bars · plain-language version diff · preview-as-a-user) — **all three sprints
  built, Sprint 1 merged and dark in production; Sprints 2 and 3 await the owner's merge**
  (PRs #87/#88/#89). A PM is the person who knows *"roll this out to pro-plan users in Mexico at
  10%"* and the person least able to type it as JSON into a `<textarea>` — so the strongest
  primitive the product has was invisible to the buyer it was built for. **No migration, no new
  route, no new dependency, no change to the wire contract:** the builder posts through the server
  action the textarea already used, the bars and the diff are pure derivations over props the page
  already had, and the preview calls the SDK's own evaluator server-side. Everything renders behind
  `FLAG_RULE_BUILDER_ENABLED`, so with the gate down the page is byte-for-byte pre-epic. The
  architecture lock disproved **four** of this doc's own claims before a line was written — including
  that D4 was unbuildable as the SDK stood, and that D5's "read the constant" was impossible because
  three of its four constants were never exported.
- ✅ [Component-kit adoption sweep](02-commercial/app-component-kit-adoption/README.md) (`DataTable`
  · `ConfirmDialog` · `FormSection`/`Field` · six converted routes · every irreversible action
  confirmed) — **shipped & live 2026-08-09** (PRs #82/#83/#84). `app-shell-and-agent-rail` shipped a
  nine-component kit that **2 of 26** `/app` route files used; this closed the gap for the surfaces a
  PM actually operates. Every list in the product now sorts, filters, and tells *"you have none"*
  apart from *"none match what you typed"* — and nine irreversible controls ask first and **say what
  stops**, in a sentence, naming the specific object. The lock pass found the epic's own D5 was
  false: the agent rail was documented as "already confirming" and has no interactive controls at
  all, while the product's one real confirmation — a bespoke two-click in `destinations` — went
  unmentioned. That one is now converged onto `ConfirmDialog`, so the product ships **one**
  confirmation pattern. Also the first `table`, `form` and `dialog` CSS the repo has ever had: before
  this, every `/app` table rendered at browser defaults. No migration, no new route, no new
  dependency.
- ✅ [Design system lift](02-commercial/design-system-lift/README.md) (gold-ingot Lucide bean mark ·
  approved dark-roast/kraft/foil system · reusable public/product rails · restrained route loaders
  · automated drift guard) — **shipped 2026-07-28** (PRs #51/#53), sourced directly from the
  supplied proposal folder and round-two mark exploration; the visual rails now cover public,
  auth, install, and signed-in routes without weakening gated-route HTTP semantics.
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
- ✅ [Notification rails](09-platform-infra/notification-rails/README.md) (Telegram + Slack
  mechanical push/deploy pings · identical reviewed prose reports · per-channel retry checkpoints)
  — **shipped 2026-07-28** (PR #51); Slack uses a channel-scoped Incoming Webhook and plain-text
  response handling, while the local report checkpoint advances only after every configured channel
  accepts the reviewed prose.

---

## Recent highlights

- **2026-08-13** — `scenarios-pm-operable` **shipped dark** (PR #98, `5bca24c`): the scenario engine
  now has a PM-facing owner surface for closed-choice definition, bounded launch/retry/stop, target
  state, and an honest control-vs-treatment evidence thread. The additive owner-session facade keeps
  every write project-scoped and actor-attributed while sharing the credential rail's transaction
  cores. `SCENARIO_AUTHORING_ENABLED` remains OFF pending the named synthetic production walkthrough
  and rendered-claim judgment; read-only evidence remains available throughout.
- **2026-08-13** — `frijoles-rebrand-closeout` **shipped and live** (PR #96, `0a0beb0`): the name now
  holds below the public surface too. `@golden-frijoles/sdk@0.4.0` is public and clean-installable,
  the old `0.1.0` package points forward, and the OpenFeature provider identity break is explicit.
  The footer's mockup ledger is gone without weakening the local honesty labels. The long-owed
  signed-in mobile sweep reached eight real app routes and immediately found shared tap-target and
  table-overflow defects that the anonymous rail could only measure on a login redirect.
- **2026-08-13** — `landing-frijoles-rebrand` **shipped and live** (PR #95, `5544c06`): the product
  is **Golden Frijoles**, on **goldenfrijoles.com**. Beyond the rename, this epic repaired two
  defects the previous one shipped and made the page's materials one system. Three things are worth
  carrying forward. **Both bugs were specificity accidents** — nothing was wrong in isolation, which
  is exactly why they survived review and reached a human's eye instead. **Reproducing the selection
  bug in two engines before touching it prevented a wrong fix:** the full-width extension is UA
  selection painting and cannot be changed from CSS; what was ours was the opaque fill, so the fix
  was a material change, not a geometry one. And **fifteen cross-family review rounds found real
  defects for nine of them** — three of which were in the *guards* rather than the product,
  including a drift check that had been reporting the wrong line number for its entire existence,
  found by the second family in one pass after the first missed it in nine.
- **2026-08-12** — `landing-redesign-v2` **shipped and live** (PR #92, `4553767`): the public page
  now sells the decision rather than the engine, and gives a stranger something usable — a North Star
  workshop their own agent runs — before asking for anything. Two things are worth carrying forward.
  **Mobile shipped as rails, not as an audit:** zero-specificity floors in `globals.css` plus one
  sweep spec over a *list* of routes, which found the site's most-tapped control 4px under the
  accessibility floor on its first run; covering the next route is now one array entry. And **the
  honesty rules did real work against a signed-off mockup** — four of its claims were not checkable
  (hardcoded velocity stats, a price with no billing rail, a URL that 404'd, a CLI command that does
  not exist) and all four were resolved in favour of what can be verified, without losing the design.
  Five review rounds, nine findings; round 2's "clean" verdict came from a reviewer that had attached
  **zero files**, which is the session's sharpest lesson: read the scope line before the findings.

- **2026-08-10** — `flags-visual-rule-builder` **built out end to end** (PRs #87/#88/#89; Sprint 1
  merged dark, Sprints 2 and 3 awaiting the owner's merge): the flag control plane finally has an
  authoring surface, a picture of where each flag actually reaches, a version history that reads as
  sentences, and a "what would this user see" that answers with the **SDK's own evaluator**. A3 is
  the shape of the epic: `evaluateFlag` could not name which rule matched, and collapsed *"a clause
  failed"* and *"the rollout excluded you"* into one `false` — the single outcome a PM is most likely
  to report as a bug. Rather than write a second matcher in the app (D4's exact named failure), the
  private predicate was split in two and `matchesRule` redefined as their conjunction, so the
  evaluator is unchanged **by construction** and the exported explanation is built from the same two
  halves. **Sprint 2 took seven review rounds and sixteen real defects**, and the reason it did not
  stop at two is the finding worth keeping: **round 4 was clean from both external families, and the
  fresh reviewer found a regression that round 3's own fix had introduced.** Rounds 5 and 6 each
  found one more path after the second family had gone clean three rounds running. Four of those
  sixteen were one cause wearing four hats — a TypeScript type over a JSONB column is a promise the
  database does not make, and guarding each field by hand was building the second validator D2
  forbids, always one review finding behind.
- **2026-08-09** — `app-component-kit-adoption` **epic shipped & LIVE** (PRs #82/#83/#84): the kit
  finally reached the routes, and nothing irreversible is one click away any more. The
  architecture-lock pass earned its keep before a line was written — it read the code instead of the
  plan and found **D5, a locked decision the whole of Sprint 3 rested on, described a component that
  does not exist as described**: `AgentRail.tsx` "already confirms" was false (it is read-only, zero
  controls), and the real pre-existing confirmation sat unmentioned in `destinations`. Unchecked,
  Sprint 3 would have shipped the second confirmation pattern D5 existed to prevent. Cross-review
  then caught what CI cannot: a green PR whose `ConfirmDialog` **stranded keyboard users on
  `<body>`** because it unmounted itself instead of calling native `close()` — the focus-trap spec
  passed it, having only ever examined focus *while the dialog was open*. A spec that watches a
  mechanism running will not notice it never puts anything back. Two other "regressions" turned out
  to be the environment, disproved by running the identical command on clean `main` rather than
  reasoning about the diff: a `next dev` server corrupting the local gate's own build output, and a
  spec failing on accumulated fixture data. And "less code", the Sweeper prior, was measured and is
  simply **false** for table conversions (136→135, 152→163) — the acceptance that survives is *same
  behaviour, no regressions*, which is falsifiable.
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
