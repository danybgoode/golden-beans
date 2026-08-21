---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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

## Amendments — the architecture-lock pass, 2026-08-20

Written by the architect before any story started, by reading the shipped code and the two source
PDFs rather than the plan. Each item below is a place the scaffolded plan was **wrong or
incomplete about the live system**. Builders cite these; they do not re-derive them.

### A1. The guide's OpenTable worksheet is a duplicated page. Do not carry it.

Story 1.2 lists *"Spotify and OpenTable worksheets"* among the case studies carried. Checked against
the source: **guide p.22, labelled "Open Table", is a byte-identical copy of the Spotify worksheet on
p.21** — same North Star ("Time spent listening to music by subscribers"), same premium-trial and
songs-per-session inputs, same "monthly subscriptions from premium users" impact. It is a production
error in Amplitude's PDF, not an OpenTable example.

The OpenTable material that is real is **p.19**: the warm-up brief (prompt, product background,
business model — free for diners, restaurants pay a base subscription plus a per-reservation fee).
That is what ships, as the warm-up. **One** completed worksheet is carried — Spotify (p.21) — and it
is named as Spotify.

*Every other page citation in Story 1.2's element map was checked and is correct.*

### A2. Story 2.3's `/llms.txt` check is too narrow to catch the lie it is aimed at

It says the manifest is confirmed to *"name only routes that still exist"*. `/` still exists, so that
check passes — while the manifest's description of it reads *"a live proof section reading the real
synthetic demo project"*, describing a section Story 2.3 has just deleted. The check is therefore on
**every claim the manifest makes about `/`**, not on its route list. Story 3.3 owns the full rewrite;
Story 2.3 owns not shipping a manifest that lies in the interim.

### A3. `/llms.txt` already carries one stale gate claim, and Story 3.3 inherits it

> `Returns 404 while the connector is disabled (CONNECTOR_ENABLED unset — the default until this
> epic's launch story flips it on).`

That launch story shipped; the connector is enabled in production. The parenthetical describes an
unshipped future that is now the past. The 404-while-disabled sentence is true and stays; the
parenthetical goes. Named here so it is a decision rather than a builder's discovery.

### A4. Deleting §proof leaves three prose references behind, in files that survive

`grep`ped rather than assumed (LEARNINGS, *"grep for its siblings"*; CODE-QUALITY #3):

| File | What it says | Disposition |
|---|---|---|
| `components/landing/FinOpsSection.tsx:17` | *"cannot mistake this panel for the live one in §proof"* | Rewrite — the distinction it draws no longer has a second term |
| `components/landing/MakerHero.tsx:48` | *"Further down the page §proof renders a REAL agent window…"* | Goes with the window, in Story 2.1 |
| `app/page.tsx` header comment | The section-order narrative names both `product` and `proof` | Rewrite to the spine that now exists |

`OperatingContextSection.tsx:50`'s user-visible *"the live read of a real tenant is further down, in
Proof"* needs no separate handling — that component is deleted in Story 2.2.

**Verified and NOT a problem:** none of the four deleted components reads a flag. The
`landing-maker-ops` failure mode — a repositioning that drops the only reader of a qualifier — does
not apply here, and that was checked rather than hoped.

### A5. Retiring the stamps breaks a browser spec that Sprint 2 does not name

`e2e/landing.browser.spec.ts` → *"section dividers carry a legible numbered stamp"* asserts
`stamps.first()` is visible, that there are **at least two**, and that the first reads `1`. With both
call sites gone it fails outright. The `browser` project **is not in the blocking gate**, so nothing
would have caught this before a manual run (LEARNINGS: *a deletion-heavy epic silently invalidates a
suite no pipeline runs*).

**The ruling:** the spec retires with the device. Loosening its floor to zero would leave a test that
cannot fail (CODE-QUALITY #5), which is worse than deleting it. Its **last** assertion is not about
dividers and must survive — `expect(body).not.toMatch(/[①-⓿]/)`, the enclosed-numeral guard from
`landing-frijoles-rebrand` — so it moves into a test that still has a subject.

### A6. Story 3.2's "metadata spec" does not exist and must be written

There is no spec anywhere in `e2e/` asserting `app/layout.tsx`'s `TITLE`/`DESCRIPTION`. Story 3.2's
QA line reads as though one is being extended. It is **new**, and it must be observed failing.

### A7. The hero's second prompt card contradicts a live assertion *and* its comment

`e2e/landing.browser.spec.ts:16` asserts `.prompt-card` has **exactly one** match, under a comment
that argues the epic's D5 in reverse: *"ONE copy-a-prompt block, not two."* Story 2.1 adds the
second. Changing the count and leaving the comment would ship a rationale for the opposite of what
the code does — the exact defect three review rounds found in `flags-visual-rule-builder`. **Both
change, in Story 2.1, and the comment cites D5** for why two blocks asking different questions is
not the pattern `landing-readability-pass` D1 refused.

### A8. `.app-shell` is the SIGNED-IN product's class. Do not sweep it.

Deleting markup obliges a stylesheet sweep of the classes it used (LEARNINGS, 2026-08-20). Applied
naively here it breaks `/app`: `.app-shell` is used by `components/product/ProductShell.tsx`,
`CommandCenter`, `AgentRail` and six authed specs — `OperatingContextSection` was only borrowing it.

**Safe to sweep** (single call site, landing-only, verified by grep over `.tsx`): `baglabel`,
`roundstamp`, `netwt`, `hero-magic`, `hero-window`, `proof-stack`, `operating-nav`, `operating-body`,
`trend--*`, `lift--*`, `divider__stamp`.
**Not safe:** `.app-shell`, `.app-bar`, and anything `components/ui/` renders. Check each class for a
non-landing user **before** deleting its rule, and render the page after.

### A9. Routing and review, stated so the choice is auditable

Every sprint is built by the coordinating agent (Claude Opus 5) in the root checkout on a stacked
branch. **No builder subagents were dispatched** — the epic's judgment-heavy half is Sprint 1's
workshop, which depends on two source PDFs that a cold subagent cannot read, and Sprint 2's edits
turned out to carry the four spec traps above, which a locked contract can name but a mechanical
builder would resolve permissively. Review is the LOW-tier policy from `WAYS-OF-WORKING.md`: **two
cross-family external passes per PR via `scripts/review-route.mjs`, and no reviewer subagents.**

### A10. The attribution and the one-host pin conflicted. The pin was widened, by decision.

Found while building Story 1.2, raised **Blocking twice** by Codex in PR #111, and **amended by the
product owner on 2026-08-20.** Recorded in full because it is the one place this epic changed a
safety assertion.

**The conflict.** Story 1.2 requires the framework *"credited by name with a link"*. The pinned
property beside it required *"exactly one host in the body"*, enforced by
`e2e/northstar-self-serve.spec.ts` counting `https?://` matches. A Markdown hyperlink to Amplitude
is a second host. Both could not hold as literally written.

**The first answer was wrong, and review was right to keep pushing.** The citation initially shipped
scheme-less — complete, findable, and not a hyperlink. That preserved the assertion by degrading the
criterion, and it is the kind of trade a builder makes because it is the one that needs no
permission. LEARNINGS' rule applies exactly: *a reviewer repeating a finding you reasoned your way
out of is a signal to find a third option.*

**The third option, and why it is not a relaxation.** The old assertion counted hosts and required
the count to be 1. That was a **proxy** for the property it defends — every absolute URL in this
document is built by `getSiteUrl()` and never a hardcoded wrong-environment literal — and a count
cannot tell you *which* host it found. The assertion now states the property directly:

> every `https://` host in the body is either **this deployment's** or a member of a short, explicit
> `CITATION_HOSTS` allow-list.

That is **stricter** than the count it replaces, and it is why adding a link weakened nothing.
Confirmed by mutation, not by argument: replacing `${siteUrl}/install` with a hardcoded foreign host
turns it red, and dropping the hyperlink back to bare text turns the attribution test red.

**The cost, stated rather than glossed.** This is the only edit to the four tests that predate this
epic, so "all four green, unedited" is no longer the whole mutation-check on the rewrite. Three of
the four remain untouched and green; the fourth was edited deliberately, with the reason in the spec
itself, and its replacement was mutation-checked in both directions.

**Both candidate paths were fetched before this shipped.** `amplitude.com/resources/north-star-playbook`
returns **200** and is what ships. `amplitude.com/north-star-playbook` — the obvious guess, and what
an unchecked citation would have used — returns **404**. A public surface citing a dead link is
worse than one citing none.


### A11. Third-party source material is cited and mapped, never committed

*Raised by Codex in review of PR #111, and correct.*

Story 1.2's first move said to "land the guide in `references/`". It was, and it should not have
been: *Running Your North Star Workshop* and *The North Star Playbook* are Amplitude's gated
marketing assets. Committing a copy into this repository is **redistribution we have no permission
for**, and a licence question is not something a copy sprint gets to answer by not asking it.

**What ships instead:** `references/northstar-sources.md`, a page-level map from every element of
the shipped document back to the page of the source it came from. That is what a reviewer actually
needs — it makes each claim checkable by anyone holding a legitimate copy — and it carries no
licence question and no 1 MB binary that nothing in the build reads.

`references/northstar-workshop-skill.md` **is** committed: it is the product owner's own
facilitation skill, which is ours to keep.

**The general rule, since this will come up again:** cite third-party material by title, author and
page, and record the map. Do not vendor the artefact. The provenance requirement was always about
the claims being checkable, not about the bytes being present.

### A12. There is no "elsewhere" — Sprint 2 removes the LAST framed window, and the guard retires with it

Story 2.1 says the framed-window assertion *"stays — it is now vacuously true of the hero and still
meaningful elsewhere"*. **There is no elsewhere.** After this sprint nothing under
`components/landing/` renders `AgentWindow`: the hero's illustration, §product's app-shell picture
and §proof's live read were the only three, and all three go.

The guard's floor is `count > 0`, so it **failed** rather than passing vacuously — which is the
honest outcome, and is how this was found rather than shipped.

**Ruling, identical to A5:** the guard is deleted, not floored at zero. A test that cannot fail is
worse than no test. It is recorded in the file as *unemployed rather than obsolete* — if an
illustrated frame ever returns to this page, the guard returns with it, because the failure it
prevents (a page labelling an invented conversation as though it were live) is one this page has
actually shipped.

**Consequences handled in the same commit:**

- `components/landing/SurfaceNote.tsx` is deleted. Its entire contract was labelling a landing
  illustration, and there are none left.
- `AgentWindow` / `ChatThread` / `ContextCard` are **kept**, and this is a deliberate difference.
  They live in `components/ui/`, which is a component *kit* — `app-component-kit-adoption` is a
  whole epic about growing its use — and an unused kit primitive is inventory, not dead code.
  Deleting kit components because one page stopped using them is a different decision from the one
  this epic was bet on.
- Two comments in those primitives referenced `SurfaceNote` in the present tense and now say what
  actually happened (CODE-QUALITY #3).

**Stated gap, so it gets scheduled rather than assumed** (LEARNINGS, 2026-08-07): three kit
primitives now have zero call sites anywhere in the app. That is visible and named here; it is not
this epic's to resolve.

### A13. `SITE_URL` is Production-only, so a PREVIEW renders every prompt as `localhost:3000`

*Found by Codex persisting on PR #113 after the comment it first objected to had been fixed. The
repeated finding was pointing at something bigger than the comment (LEARNINGS: a reviewer repeating
a finding is a signal to look again).*

**Verified against the live project, not inferred:** `vercel env ls` shows exactly one `SITE_URL`,
scoped to **Production**. `getSiteUrl()` reads `SITE_URL` and otherwise returns
`http://localhost:3000` — deliberately, because AGENTS rule #5 forbids a Host-header fallback.

**Therefore, on any preview deployment:**

- the hero's copied handoff prompt tells the reader's agent to read `http://localhost:3000/llms.txt`;
- `/northstar-self-serve.md` hands out `http://localhost:3000/install`;
- and the one-host spec still passes, because everything is consistently *the wrong* host.

**This changes an owed verification.** Sprint 1's Story 1.4 asks the product owner to run the
workshop end-to-end **"pointed at the preview URL"**. As things stand that cannot work: the
preview's own document points the agent at the tester's localhost. **Story 1.4 must be run against
production after merge**, and its acceptance is corrected to say so.

**Not fixed inside this epic, deliberately.** The three options each cost more than a copy sprint
should spend, and the choice is the product owner's:

1. **Run the verification on production after merge** — free, and what this epic assumes. Chosen.
2. **Set a Preview-scoped `SITE_URL`** — one env var, but a *static* value cannot match a
   per-branch preview hostname, so it would be right for one preview and wrong for the rest.
3. **Teach `getSiteUrl()` about `VERCEL_URL`** — the correct long-term answer, and genuinely safe
   (a platform-provided env var is not a request Host header, so rule #5 is not weakened). But
   `getSiteUrl()` is the seam behind *every* absolute URL in the app — the install page's connector
   URL, `metadataBase`, the sitemap, `robots.txt` — and changing it is a shared-surface decision
   with its own review, not a line in a copy PR.

**Recommendation: option 3, as its own small epic.** Flagged for Daniel by name at epic close.

> ### ✅ RESOLVED 2026-08-20 — [`site-url-preview-aware`](../../09-platform-infra/site-url-preview-aware/README.md)
>
> Option 3 was built and shipped ([PR #116](https://github.com/danybgoode/golden-beans/pull/116)).
> `getSiteUrl()` now derives a preview's own hostname from `VERCEL_BRANCH_URL`, verified by fetching
> a real preview. `SITE_URL` still wins, so production is unaffected — re-checked after merge.
>
> **The correction this makes to Story 1.4 stands anyway:** that verification was moved to
> production-after-merge and is still owed there, because the workshop is now live in production and
> that is where Daniel will run it. A future epic's owed preview verification, however, can now
> actually happen on a preview.

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

- [x] All three sprints merged to `main` and smoke-tested (gaps stated).
- [x] Each `sprint-N.md` carries a fool-proof smoke walkthrough with real production URLs.
- [x] This README marked ✅ complete; every sprint status ticked with commit refs.
- [x] `RETROSPECTIVE.md` written.
- [x] Product poster updated — `Roadmap/README.md` feature map + Recent highlights.
- [x] Landing backfill: `references/landing-end-state.md`'s section map reconciled with the page
      that now exists (two sections fewer).
- [x] `Roadmap/LEARNINGS.md` updated — the "borrow the register, not the motion" rule and the
      dead-asset find (`handoffPrompt` shipped, specced and call-site-free for two epics), plus the
      scoped-review, scripted-prune and `git checkout` lessons this epic paid for.
- [x] No kill-switch planned — nothing here is gated, and every change is a copy or composition
      change revertible by a normal revert.
- [x] Feature branches deleted; PRs merged.

**Owed, and named rather than closed:** Story 1.4's end-to-end agent run, to Daniel by name, against
**production** (epic A13). Recorded in `sprint-1.md`'s smoke walkthrough as step 7.

---

## ✅ Complete — shipped 2026-08-20

Live at <https://goldenfrijoles.com>. Three sprints, 12 stories, 13 amendments, three production
deploys, 19 cross-family review rounds. See [`RETROSPECTIVE.md`](./RETROSPECTIVE.md).
