---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: agentic-pm-public-surface
build_order: 23
---

# Epic: The public surface names the category — agentic product management, a hero that hands you a prompt, and a North Star workshop worth the URL

> **Area:** 02-commercial · **Risk:** low · **Class:** Feature · **Archetype:** Repositioner ·
> **Appetite:** L (multi-wave — re-bet at each sprint boundary)
> **Underwritten by:** [`Roadmap/bets/wave-2026-08-20-agentic-pm.md`](../../bets/wave-2026-08-20-agentic-pm.md)
> **Scope doc:** [`seeds/agentic-pm-public-surface.md`](../../00-ideas/seeds/agentic-pm-public-surface.md) — approved by the product owner 2026-08-20
> **Predecessors:** [`landing-maker-ops`](../landing-maker-ops/README.md) (the spine this edits) ·
> [`landing-readability-pass`](../landing-readability-pass/README.md) (the subtractive pass this continues) ·
> [`methodology-experience`](../methodology-experience/README.md) (shipped 2026-08-20 — `/methodology` is the room this points at)

## Why

Three surfaces are read by a stranger who has never heard of us: the landing, `/llms.txt`, and
`/northstar-self-serve.md`. They are currently three voices. The landing argues a category it never
names. The manifest is a sitemap written for a deployment two epics ago. The workshop is a competent
generic script that any capable model could have produced unaided — while the actual methodology,
the one the product owner runs as a skill, sits outside the repo.

This epic makes all three say one thing, in one register, and rebuilds the workshop into the reason
a practitioner would bookmark this site.

The register comes from a source that needs a translation rule rather than a paste. The product
owner brought copy from enterprise product-management job posts — lock-in, capacity constraints,
governance, spend control, staying future-proof as models evolve, owning a broad product surface
rather than a feature. That is a sales-led, up-market motion, and `landing-maker-ops` repositioned
this page onto the opposite claim eight days ago across 21 stories. But the *surface* the job post
describes — identity and access, governance, security, spend control, admin tooling, the growth
engine — is a literal description of Golden Frijoles' four Ops surfaces at a different scale. So the
register transfers and the motion does not. D1 states the rule.

## Platform-first note

No new route, table, event path, flag or primitive. One new pure module (`lib/positioning.ts`), four
components deleted, one component's right column replaced, four copy surfaces edited. Telemetry is
untouched — `SelfTrackBeacon` stays first in `app/page.tsx` (AGENTS rule #1). Every gate
(`RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `DESTINATION_DELIVERY_ENABLED`,
`SIGNUP_ENABLED`) is read exactly as before, per request, through `lib/flags.ts` and
`lib/maker-ops.ts`. `force-dynamic` stays on `/` — it was never only about the proof numbers; every
flag-derived sentence on the page depends on it.

## What already exists (reuse, don't rebuild)

| Need | Already there |
|---|---|
| A copy-a-prompt card with a real clipboard round-trip | `components/landing/CopyPromptCard.tsx` — already used on `/methodology`, already specced |
| The hero's new prompt | `lib/landing-prompts.ts` → `handoffPrompt()`, written and tested, **currently call-site-free** since `landing-readability-pass` cut §try |
| Prompt URL safety (one host, every path resolves) | `e2e/landing-prompts.spec.ts` + `PROMPT_ROUTES` |
| The section ↔ epic registry and its id ↔ DOM round-trip | `lib/landing-sections.ts` + `e2e/landing.browser.spec.ts` |
| The honest Ops surface list with per-request gate resolution | `lib/maker-ops.ts` — §ops keeps it; the hero's second copy of it goes away with the bag |
| The methodology chapter registry | `lib/methodology-chapters.ts` — §methodology's card derives from it; the register pass must not fork it |
| Every absolute URL | `lib/site-url.ts` → `getSiteUrl()` (AGENTS rule #5) |
| The workshop route's four safety pins | `e2e/northstar-self-serve.spec.ts` |
| The manifest's host + capability pins | `e2e/llms-txt.spec.ts` |
| Heading style (no terminal full stop) | `scripts/check-design-drift.mjs` D7 |

## Architecture decisions

### D1 — Enterprise scope, maker scale. Borrow the register, never the motion.

Every borrowed phrase is re-pointed at one person and their agents. "Give the world's largest
organizations control of their policies and costs" becomes control of *your* policies and costs,
without a department. "Employees stuck using a single model family" becomes *you*, stuck on whichever
agent you happened to start with.

**Taken:** lock-in and capacity constraints as the named enemy · the flexibility to move fast, scale
confidently and stay future-proof *as models evolve* · model-agnosticism as a stated value (Golden
Frijoles already is this — "you bring the agent") · owning a broad product surface rather than a
feature · the difference between something that demos well and something that holds up in production ·
high product taste · analytics-heavy and technical, said without apology.

**Left:** procurement, RFPs, security questionnaires, seat expansion, "the world's largest
organizations", and anything implying a sales team or an admin console for other people's employees.

**Where it lands** — spread, not blocked:

| Surface | The borrowed idea it carries |
|---|---|
| §hero sub-copy | move fast · future-proof as models evolve |
| §ops | the broad product surface, one person owns it |
| §authority | governance and control over policy — without a department |
| §finops | spend control and unit economics (its "not built" badge is untouched) |
| §methodology | high product taste · demos well vs. holds up |
| §pricing + §start | no lock-in · you bring the agent |
| `/llms.txt` | the whole positioning paragraph, in plain language |

### D2 — The category is named, defined once, and stated from one place in the code

"Agentic product management" is an emerging term with no owner, and today's dominant usage means
*product management **of** agentic AI products* — building agents. That is not what we mean. Used
bare, an agent summarising this page repeats the term with the market's meaning and files us as an
agent-building tool. So we define it, once, and use it bare thereafter.

**The line (locked; changing it is one edit in one file, which is the point):**

> *Agentic product management: the whole product discipline — decide, build, prove, grow — run by
> one person and their agents, on rails that keep the evidence honest.*

**One string, one module.** This repo lost three review rounds in one epic to two lists that had to
agree (`MakerHero`'s bag rows vs. `MAKER_OPS_SURFACES`), and the fix each time was to derive rather
than to repeat. A category name and definition retyped across five outward surfaces is the same
defect waiting. `lib/positioning.ts` exports both; every public surface that names the category
imports it; a spec asserts the string appears identically on each.

### D3 — The four structural edits, exactly

1. **§hero's right column becomes a single `CopyPromptCard`.** Both current objects go — the kraft
   bag and the illustrated agent window. The bag's honest surface list is not lost: §ops derives from
   the same `MAKER_OPS_SURFACES` and resolves the same gates.
2. **§product ("One operating context") is deleted** — component, registry entry and the app-shell
   illustration inside it, in the same commit, per the rule `lib/landing-sections.ts` states about
   itself.
3. **§ops's eyebrow changes from "One project, many operations" to "One operating context"** — the
   phrase survives its section. Nothing else in §ops moves: the tabs, the derived surfaces and the
   gate resolution are untouched.
4. **§proof is deleted** — `ProofSection`, `PodReportProof`, `LiveEngineProof` and their registry
   entry. See D4.

### D4 — Deleting §proof has three consequences, and Story 2.3 owns all three

- **The nav loses two anchors.** `Nav.tsx` links `/#product` and `/#proof`, and
  `e2e/landing.browser.spec.ts` asserts every registry id is a real DOM id. The nav becomes
  **`Ops · Pricing · Methodology`**. "Product" is retired rather than re-pointed at `#ops` — a link
  labelled Product landing on a section called Ops is a small lie that costs more than the link.
- **The stamps renumber to nothing.** §proof is `SectionDivider number={1}` and §pricing is `2`.
  With proof gone, a lone "1" describes a document nobody can read. The divider comes off §pricing
  too and the device retires with the argument it was counting.
- **Orphans.** `lib/week-over-week.ts` exists only because `LiveEngineProof` needed it testable. The
  story removes what becomes unreachable or states why it stays. `/hub`'s report views must not be
  disturbed — check before deleting anything shared.

**Recorded because it is the risk, and because the product owner overruled it deliberately:** the
page's central argument is evidence over assertion, and `LiveEngineProof` was the only
non-illustrative thing on it. After this epic every frame on `/` is a labelled illustration. The
mitigation already in the plan is D5's hero prompt — a reader who pastes it sends their own agent to
go and check us, which is stronger than a stat tile because it does not require being believed. **If
the page later reads thin on evidence, the live engine read returns as a strip under the hero. Do not
rebuild §proof.**

### D5 — The hero gets `handoffPrompt`; §start keeps `decisionPrompt`. This reverses a predecessor's ruling on purpose.

`handoffPrompt()` is written, documented and covered, and has had **no call site** since
`landing-readability-pass` cut §try. It is the better hero prompt on the merits: it tells the
reader's agent to explain Golden Frijoles plainly and *not to sell*, then offers to run the North
Star workshop — routing the top of the page straight into this epic's centrepiece.

`landing-readability-pass` D1 ruled that two copy-a-prompt blocks read as a pattern rather than an
invitation. That ruling stands for two blocks asking the **same** thing. These ask different things
at different moments: the top offers to teach you something, the bottom asks your own agent whether
to bother. The page also now has a graphic-free hero that needs a reason to exist. Stated here so a
future reader sees a decision rather than drift.

### D6 — The workshop is rebuilt from the real methodology, in our words, with visible lineage

The source is Amplitude's North Star Framework (the *North Star Playbook*, Cutler & McBride), by way
of the product owner's `northstar-workshop` skill and the 2024 *How-to Guide: Running Your North Star
Workshop*. **The structure is theirs; the words and the mechanics are ours.** Every step is rewritten
in Golden Frijoles' voice and connected to what our engine actually computes. The framework and the
Playbook are credited by name, with a link, **once**, near the top — not throughout. A credit
repeated is a document that reads like someone else's.

The element map, the case studies, and the five pinned safety properties are in
[`sprint-1.md`](./sprint-1.md), where the work is.

### D7 — `/llms.txt` becomes an operating brief, not just a map

A static manifest cannot "ask questions" — it is fetched, not conversed with. What it can do is tell
the agent that fetched it how to behave with the practitioner on the other side. It keeps its route
map and gains: the positioning paragraph (D1 register, category from `lib/positioning.ts`), a set of
diagnostic questions to put to someone who has just arrived, and an explicit plain-language rule.
Its existing honesty guardrail is inherited unchanged: **this manifest lists only what is live in
this deployment right now.**

## Scope

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The category is stated once, from one module | low |
| 1 | 1.2 The workshop teaches the actual framework | low |
| 1 | 1.3 The workshop knows how to close, and what it cannot claim | low |
| 1 | 1.4 The product owner runs it end-to-end in a real agent | low |
| 2 | 2.1 The hero hands the reader a prompt | low |
| 2 | 2.2 One section about the operating context, not two | low |
| 2 | 2.3 §proof comes out, and the nav and stamps come out with it | low |
| 2 | 2.4 The new hero survives a phone | low |
| 3 | 3.1 The register pass, everywhere it shows | low |
| 3 | 3.2 The link preview names the category | low |
| 3 | 3.3 `/llms.txt` becomes an operating brief | low |
| 3 | 3.4 `/methodology` opens on the same category | low |

**Every story is low risk.** Nothing touches money, auth, migrations or shared infra. The one
non-obvious hazard is copy that over-claims, and Sprint 3's gate is procedural: the existing
gate/badge assertions must stay green **without being edited**.

## Deploy order

Sprint 1 → Sprint 2 → Sprint 3, and the order is load-bearing in one place only: **Story 1.1 must
land before anything else names the category**, because everything downstream imports the string it
creates. Sprints 2 and 3 could swap; they do not, because Sprint 2 removes sections that Sprint 3
would otherwise write copy for.

**Sprint 1 ships standalone.** If the appetite is exhausted after it, the highest-priority ask is
live, `/` is unchanged, and nothing is half-built.

## Out of scope

- **The signed-in app.** The category sweep stops at the public surface — the same ruling
  `wave-2026-08-20` made for *Shape → Design*, honoured rather than rediscovered.
- `AGENTS.md`, `WAYS-OF-WORKING.md`, `LEARNINGS.md`, the `groom` skill, the seeds. Internal
  vocabulary is unchanged.
- The six methodology chapters' content. Only the intro is touched (Story 3.4).
- `references/design/assets/tokens.css` — still the byte-mirrored handoff, still not edited.
- Pricing tiers, the payment rail, `SIGNUP_ENABLED`, and every gate's polarity.
- Any new enterprise capability. This epic changes how we speak, not what we have — if a Sprint 3
  sentence needs a capability we do not ship, the sentence is wrong.
- `/hub`'s roadmap and report views, which the §proof deletion must not disturb.

## Sprints

- [`sprint-1.md`](./sprint-1.md) — the workshop earns its URL *(top priority; ships standalone)*
- [`sprint-2.md`](./sprint-2.md) — the landing's structure
- [`sprint-3.md`](./sprint-3.md) — the register, everywhere it shows

## Epic Definition of Done

- [ ] All three sprints merged to `main` and smoke-tested (gaps stated).
- [ ] Each `sprint-N.md` carries a fool-proof smoke walkthrough with real production URLs.
- [ ] This README marked ✅ complete; every sprint status ticked with commit refs.
- [ ] `RETROSPECTIVE.md` written.
- [ ] Product poster updated — `Roadmap/README.md` feature map + Recent highlights.
- [ ] Landing backfill: `references/landing-end-state.md`'s section map reconciled with the page
      that now exists (two sections fewer).
- [ ] `Roadmap/LEARNINGS.md` updated — at minimum the "borrow the register, not the motion" rule and
      the dead-asset find (`handoffPrompt` shipped, specced and call-site-free for two epics).
- [ ] No kill-switch planned — nothing here is gated, and every change is a copy or composition
      change revertible by a normal revert.
- [ ] Feature branch deleted; PRs merged.
