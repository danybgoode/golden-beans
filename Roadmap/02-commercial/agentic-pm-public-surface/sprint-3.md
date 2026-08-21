# Agentic PM public surface — Sprint 3: The register, everywhere it shows

**Status:** ✅ shipped — [`c37fafe`](https://github.com/danybgoode/golden-beans/pull/114)

> **Build contract.** Copy only. No component is added or deleted, no gate is read differently, no
> capability claim changes. Every surface a stranger reads takes the same register and names the
> same category.
>
> Read the epic README's **D1** (enterprise scope, maker scale — with the table of which idea lands
> where), **D2** (the category string comes from `lib/positioning.ts`) and **D7** (what `/llms.txt`
> becomes) before starting.
>
> **The gate this sprint lives under, and it is the whole safety property:** the existing gate and
> badge assertions must stay green **without being edited**. If a copy change requires loosening an
> honesty assertion, the assertion is catching an over-claim — change the copy, not the test.
> Thirteen review rounds of this repo's history are behind that rule.

## Build contract (locked by the architect before the builder started)

**The whole-sprint gate is procedural and it is the safety property:** every pre-existing gate,
badge and vocabulary assertion goes green **without being edited**. An edit to one of those tests in
this sprint's diff is a review stop. If a copy change needs an honesty assertion loosened, the
assertion is catching an over-claim — change the copy.

**Story 3.2's metadata spec does not exist yet — write it** (A6). The QA line reads as though one is
being extended. It is new, and it must be observed failing before it is believed.

**`/llms.txt` carries one stale gate claim to retire** (A3): the `CONNECTOR_ENABLED` parenthetical
describes a launch that already happened. The 404-while-disabled sentence itself is true and stays.

**The category string is imported from `lib/positioning.ts` on every surface.** Retyping it on the
fifth surface is the defect D2 exists to prevent, and a spec asserts the surfaces agree.

**Take the diagnosis, write the line yourself.** A copy reviewer's *findings* and its *suggested
replacements* are worth very different amounts (LEARNINGS, 2026-08-19) — every suggested line in that
epic was unusable, and one invented a capability in the section whose whole point is that nothing is
built.


## Stories

### Story 3.1 — The register pass, everywhere it shows
**As a** reader deciding whether this is a serious product, **I want** the page to sound like one,
**so that** I take the claim seriously enough to test it.

**Acceptance — per epic D1's table:**
- **§hero** sub-copy carries *move fast* and *future-proof as models evolve*, and the category
  definition from `lib/positioning.ts` appears once, where it cannot be missed (the `.micro` line or
  the eyebrow — builder's call, one place only).
- **§ops** carries *the broad product surface, owned by one person*: identity and access,
  governance, security, spend control and admin tooling named as things a maker holds — never as an
  enterprise admin console for other people's employees.
- **§authority** carries *governance and control over policy, without a department*. Its gated
  cards, badges and `gatedDrillNote` are untouched.
- **§finops** carries *spend control and unit economics*. Its "not built" badge and its
  "illustrative product direction" line are untouched — this is the one section on the page
  describing something that does not exist, and it must keep saying so.
- **§methodology** carries *high product taste* and *the difference between something that demos
  well and something that holds up in production*. Its chapter list stays derived from
  `lib/methodology-chapters.ts` — do not fork it into copy.
- **§pricing** and **§start** carry *no lock-in* and *you bring the agent*.
- **Forbidden vocabulary, enforced by review:** procurement, RFP, security questionnaire, seat
  expansion, "the world's largest organizations", "enterprise-wide contract", anything implying a
  sales team. Epic D1 has the full leave-behind list.
- `scripts/check-design-drift.mjs` D7 passes — every new heading is a title, not a sentence.
**Risk:** low
**QA:** `check-design-drift.mjs` + a full browser read-through; **all existing gate/badge assertions
green unedited**

### Story 3.2 — The link preview names the category
**As** someone who sees the link before the page, **I want** the preview to tell me what this is,
**so that** I know whether to click.

**Acceptance:**
- `app/layout.tsx`'s `TITLE` and `DESCRIPTION` name the category, sourced from
  `lib/positioning.ts`.
- **The inherited constraint, which took three review rounds to settle and must not be
  re-litigated:** the description names **NO capability**. A link preview travels *without* the
  qualification the page carries, and gate state is per-deployment while this string is baked
  per-build. Any capability named here is a claim a flag flip can falsify and the preview cannot
  qualify. Describe the shape; let the page describe the capabilities, where it can read the gates.
- `app/opengraph-image.tsx`'s `alt` and any copy rendered into the card follow the same rule.
- `metadataBase` and every absolute URL still come from `getSiteUrl()`. No hardcoded host appears.
**Risk:** low
**QA:** metadata spec — assert the category string is present and that the description matches
`positioning.test.ts`'s "names no capability" rule

### Story 3.3 — `/llms.txt` becomes an operating brief
**As an** agent someone sent to this manifest, **I want** to know how to help the person who sent
me, **so that** I am useful before I have read anything else.

**Acceptance — the file keeps its route map and gains three things:**
1. **A positioning paragraph** — what Golden Frijoles is, in the D1 register, naming the category
   from `lib/positioning.ts`.
2. **"If someone has just arrived, ask these"** — four or five diagnostic questions to put to a
   practitioner before recommending anything. Seed set, to be sharpened in the writing: what are you
   building · what decides your roadmap today · where does context get lost between you and your
   agent · what would you have to stop guessing about · is there a goal your team actually agrees on.
3. **A plain-language rule** — answer in short sentences; do not use our vocabulary (Bets, TARS,
   inputs) until the person has a reason to care about it; say "I don't know" rather than infer a
   capability.
- The route map is corrected for the page that now exists: §proof and §product are gone (Sprint 2),
  `/methodology` and `/methodology/edition.md` stay, `/northstar-self-serve.md` is described as what
  Sprint 1 made it rather than as a generic script.
- The existing honesty guardrail is inherited **verbatim**: *this manifest lists only what is live in
  this deployment right now.*
- Every absolute URL from `getSiteUrl()`; exactly one host in the body.
**Risk:** low
**QA:** `e2e/llms-txt.spec.ts` — existing host and capability pins stay green unedited; new
assertions for the diagnostic questions, the plain-language rule and the category string

### Story 3.4 — `/methodology` opens on the same category
**As a** reader arriving at the methodology, **I want** it to open on the category the landing named,
**so that** the two pages are about one thing.

**Acceptance:**
- The `/methodology` intro copy names the category from `lib/positioning.ts`.
- **Nothing else on that route moves.** The six chapters, their content, `Consider · Operate · Exit`,
  the phase vocabulary and `lib/methodology-chapters.ts` are all untouched.
- `e2e/methodology-vocabulary.spec.ts` and `methodology-vocabulary.browser.spec.ts` stay green
  **unedited** — they are the guard that this story stayed in its lane.
- `/methodology/edition.md` regenerates from the same source and carries the same opening.
**Risk:** low
**QA:** `e2e/methodology-vocabulary.spec.ts` + `methodology-agent-readable.spec.ts` green unedited

## Sprint QA

- **The whole-sprint gate:** every pre-existing gate, badge and vocabulary assertion green
  **without being edited**. An edit to one of those tests in this sprint's diff is a review stop.
- `scripts/check-design-drift.mjs`.
- `e2e/llms-txt.spec.ts` (extended), metadata spec (extended).
- A browser read-through of `/` at desktop and phone width — this sprint's real failure mode is
  copy that reads worse than what it replaced, and no spec catches that.
- Deterministic gate: `tsc` + `build` + Playwright `api` project.

## Smoke walkthrough

Real production URLs. All steps run and recorded green.

1. Open <https://goldenfrijoles.com/>.
   → Directly under the headline, in mono: *"Agentic product management: the whole product
   discipline — decide, build, prove, grow — run by one person and their agents, on rails that keep
   the evidence honest."*
2. Count visible occurrences of that sentence on the page.
   → **exactly 1**. (Verified in a real browser against production, not by grepping HTML — the raw
   response contains a second copy in Next's RSC payload, which no reader sees.)
3. Read the browser tab title.
   → `Golden Frijoles — agentic product management`.
4. Read §ops, §authority, §finops, §methodology, §pricing, §start.
   → identity/governance/security/spend named as things a maker holds · governance without a
   department · spend control with the "not built" badge **still there** · taste and demos-well-vs-
   holds-up · no lock-in · you bring the agent.
5. `curl -s https://goldenfrijoles.com/ | grep -Ei 'procurement|RFP|seat expansion|enterprise-wide'`
   → no match. The register was borrowed; the motion was not.
6. **`curl -s https://goldenfrijoles.com/llms.txt` and read it as an agent would** — this is the one
   surface no human will notice is wrong.
   → It opens on the category definition, then *"What this is, in plain language"*, then
   *"If someone has just arrived, ask these before recommending anything"* with five diagnostic
   questions, then *"How to talk about this"* with the plain-language rule. The route map lists only
   routes that exist, and it still closes with
   *"This manifest lists only what is live in this deployment right now."*
7. Confirm the manifest's connector entry.
   → describes **two independent kill switches**, not a single flag, and no longer refers to a
   launch story that shipped two epics ago.
8. Open <https://goldenfrijoles.com/methodology>.
   → Opens on the same definition, word for word. The six chapters, Consider · Operate · Exit and
   the phase vocabulary are unchanged.
