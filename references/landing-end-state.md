# Golden Beans — landing page end-state (reference spec)

> **Reference end-state: inspiration, never signed-off scope** (WAYS-OF-WORKING). This is the
> "final version" of the public landing we work *backwards* from. Each section carries the epic
> that lights it up — the **backfill contract**: an epic that changes the public offer ships or
> updates its landing section in the same epic (see WAYS-OF-WORKING → epic Definition of Done).
> Companion visual mock: `landing-end-state-mock.html`. Written 2026-07-14 (E1 groom session).

## The one-sentence pitch

**Golden Beans is the growth engine your own agent operates** — telemetry, TARS funnels, North
Star metrics, and A/B experiments as primitives; you bring the agent (Claude, or any MCP client)
instead of renting ours.

The positioning inversion (vs PostHog, the quality bar): their signal loop ends in *their* AI;
ours ends in **yours**, over MCP. Verified PostHog product audit: SCOPE.md → "Product frame
(2026-07-11)".

## Personas (who the page speaks to, in priority order)

1. **The technical PM** — wants funnels and impact reports without SQL or an engineering ticket;
   operates the engine by talking to their own agent.
2. **The product-org decision-maker** — buys the pods story: the dev team as a revenue engine,
   proven with velocity/DORA/cost-per-point benchmarks (E3's report is the sales artifact).
3. **The application engineer** — judges the SDK: ≤5-line integration, deterministic bucketing,
   schema-validated ingest, `npx` wizard.
4. **The customer's agent** — a first-class persona: the connector URL is the product's front
   door; the page itself must be legible to an agent (clean semantics, an `llms.txt`-style
   surface at maturity).
5. *(v2)* **The DevSecOps lead / resilient PM** — chaos + SecOps correlated to business metrics
   (PRD-G, E5b).

## Section map — final vision, tagged by the epic that lights it up

| # | Section | Content at end-state | Lights up |
|---|---|---|---|
| 1 | **Hero** | "The growth engine your agent operates." Copy-your-MCP-URL field + **Add to Claude** deep-link as the primary CTA; waitlist as secondary until self-serve. | **E1** (waitlist CTA) → **E2** (real signup CTA) |
| 2 | **Live proof** | A real, live TARS funnel + North Star + A/B comparison rendered from a **synthetic demo project** — the actual product UI, not screenshots. | **E1** |
| 3 | **Three operate routes** | ① Tokenized connector URL ("Add to Claude", free tier works) ② Cowork/Claude Code plugin (the full pods experience) ③ `npx` wizard for engineers. SDK instrumentation shown as the always-required data-in layer. | **E1** (①, ③ docs) → **E2** (②, activation) |
| 4 | **The inverted loop** | Signals → structured tasks → **your** agent fixes it. Side-by-side with the integrated-AI alternative. | **E4** |
| 5 | **Pods & proof (ROI)** | The Pod Report: velocity, throughput, cycle/lead time, DORA, cost-per-shipped-point — human-baseline vs agent-augmented pod, dogfooded from a real 104-epic dataset. | **E3** |
| 6 | **Primitives grid** | Telemetry ingest · feature registry · TARS · North Star · experiments · (later: flag serving · chaos/SecOps · CMS hooks). Honest badges: shipped ✅ / coming 🔜. | **E1** grid; rows flip as **E5a/E5b/E6** ship |
| 7 | **Pricing / tenancy** | Self-serve tiers + pod engagements. Until then: waitlist + hand-provisioned pilots. | **E2** |
| 8 | **Footer** | Docs, GitHub, status, trust; agent-readable manifest. | **E1**, grows |

**Launch-ready v1 (E1)** = sections 1, 2, 3(①③), 6, 8 live; 4, 5, 7 present as honestly-labeled
"lights up next" teasers. Nothing fake: every number on the page is real engine output from the
demo project; capability badges never claim ✅ for unshipped work (poster rule applies to the
landing too).

## Design language

PostHog-grade usability/playfulness is the bar, not the spec — **our own cooler version**.
**Full direction: `references/design-direction.md`** (written 2026-07-14 from Daniel's PostHog
homepage references — retro-desktop frame device, real-UI-inside-fiction, self-aware CTA
mechanics). Headlines:
- **Brand world:** the roastery. Kraft + gold-foil packaging materials, dark-roast product panels
  (deliberately inverted from PostHog's cream), brass-instrument skeuomorphism for flags/toggles.
- **Frame device:** the **agent conversation window** — live-proof panels render inside a chat
  chrome where your agent queries the real engine (their `home.mdx` window, our BYO-agent
  version).
- **Voice:** self-aware, footnoted, honesty-as-bit; every joke sits next to a checkable claim.
- **Heuristics source:** medusa-bonsai `frontend-design` skill (the quality rail); fresh PostHog
  captures land in `references/posthog/` at E1 story 2.3.
- **Honesty as aesthetic:** the registry-declared-Targeted caveat and shipped/coming badges are
  design elements, not fine print — the audience is PMs who smell vendor-ware.

## Guardrails carried from the groom

- **No client data on the public page, ever** — the live-proof section reads a synthetic demo
  project; Miyagi's real funnels stay behind auth.
- **Connector route ships dark** behind an enablement gate + revocable per-project tokens
  (E1 Stage-6b decision, see the seed).
- **Custom domain = paid infra** → Daniel green-lights before provisioning; v1 may launch on
  `golden-beans-gamma.vercel.app`.
