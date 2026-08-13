# Golden Frijoles — landing page end-state (reference spec)

> **Reference end-state: inspiration, never signed-off scope** (WAYS-OF-WORKING). This is the
> "final version" of the public landing we work *backwards* from. Each section carries the epic
> that lights it up — the **backfill contract**: an epic that changes the public offer ships or
> updates its landing section in the same epic (see WAYS-OF-WORKING → epic Definition of Done).
> Companion visual mock: `landing-end-state-mock.html`. Written 2026-07-14 (E1 groom session).
>
> **⚠️ SUPERSEDED 2026-08-12 by `landing-redesign-v2`, and again the same day by
> `landing-frijoles-rebrand`.** The section map below described the engine-first pitch ("The growth
> engine your agent operates"). That page no longer exists: the current landing is built from
> `golden-frijoles-landing-v2.html`, and the live registry is `apps/web/lib/landing-sections.ts`.
> **The personas, the design language and the guardrails in this document all still hold** — only
> the section map was replaced, and it is kept below, struck through, because the backfill contract
> it defines is still how this project works. A superseded map deleted outright would take that
> contract with it.
>
> **The product is now called Golden Frijoles, on `goldenfrijoles.com`.** The first rename was
> public-surfaces-only (`landing-frijoles-rebrand` D1); `frijoles-rebrand-closeout` subsequently
> published the SDK as `@golden-frijoles/sdk`. The GitHub repository, Vercel/Supabase projects,
> live tenant slugs and existing consumer environment variables remain named technical addresses.
> Where this document says "Golden Beans" below in a historical table, it describes a page that no
> longer exists and is left as written.

## The one-sentence pitch

**Golden Frijoles is the product context your own agent works from** — telemetry, TARS funnels,
North Star metrics, and A/B experiments as primitives; you bring the agent (Claude, ChatGPT, or any
MCP client) instead of renting ours.

*(The engine-first phrasing this replaces — "the growth engine your own agent operates" — is the
sentence `landing-redesign-v2` was written to retire: it opens on the primitive set for a reader
who has not yet been told what primitives are for.)*

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

## Section map — ~~final vision~~ SUPERSEDED, see `landing-redesign-v2`

**The current map lives in `apps/web/lib/landing-sections.ts`** — one entry per section, each
naming the epic that lights it and its status. That file is the single source of truth, on purpose:
this table went stale three separate times while the page moved underneath it.

The current narrative, for orientation. Ten numbered stamps carry the spine of the argument; two
unnumbered bands sit between them and are unnumbered deliberately — an aside and a capability
showcase are not steps in an argument:

hero (your roadmap has enough opinions) → try it in your own agent with no account → how to start,
in three steps → *the shameless infomercial* → **1** everyone has a good reason → **2** bring an
agent to the argument → **3** from "I think" to "here's why" → *break glass, on purpose (the chaos
and security drills, each reading its own gate)* → **4** agnostic about ideas, conservative about
actions → **5** less coordination → **6** proof (Pod Report **and** the live engine read) →
**7** yes you can build this yourself → **8** bring your agent → **9** the SDK → **10** pricing →
ask your own agent whether to bother.

The `①`-`⑩` glyphs this used to be written with are retired (`landing-frijoles-rebrand` D4): they
are illegible at the size a text run tolerates, because the enclosing ring is part of the character.
`scripts/check-design-drift.mjs` now refuses them.

<details>
<summary>The original E1 section map (historical — no longer describes the page)</summary>


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

</details>

**The "nothing fake" rule above survived the redesign unchanged, and got sharper.** v2 renders
illustrated agent conversations as well as real ones, so every framed surface now carries a
`SurfaceNote` saying which it is, and the only numbers on the page are the Pod Report's computed
figures and the demo tenant's live engine read.

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
