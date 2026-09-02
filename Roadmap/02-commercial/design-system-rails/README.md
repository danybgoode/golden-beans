---
status: in-progress # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: design-system-rails
build_order: 26      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: One design system, every surface — the rails that make a design outlive an epic

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/design-system-rails.md`](../../00-ideas/seeds/design-system-rails.md)
> **Appetite:** L (multi-wave — re-bet at each wave boundary) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.2, §2.3, §6.7, §7 (P0), §10.5.
> **Design — APPROVED, 32 states:** [`apps/web/design-system/console-prototype.html`](design/console-prototype.html) · [`apps/web/design-system/APPROVED.md`](design/APPROVED.md) · [`apps/web/design-system/render-reference.mjs`](design/render-reference.mjs) — **moved to `apps/web/design-system/` by Story 1.1.** Nine states inherited from [`../console-ia-overhaul/design/CONSOLE-CONTRACT.md`](../console-ia-overhaul/design/CONSOLE-CONTRACT.md), twenty-three added and approved 2026-08-29.
> **Finishes:** `console-ia-overhaul` (#25) — whose retrospective names the visual result as the thing it got wrong.
> **Builds on:** `design-system-lift` (#9), `app-shell-and-agent-rail` (#12), `app-component-kit-adoption` (#13) — their tokens, shell and component kit are extended, never rewritten.

## Why

**The last epic shipped a correct information architecture and a rejected visual result.** Its own
`CONSOLE-CONTRACT.md` opens by saying why: every acceptance criterion in Sprints 1–2 was
*structural* — *"the header renders one project switcher and four sections"* — the build satisfied
**all** of them, and it looked like a different product. A builder cannot hit a visual target
described in prose, and nothing in the plan could go red on a page that looked wrong.

That is not this epic's premise, though. It is the *symptom*. The premise is one level down:

> **The design has no home that outlives the work that produced it.** The approved prototype, the
> contract, the reference renders and the extracted CSS all live in
> `Roadmap/02-commercial/console-ia-overhaul/design/` — a folder named after an epic now marked
> `shipped`. Nothing in it describes `/hub`, `/login`, Experiments, Journeys, Tasks, Scenarios,
> Destinations or Shares. The next epic opens its own `design/` folder, and the cycle restarts.

Three prior design epics ended the same way. `design-system-lift` (#9) produced the brand.
`app-component-kit-adoption` (#13) swept routes onto a component kit. `app-shell-and-agent-rail`
(#12) built the shell. Each was correct, each shipped, and **each scoped its design to itself** —
which is why the audit could still find *one route in twenty-six* using the component kit, and why
`console-ia-overhaul` had to re-derive a visual contract from scratch eleven build-orders later.

**The outcome, stated as the test it must pass.** Today, exactly one route in the product can fail
CI on the way it looks, and the design that route is measured against lives in a closed epic's
folder. **When this epic is done, all 29 in-scope routes render from one design system in
`apps/web/design-system/`, each has an approved reference state derived from that system, the
visual gate is blocking for all of them, and coverage is a generated number that cannot go down.**

## Platform-first note

**No new table, no new SQL, no new auth boundary, and no IA change.** Every route keeps the gate it
has today. The four sections, the per-feature destination and `⌘K` are inherited from
`console-ia-overhaul` and are not revisited. The palette is already loaded in the signed-in app —
`globals.css` imports `references/design/assets/tokens.css` first, and the drift guard asserts that
import. The coverage manifest **imports** `lib/project-route-inventory.ts` and is welded to it by a
test; it adds no second list of surfaces (**D5-b** — the inventory holds 14 surfaces and this epic
covers 29 routes, so "extends" was the wrong verb).

Two things this epic **does** add to shared surface, both architect-owned and both done first:

1. **A new source directory**, `apps/web/design-system/`, which every route will import. It is a
   child of `apps/web`, so `@/design-system/…` already resolves — **D1**.
2. **New CI guard RULES** — not new swept directories.
   ⚠️ **CORRECTED at the lock (D11-1).** This paragraph used to say the guard would be *"extended to
   `components/ui` and `components/product`, the two directories the audit named (§10.5) as its
   blind spot"*. `SWEPT_ROOTS` in `scripts/check-design-drift.mjs` **already contains both**, plus
   `components/brand` and `components/methodology` — `app-shell-and-agent-rail` S1.4 closed that gap
   before this epic was scaffolded. What the guard genuinely does not have is a rule for the
   `font:` shorthand (**D3**), a sweep of `design-system/*.css` beyond the single `globals.css`
   raw-hex pass, and the `.ds` namespace check. Story 1.3 builds those.

Per AGENTS rule #1 every read stays on existing `lib/` seams. Per rule #2 `/install` keeps serving
the demo project's token — it is a public route and that is correct.

## What already exists (reuse, don't rebuild)

**Golden — move or use directly, do not rebuild:**

- `Roadmap/02-commercial/console-ia-overhaul/design/` — `flags-console-prototype.html` (the approved
  language), `console-reference.css` (its stylesheet, extracted verbatim), `CONSOLE-CONTRACT.md`,
  `measure-contract.mjs`, `render-reference.mjs`, `_harness.mjs`. **All three scripts verified
  running 2026-08-29.** Story 1.1 *moves* this; nothing here is re-authored.
- `references/design/assets/tokens.css` — imported first by `apps/web/app/globals.css`; the drift
  guard asserts that import. The palette is already in the signed-in app.
- `apps/web/components/ui/` — `Panel`, `Button`, `Badge`, `Icon`, `DataTable`, `StatCard`,
  `FunnelBars`, `RolloutBar`, `ConfirmDialog`, `ActivityFeedItem`, `FormSection`, `AgentWindow`,
  `ContextCard`, `ChatThread`, `SectionDivider`. Audit §2.2: *"the primitives already exist and are
  reasonably built. The work is mostly adoption and a handful of new primitives."*
- `apps/web/components/product/` — `ProductShell`, `ConsoleRail`, `CommandPalette`, `CommandCenter`,
  `AgentRail`, `RailDisclosure`, `ShellErrorBoundary`, `SignOutButton`.
- `apps/web/lib/project-route-inventory.ts` — every surface with label, audience, gate, description,
  unit-tested. The coverage manifest and the rail's icon field both extend **this one list**.
- `apps/web/lib/flags.ts` — 20+ `=== 'true'` gates and its own 17 comments on polarity and *set ≠
  live*. `CONSOLE_SHELL_ENABLED` is the direct precedent for D6's flag and its mid-epic flip.
- `apps/web/app/app/flags/[projectSlug]/flag-vocabulary.ts` — the one module owning user-facing flag
  words. The product vocabulary **generalises** this; it does not replace it.
- `apps/web/e2e/console-visual.authed.spec.ts` — the existing visual gate and the shape the
  manifest-driven one grows from. Its five deferred rows are named with reasons.
- `scripts/check-design-drift.mjs` + `.github/workflows/design-drift-guard.yml` +
  `.githooks/pre-commit` — a working, wired guard against raw hex, inline styles and pictographs.
- `references/ux-guidelines.md` — the behaviour layer, including the full state taxonomy. **Drafted
  2026-07-23, never applied to a primitive.** Sprint 2 is largely this document, executed.

**Design — the contract.** The approved prototype and `CONSOLE-CONTRACT.md` are **binding for every
signed-in route**, per `console-ia-overhaul` A22. That epic's withdrawal of *"a reference end-state
is inspiration, never signed-off scope"* is generalised here into a WAYS-OF-WORKING amendment
(Story 1.0), so the next epic inherits the correction instead of rediscovering it.

## The design is approved, and committed — read this before D1–D13

⚠️ **AMENDED 2026-08-29, after the epic was scaffolded.** As scaffolded, this epic pushed the
*production* of the remaining mockups into Sprints 4–6, as builder work. The product owner named the
consequence exactly: a builder shows twenty-three unreviewed screens deep into an expensive run, and
the answer is no. **Designing is the planning lane's job, and it is done.**

**All 32 states are designed, approved and committed** — `apps/web/design-system/console-prototype.html`, with
`apps/web/design-system/APPROVED.md` recording the approval, its content hash, and five design decisions
(**DD1–DD5**) that the architecture lock **does not reopen**: where Tasks lives, where the hub sits,
the three-frame rule, the computed chart-colour rules, and one-design-two-mounts. Every story in
Sprints 2–6 now cites a state id instead of a sentence.

```bash
node apps/web/design-system/render-reference.mjs   # 32 states, verified
```

`apps/web/design-system/APPROVED.md` also carries **three findings for the lock to settle** — F1: the approved design
uses `↗`, a glyph `check-design-drift.mjs` bans inside `/app`. F2: `/s/[token]` has no expired state
by design, which corrected `sprint-6.md`. F3: one epic has no `build_order`, so the sequence runs to
26 across 27 epics.

## Decisions — 🔒 LOCKED 2026-08-29

> Locked against the live code on `main` (`7e43414`), the live production database
> (`slweidgffcfndnskcskc`) and the live Vercel environment. **Builders cite these; they never
> re-derive one.**

> **Every row below was verified by running something**, not by reading the plan. Where the scaffold
> described a guard, a table, a constant or a flag state the live system does not have, the scaffold
> is corrected here **out loud** and the correction carries its evidence. Five of the eight scaffolded
> decisions came back changed, and five new ones (**D9–D13**) exist because the verification found
> them. That is the outcome this pass is for.
>
> A builder that finds a locked decision inconvenient **escalates**; it does not widen one because a
> paraphrase read permissively.

### D1 — `apps/web/design-system/` is the single source of truth. 🔒 **Locked, with the seam corrected.**

**The import question is a non-question, and the scaffold's wording hid that.** `design-system/` is
a **child of `apps/web`**, not a sibling of it. `apps/web/tsconfig.json` sets
`paths: { "@/*": ["./*"] }` with `include: ["**/*.ts", "**/*.tsx"]` rooted at `apps/web`, so
`@/design-system/…` resolves today with **no tsconfig change and no `next.config.ts` change**.
Nothing about D1's first half needs a decision.

**Its second half is disproved.** *"the prototype's harness can import the same modules outside
Next's bundler"* — it cannot. `_harness.mjs` is plain Node ESM run by `node`; CI pins Node 22, which
strips no types from `.tsx` and resolves no `@/` alias. The prototype will never render from the
app's TypeScript.

🔒 **Locked seam: the shared artefact is CSS, not TypeScript.**

| Layer | Home | Consumed by |
|---|---|---|
| Tokens + primitive styles | `apps/web/design-system/*.css` — **generated from the prototype** | `app/layout.tsx` (and `console.css`) |
| Components | `apps/web/design-system/*.tsx` | the app only |
| The approved states | `apps/web/design-system/console-prototype.html` | `render-reference.mjs`, `measure-contract.mjs` |

**Markup parity is enforced by the measured contract (D8) and the visual gate (D5), never by shared
code.** Porting stops existing for *style*, which is where every previous port drifted. Claiming it
stops existing for *markup* would be a promise the toolchain cannot keep.

> #### ⚠️ D1/D2 amendment, 2026-08-29 — **generation runs prototype → product, not the reverse**
>
> The lock as first written said `_harness.mjs` would inline `design-system/*.css` into the
> prototype wrapper, so one stylesheet literally painted both. **That is rejected, and the reason is
> `APPROVED.md`.**
>
> Making the prototype consume a shared stylesheet means editing `console-prototype.html`, which
> changes its **content hash** — and `APPROVED.md` states that a changed hash with no new approval
> line means *the design is unapproved*. That file exists specifically to stop *"edit the prototype
> and quietly leave the hash alone"*. Building the epic's first story by doing the one thing its own
> approval record forbids would have been a poor start.
>
> **So the prototype stays byte-for-byte as Daniel approved it** (`5bc7e24ed5e3d0aa`, re-verified
> 2026-08-29), and `extract-css.mjs` **generates** `tokens.css`, `reference.css` and `tokens.ts`
> from it under a do-not-hand-edit header, with `--check` in CI failing on any diff. *"One
> definition"* then holds **by construction** rather than by discipline — strictly stronger than
> what the original wording bought.
>
> One transformation is applied on the way out, and it is a **table** rather than a `replace()`
> buried in a pipeline: `FONT_STACK_OVERRIDES` puts `var(--font-sans)` / `var(--font-mono)` ahead of
> the prototype's literal families, because `next/font` generates a hashed family name at build time
> that a `file://` prototype cannot have. `tokens.test.ts` asserts that the keys of that table are
> the **only** permitted differences between the prototype's `:root` and the generated `tokens.css`.
> A transformation nothing can enumerate is indistinguishable from a bug.

### D2 — One token file. 🔒 **Locked, and the scaffolded "collapse to one" is DISPROVED. Three findings.**

All three sets were diffed, and the diff is the deliverable D2 asked for.

**Finding D2-a — the prototype and the console already agree, exactly.** `console-prototype.html`'s
inlined `:root` and `console.css`'s `.is-console` block define the same 18 colour tokens with the
same 18 values, plus `--r`, `--r-lg`, `--shadow`, `--shadow-hi`, `--t`. There is nothing to
reconcile between those two.

**Finding D2-b — `--roast-2` has two live values, and both are on screen.**

| Token | `references/design/assets/tokens.css` | prototype + `console.css` |
|---|---|---|
| `--roast-2` | `#221b13` — the landing's alternating band | `#1c1710` — the console's |

`.is-console` is a class, so it outranks `tokens.css`'s bare `:root`: the landing paints `#221b13`
and the console paints `#1c1710` **today**. A silent merge would have changed the landing.

**Finding D2-c — two shipped claims that the design "introduced no new colours" are false.**
`console.css`'s token comment says the tokens are `tokens.css` *"verbatim — the design introduced no
new colours"*, and `CONSOLE-CONTRACT.md` says *"Every colour comes from
`references/design/assets/tokens.css`; the prototype introduced no new ones."* `tokens.css` does not
define **`--card-2` `--card-3` `--line-soft` `--green-deep` `--red-deep`** (five colours) or
**`--r` `--r-lg` `--shadow` `--shadow-hi` `--t`** (five more tokens). It also spells one of them
differently: `--green-stamp: #2c5e22` there is `--green-deep: #2c5e22` here — one value, two names.
Both comments are corrected in Story 1.2.

🔒 **Locked — one *definition* per token, not one *file* for the product.** `tokens.css` is not a
token file: it is the landing's stylesheet, carrying the kraft/foil/brass families, ~60 component
classes (`.btn`, `.tag`, `.panel`, `.note`, `.funnel`, …) and the `* { margin: 0 }` reset, and
`check-design-drift.mjs` asserts `globals.css` imports it **first**. Collapsing the console's set
into it would put console tokens on the landing and change `--roast-2`.

1. `references/design/assets/tokens.css` — **untouched.** Brand + landing. Still imported first.
2. `apps/web/design-system/tokens.css` — the **one** definition of the product token set, declared
   on the `.ds` scope root (D3) and **generated from the approved prototype's `:root`** (see the
   D1/D2 amendment above). It replaces `console.css`'s `.is-console` token block. The prototype
   itself is not edited — CI's `extract-css.mjs --check` is what makes drift between them
   impossible.
3. `--roast-2` is a **recorded fork**, documented at its declaration, not renamed — every consumer
   already writes `var(--roast-2)` and renaming would touch more code than the fork is worth.

🔒 **"Deleting a token breaks its consumers at BUILD time" — corrected.** A CSS custom property
cannot do that; an undefined `var()` renders as nothing at paint time. Delivered instead as:
`design-system/tokens.ts` exports the names as a closed union (so every **TypeScript** consumer
breaks at `tsc`), and `design-system/tokens.test.ts` parses all three stylesheets and fails when
(a) a name in the TS module has no CSS declaration or vice versa, or (b) any name is declared twice
with different values **without a row in an explicit `FORKED_TOKENS` allow-list** — which
`--roast-2` is, with its reason. Stated plainly: a raw `var(--typo)` in a `.css` file is still not
compile-checked. The test is what covers CSS, and it is the honest half of this criterion.

### D3 — The design system's classes are namespaced. 🔒 **Locked: prefix `ds-`, scope root `.ds`.**

Verified free: **zero** occurrences of `ds-` or `.ds` in `globals.css`, `console.css`, `tokens.css`
or `hub.module.css`, and none in any `className`. The collision risk it prevents is not theoretical —
`.row` is already declared by both `tokens.css` (`.baglabel .row`) and `console.css` (`.row`), and
landing rules reached the console through `.tag` and `.note` three times in one epic.

`console.css` argues the opposite — that keeping the prototype's bare names (`.topbar`, `.rail`,
`.answer`) is what lets the port be diffed against its source forever. That argument is answered
rather than overruled: **the prototype is namespaced too.** `design-system/tokens.css` and the
primitive sheet are the *same bytes* in both, so `.ds-rail` in the product and `.ds-rail` in the
prototype are still line-comparable — and now nothing outside `.ds` can reach either.

🔒 The `font:` **shorthand trap** is covered by a new drift-guard rule, not by prose: `font:` resets
family, weight, style, size, line-height and variant, so an override that restates only `font-size`
leaves the rest at the shorthand's values. The rule flags a `font:` shorthand inside any
`design-system/*.css` file. Story 1.2 observes it failing on a planted shorthand first.

### D4 — Rail icons are SVG `Icon` components, and `iconKey` is a field on `ProjectSurfaceLink`. 🔒 **Locked, unchanged. F1 answered.**

The ban's exact shape, read from `scripts/check-design-drift.mjs`:

```js
const PICTOGRAPH = /\p{Extended_Pictographic}|[\u2713\u2605\u2197\u2198\u2699]/u   // check, star, NE arrow, SE arrow, gear
const ENCLOSED_ALPHANUMERIC = /[\u2460-\u24FF\u2776-\u2793\u3251-\u32BF]/u
```

applied line-by-line to every `.tsx` under `SWEPT_ROOTS`, which already includes `apps/web/app`.
`components/ui/Icon.tsx` wraps `lucide-react` behind a **closed** `ICON_NAMES` union and is the only
file in the repo that imports it — which is what makes the permitted route a single seam.

🔒 **F1 is answered without touching the rule.** The approved *"Add to Claude ↗"* renders its arrow
as `<Icon name="external" />`; `ExternalLink` is already in the map. **Do not add `↗` to an
exemption list, do not widen `PICTOGRAPH`, do not add a `// eslint-disable`-shaped escape.**

`iconKey` is added to `ProjectSurface`, to the `Pick<>` that builds `ProjectSurfaceLink`, and to the
mapper in `getProjectSurfaceLinks` — three places the compiler names. Because `ICON_NAMES` is a
closed union, an unknown key is a compile error rather than a blank square.

### D5 — The visual gate is driven by the coverage manifest. 🔒 **Locked, with two corrections.**

**Correction D5-a — the gate is in the `authed` project, not `browser`.** `sprint-1.md`'s QA note
and `CONSOLE-CONTRACT.md` §*How the gate works* both say `browser`. `playwright.config.ts` matches
`console-visual.authed.spec.ts` to the **`authed`** project, and `ci.yml` runs it as its own
blocking step (*"Console visual gate (the approved design, asserted)"*) with all thirteen gate
env vars mirrored. **The visual gate is already blocking on every PR.** The `browser` project runs
nowhere — `landing.browser.spec.ts` is red on `main` for exactly that reason. Every new visual row
lands in the **`authed`** project or it is not in the gate.

**Correction D5-b — the manifest cannot literally "extend" the inventory.**
`lib/project-route-inventory.ts` holds **14** surfaces; this epic's scope is **29 routes**. Verified
by enumeration — 32 `page.tsx` files: **20** under `app/app/**`, **9** outside it (4 × `/hub`,
`/login`, `/signup`, `/install`, `/s/[token]`, `/talk`), and **3 deliberately out of scope**
(`/`, `/methodology`, `/methodology/[chapter]`, already shipped on the brand system). The inventory
answers *"what may this member navigate to"*; the manifest answers *"is this route on the design
system"*. Different questions, and folding one into the other would put `/login` in a member's nav.

🔒 **Locked:** `apps/web/design-system/route-manifest.ts` **imports** `PROJECT_ROUTE_INVENTORY` and
is unit-tested to hold (a) a row for **every** inventory surface — so a new nav surface with no
reference state turns the manifest red — and (b) the row count the **D13 ledger** says is right at
each sprint: **30 live through Sprint 3, 27 at epic close.**

⚠️ *This line said "exactly **29** rows" until the fresh reviewer pointed out that it contradicted
D13 four hundred lines further down the same document — the number D13 exists to correct, restated
as a fact in the decision D13 amends. The test asserts the ledger, not a literal.*

That is "no second list" kept honestly: one list of surfaces, one list of coverage, welded by a
test.

🔒 **Every assertion is observed failing on a deliberately mutated page.** The epic's own lesson —
`querySelectorAll('[role="columnheader"]')` passes under `display: none`, which removes an element
from the accessibility tree and not from the DOM. **A guard that cannot go red is a finding**, and
that includes a guard for a bug that has already been fixed (see D12).

### D6 — 🔒 **NO FLAG. The redesign ships straight to production.** Daniel decided this, 2026-08-31.

**This decision used to specify a kill-switch** — env var `DESIGN_V2_ENABLED`, predicate
`isDesignV2Enabled()`, two seams, created disabled, flipped at Story 3.6, retired at Story 6.4. It
was then amended to "created ENABLED". Both were wrong about the thing that mattered:

> *"I thought for some reason we were putting all this work behind flags and shipping dark. It
> shouldn't, not flagged, not dark or anything… All goes to production, to main, not dark, not
> disabled."*

🔒 **Locked: there is no flag.** No env var, no predicate, no gated branch, and nothing owed on
Vercel for this epic. `isDesignV2Enabled()` was written into `lib/flags.ts` at the start of Sprint 3
and removed in the same sitting; it never shipped.

**What this deletes, which is the point:**

| Was | Now |
|---|---|
| Story 3.1 — the kill-switch and its seam | **Deleted.** The shell rebuild lands directly. |
| Story 3.1's "gate-off branch is byte-identical to today", proved by rendering both off-states and diffing | **Deleted.** There is no off-state to render. |
| Story 3.6 — flip it on / prove the rollback | **Deleted.** See below. |
| Story 6.1's seam B (`design-system/Frame.tsx` calling the predicate) | **A frame, not a gate.** It still exists as shared chrome for the 9 non-`ProductShell` routes; it just has nothing to ask. |
| Story 6.4 — retire the flag from code and all three envs | **Deleted.** Nothing to retire. |
| Every route in Sprints 3–6 keeping BOTH branches working | **Deleted**, and this is the largest saving: a gated rebuild means every surface has two designs that must both render for three more sprints. |

**Rollback is `git revert` plus a deploy.** Stated plainly rather than left implicit: without a flag
there is no instant switch, so recovering from a bad shell render is a revert and a redeploy — minutes,
not seconds. That is the trade Daniel chose, and it buys a codebase with one design in it instead of
two. The protection that remains is the one that has actually been finding defects all epic: the
deterministic gate, the rendered assertions, and the review rounds.

⚠️ **Consequence for the plans: stop writing "owed to Daniel" items about Vercel.** *"I don't want to
keep fighting the vercel vars or owed items over there at all."* Sprint 3's and Sprint 6's walkthroughs
are rewritten accordingly — production steps stay (looking at the deployed page is how a design gets
judged), env-var steps go.

### D7 — The charting primitive. 🔒 **Locked: hand-rolled SVG. No dependency.**

Verified: `apps/web/package.json` `dependencies` are `@golden-frijoles/sdk`,
`@modelcontextprotocol/sdk`, `@supabase/ssr`, `@supabase/supabase-js`, `lucide-react`, `next`,
`react`, `react-dom`, `zod`. **No chart library, and none transitively reachable.** Audit §2.3 is
confirmed: every number in `/app` is a table row today.

Verified the enabling fact rather than assuming it: `check-design-drift.mjs` applies its
inline-style ban only to `VOICE_AND_STYLE_ROOTS` — `components/landing`, `components/methodology`,
`app/methodology`. **Dynamic bar widths are legal in `components/ui`, `components/product` and
`/app`.** So the hand-rolled route has no guard to fight.

`FunnelBars` and `RolloutBar` already exist and are **extended, never re-authored**. **DD4's colour
rules are the contract** — magnitude is `--gold` alone; two-way identity is `--gold` + `--blue`;
status is `--green`/`--red` **always with a word and a shape**; never four categorical hues; never a
dual axis; a nonzero value never rounds to zero pixels (4px floor, exact count beside it).

**A chart dependency is shared surface. If a builder believes one is needed, it escalates — it does
not add one.**

### D8 — `measure-contract.mjs` emits the spec file. 🔒 **Locked, and re-verified by running it.**

**The script does not emit anything.** It prints a table to stdout, and there is no `--check`. Its
own header says *"Regenerates the spec table in `CONSOLE-CONTRACT.md`. Never hand-edit that table"* —
a claim about behaviour the code has never had, which is why the two wrong numbers survived. That is
Story 1.4's actual work.

Run fresh 2026-08-29 against **both** prototypes — `console-ia-overhaul/design/flags-console-prototype.html`
and this epic's `apps/web/design-system/console-prototype.html`:

- the two tables are **byte-identical**, so moving the script onto the new harness introduces **zero
  drift** and Story 1.1's move is safe;
- **Project switcher `122 × 30`** — the contract says `140 × 30`;
- **Feature row `1118 × 71`** — the contract says `h 78`;
- everything else reproduces exactly, including `Rail item 13.5 / 600 · 207 × 36`, `Page h1
  23 / 700`, `Switch 38 × 21`, `List header row 11 / 600 uppercase`.

🔒 The corrected numbers **arrive from a regenerated table**. A hand-edit here repeats the exact
defect it is fixing.

---

### The five decisions the verification pass ADDED

### D9 — ⚠️ Preview cannot serve any signed-in or database-backed page. 🔒 **Every preview-based walkthrough step in this epic is unrunnable and is rewritten.**

`vercel env ls preview`, read 2026-08-29. Preview holds **six** variables:
`CONSOLE_SHELL_ENABLED`, `FLAG_CONSOLE_ENABLED`, `SCENARIO_AUTHORING_ENABLED`,
`FLAG_RULE_BUILDER_ENABLED`, `AGENT_RAIL_ENABLED`, and `JOURNEY_PROJECTIONS_ENABLED` scoped to one
dead branch. It holds **no `SUPABASE_URL`, no `SUPABASE_SERVICE_ROLE_KEY` and no
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** — those four are **Production-only** —
and `vercel integration list` reports **no resources**, so nothing injects them at build time.
`lib/supabase.ts` throws when they are missing. Every preview deployment probed also answers **302**
at both `/` and `/login` (deployment protection).

**This is strictly stronger than `console-ia-overhaul` A2.** A2 said preview does not mirror
production's *gates* — a member sees 9 surfaces instead of 13. The truth is that preview has **no
database at all**, so there is no member and no session to see anything with.

🔒 **Locked:** authed and DB-backed verification runs **locally** (`supabase start` + a local
production build + `npm run test:e2e:authed`, per the gate recipe) and on **production** after
merge. Preview is used for nothing in this epic. `sprint-1.md`, `sprint-2.md` and `sprint-3.md`
walkthroughs are rewritten accordingly, per step. **A step written against a preview URL is a step
nobody can run, and it reads exactly like a step that passed.**

### D10 — 🔒 The walkthrough tenant's live rows decide which approved state each route can render.

Production, queried 2026-08-29 (`slweidgffcfndnskcskc`), project **`miyagisanchez`**:

| | flags | prod active | TARS features | experiments | journeys | scenarios | tasks | signals | destinations | connector | live keys | share links | North Star |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `miyagisanchez` | **42** | **3** (39 never, **0 off**) | **1** (`setup_guide`) | 2 (both `decided`) | **0** | **0** | **0** | **0** | 1 | 1 | 7 | 2 | 1 (+2 inputs) |

Three consequences, each of which would otherwise have been discovered by a builder mid-sprint:

1. **`sprint-4.md`'s walkthrough step 1 is the PROTOTYPE's dataset.** It says *"2 feature rows and
   one line reading 40 features have never been turned on in Production"*. Live it is **3 rows and
   39**. Corrected in that file. (`flag-vocabulary.ts` already records the same re-measurement;
   the walkthrough did not inherit it.)
2. **`/app/journeys`, `/app/scenarios` and `/app/tasks` can only ever render their EMPTY state on
   this tenant.** The populated approved states `measure-journey`, `measure-scenarios` and
   `tasks-standalone` are unverifiable there. The only production journey is `merchant_activation`
   on `golden-beans`; the only production scenarios (2) are on `miyagi`; the only production task is
   a **resolved** one on `golden-beans-demo`.
3. **`0 off` in every environment.** No flag has ever been deliberately switched off anywhere, so
   the `off` presentation has never rendered in production.

🔒 **Locked:** populated states are asserted on the **specimen route** (Story 2.1) and by the visual
gate against the **local fixture tenant**, which the `authed` rail seeds. Every production
walkthrough step names the **empty** state as its expected result where that is what the data
supports, and names which tenant carries the populated one. **An acceptance criterion that asks a
builder to match a populated design on a route with no rows is unsatisfiable**, and "it looked
empty" is not a bug report anyone can act on.

### D11 — 🔒 Three shipped claims are false. They are corrected as findings, with their evidence.

1. **The drift guard already covers `components/ui` and `components/product`.** This epic's README
   (*"Platform-first note"*) and `sprint-1.md` Story 1.3 both say the guard must be *extended* to
   them and cite audit §10.5. `SWEPT_ROOTS` in `scripts/check-design-drift.mjs` reads
   `['apps/web/components/landing', 'apps/web/components/ui', 'apps/web/components/product',
   'apps/web/components/brand', 'apps/web/components/methodology', 'apps/web/app']` — added by
   `app-shell-and-agent-rail` S1.4. **The audit's gap was closed before this epic was scaffolded.**
   Story 1.3's contract below states the gap that is actually open.
2. **"The design introduced no new colours" is false, twice.** See D2-c.
3. **`flag_admin` has a live row in production.** `lib/credential-inventory.ts:95` and its
   `CREDENTIAL_KINDS_NOT_LISTED` entry both say it *"has no minting surface and **no live rows**"*.
   Production holds one **unrevoked** `flag_admin` key — *"Miyagi Cloud Run flag administration"*,
   created 2026-07-28, on project `miyagi`. On the one page whose entire job is an accurate access
   inventory, that is a live bearer credential omitted under a justification that is not true.
   Story 4.5 fixes the claim. **The four mint kinds are otherwise correct** — `credential-inventory.ts`
   lists exactly `ingest`, `flag_read`, `flag_sync`, `agent_write` and names `connector`, `share` and
   `flag_admin` as deliberately not listed; the schema's `CHECK` allows all six.

### D12 — 🔒 The dialog bug is ALREADY FIXED. Story 2.3 owes the assertion, and it owes a mutation check.

`sprint-2.md` Story 2.3 describes the top-left-pinned `dialog:modal` as a live defect *"since the
component shipped"*. `apps/web/app/globals.css` already restates `margin: auto` on `.confirm-dialog`,
with a comment explaining the `* { margin: 0 }` interaction — landed in `console-ia-overhaul` S3.3.

What is genuinely missing is the **assertion**: `design-system.authed.spec.ts` asserts modality, the
focus trap and focus restoration, and **never asserts where the dialog is**. So the fix is one
stylesheet edit away from silently regressing.

🔒 **Locked:** Story 2.3 delivers the position assertion. Because the fix has already landed it
**cannot be observed failing on `main`**, so the "observed failing at least once" requirement is met
by a **mutation check recorded in the PR body**: delete `margin: auto`, watch the assertion go red at
`x: 0, y: 0`, restore, watch it go green. A guard that has never been seen red is not a guard.

### D13 — 🔒 The "29 routes" is a MOVING number, and here is the ledger. **Daniel decided the one part that was his.**

The scaffold's *29 in-scope routes* was computed as 32 `page.tsx` files minus 3 out of scope. That
is correct **today** and wrong **at epic close**, because this epic's own stories change the set —
and neither change was costed:

| | Δ | What | Where |
|---|---|---|---|
| Story 4.5 | **− 3** | `/app/keys`, `/app/flag-credentials`, `/app/agent-keys` are **retired** — minting moves onto Setup › Keys in the same commit. A redirect has no design and owes no reference state. | `sprint-4.md` |
| Story 4.3 | **+ 1** | `Ship › Scheduled changes` — **the approved Ship rail has four items and the product has no such route, table or capability.** Verified by grep across the whole repo. | `sprint-4.md` |

**So: 30 rows live through Sprint 3, 27 at epic close.** `coverage()` computes the denominator from
the manifest's own `landsIn` / `retiresIn` fields rather than from a number typed into a document,
because a typed number is exactly what this epic exists to stop trusting. The DoD's *"29/29"* is
amended to **27/27** below.

#### The part that was NOT mine: Scheduled changes

`sprint-4.md` Story 4.3 said Scheduled changes *"renders the same row language with its honest empty
state (the rail shows `0` today)"*. **The rail shows nothing today** — `project-route-inventory.ts`
has no such surface, there is no route, there is no table, and there is no scheduling capability
anywhere in the product. The sentence describes the *prototype's* rail as though it were the
product's.

Dropping a rail item is an amendment to an approved design, and WAYS-OF-WORKING now says an approved
design **is** the contract — so it went to Daniel rather than into my judgement (LEARNINGS:
*amending a locked acceptance criterion is a product-owner decision, not a documentation task*).

> **DECIDED 2026-08-29 — Daniel: ship the designed empty-state route.** `/app/scheduled/[projectSlug]`
> is built in Story 4.3 as a real route whose only state is the approved empty one, and
> `Ship › Scheduled changes` stays in the rail with its fourth item. It enters
> `project-route-inventory.ts` as a `scheduled` surface and the coverage manifest as a row.

The alternative I recommended — drop the item and record the gap — was not taken, so the
counter-argument is recorded here instead of lost: Story 4.1's own rule is *"a control that goes
nowhere is worse than no control"*, and this ships a fourth rail item in front of every user that
leads to a page which cannot do anything. **The mitigation is that the empty state must say
plainly that scheduling is not available yet** — an empty state is one of the nine and is a
deliverable, not a fallback (D10). It must not read as *"you have no scheduled changes"*, which
would imply you could have some.

#### The specimen route is deliberately NOT in the denominator

`/app/design-system` (Story 2.1) is in `OUT_OF_SCOPE_PAGES`, not in the manifest. Counting it would
be circular: the specimen **is** the reference every other route is measured against, so a route
that renders the system by definition renders the system. It is still **gated** — Story 2.1 asserts
it against `MEASURED-SPEC.md`, and Sprint 2's walkthrough is the screen where Daniel approves or
rejects the language. It is simply not a route the product owes a design to.

#### The coverage trajectory, computed rather than typed

| After | Live rows | Covered | What lands |
|---|---|---|---|
| Sprint 1 | 30 | **0** | the rails. No product pixel moves, so nothing is on the system yet. |
| Sprint 2 | 30 | **0** | the language + the specimen — which is out of scope by the paragraph above. |
| Sprint 3 | 30 | **0** | the shell. ⚠️ Coverage stays 0 **on purpose**: the boolean is about a route's own **page body**, not its chrome. Wrapping 21 routes in the frame does not make 21 pages look right. |
| Sprint 4 | 27 | **8** | Ship + Setup; the three legacy credential routes leave the denominator. |
| Sprint 5 | 27 | **18** | Measure + Today. |
| Sprint 6 | 27 | **27** | the doors and the hub. |

Run `node scripts/design-coverage.mjs` for the live number; CI prints it on every PR and the ratchet
fails a decrease.

---

### D14 — 🔒 Story 2.5 splits in two, and Sprint 3 owes the second half. **Daniel decided this one.**

Story 2.5 asks that *"`flag-vocabulary.ts` generalises into a product vocabulary module; it is not
replaced, and every user-facing word in `design-system/` goes through it."* Those are two changes,
and only one of them can happen in Sprint 2.

⚠️ **The build contract for Sprint 2 says it changes no existing product route.** Folding
`flag-vocabulary.ts` into the new module edits the live, flag-gated flags page — the surface that
took seven review rounds in `flags-visual-rule-builder`. Delivering the story as written would make
the one sprint whose safety argument is "it touches nothing live" touch something live.

⚠️ **And the half that WAS delivered had not actually been delivered.** `design-system/vocabulary.ts`
shipped as a lint registry imported by exactly one file — its own test — while `page.tsx` hard-coded
the strings the registry describes. `"Never turned on here"` existed as a literal in
`CONTROL_PLANE_WINS` and, separately, as a literal on the specimen, welded by nothing: correcting the
registry would have left the rendered page saying the old word (fresh reviewer, round 2, Major).

Decided, not discovered:

- **Sprint 2** wires the specimen's user-facing words through `SPECIMEN_WORDS` /
  `controlPlaneWord()`, so the module has real callers and "goes through it" is true of
  `design-system/`. `controlPlaneWord()` THROWS on an unsettled phrase rather than falling back to
  the design's wording — a fallback is how the two drift apart silently. `vocabulary.test.ts` fails
  if the specimen hard-codes a word the registry settles (mutation-verified).
- **Sprint 3** folds `flag-vocabulary.ts` into it. Sprint 3 already rebuilds those console surfaces,
  so the edit lands in the sprint that owns the route rather than in the one that does not.

`flag-vocabulary.ts` is untouched by Sprint 2. That is a deviation from the story text, decided here
rather than discovered at close.

---

## Routing — who builds what, and why

Stated here so the choice is auditable (WAYS-OF-WORKING → *Routing a build by model tier*).

| Sprint | Built by | Why |
|---|---|---|
| **1 — the rails** | **Architect, not delegated** | It is entirely shared surface: `design-system/`, the token collapse, the drift-guard rules, the manifest and the gate. Every one of the five later branches inherits it, so a mistake here breaks all of them. This is the row the routing table marks *Strongest, done FIRST*. |
| **2 — the language** | **Architect, not delegated** | It defines the primitives and states that Sprints 3–6 assemble from. A permissive reading here is re-paid 29 times. |
| **3 — the shell** | **Architect, not delegated** | The `ProductShell` seam — 21 routes at once, straight to production with no flag behind it (D6). A shared seam every other sprint builds on is the never-delegated row, and removing the kill-switch raises that, not lowers it. |
| **4 — Ship and Setup** | **Delegated**, per story, over the locked contract | Execution against approved pixels on routes whose auth boundary is unchanged. **Exception: Story 4.5 stays with the architect** — it moves credential minting and retires three live credential routes. Credentials are the never-delegated row. |
| **5 — Measure and Today** | **5.1 architect** (charting primitives are shared surface, D7). **5.2–5.6 delegated**, per story | Once the primitives exist, each page is bounded and has an approved state to check against. |
| **6 — doors, hub, deletion** | **Architect, not delegated** | Seam B, the flag retirement, and deleting `.product-shell`. A Sweeper that proves an old path unreachable is judgment, not execution. |

**Escalate, don't guess.** Any builder stops and hands back on: payments / checkout / fulfilment /
auth / DB migrations / shared infra / money · a decision this lock does not cover · plan ambiguity ·
**2+ failed attempts at the same problem**. A scope that stops moving is a raised hand, not a reason
for more tokens.

## Review — the policy this epic runs, stated once

Every PR is routed, never hand-picked:

```
node scripts/review-route.mjs --builder <who-wrote-it> --tier high <PR#>
```

**Every sprint in this epic is HIGH tier** (shared infra in 1, 2, 3 and 6; credentials in 4; and
⚠️ **no kill-switch behind any of it** — D6, which RAISES the tier rather than lowering it: with no
flag to flip, review and the gate are the only things between a bad render and every signed-in
user). So every PR gets **two cross-family passes from families that
did not build the diff, PLUS the fresh reviewer subagent**. A capped family is a **refund ask to
Daniel**, not a licence to substitute subagents; after the router's stated window, proceed and
**record the downgrade in the PR body** — a missing layer must never read like a clean one.

### The six mechanisms this epic exists to kill

Each is evidenced from `console-ia-overhaul`'s own retrospective and contract. Every sprint below
names which one it closes, so no story is here on taste.

| # | Mechanism | Closed by |
|---|---|---|
| **A** | Nothing could go red on an ugly page — every criterion was structural | S1 (the gate), S2 (the spec) |
| **B** | The design was explicitly demoted to *"inspiration, never signed-off scope"* | **S1, Story 1.0** — one paragraph in WAYS-OF-WORKING |
| **C** | The contract claimed *"measured, not described"* and two numbers do not reproduce | S1 Story 1.4 / D8 — the spec becomes generated output |
| **D** | The regenerator was never committed; both scripts died on a fresh clone for four days | S1 — harness and scripts under CI |
| **E** | The gate was born with five deferred rows, covering one route of twenty-nine | S1 (manifest-driven gate), S6 (coverage 100%) |
| **F** | **The design lives inside an epic, and epics close** | **S1, Story 1.1** — the move to `apps/web/design-system/` |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The rails — make a bad-looking page fail the build | high |
| 2 | The language, systematised | high |
| 3 | The shell | high |
| 4 | Ship and Setup, finished | high |
| 5 | Measure and Today — the pages nobody designed | high |
| 6 | The doors, the hub, and deleting the old world | high |

## Deploy order

**Stack the branches** — `feat/design-system-rails` → `-s2` → `-s3` → `-s4` → `-s5` → `-s6`, each cut
from the previous, one PR per sprint, merged in order. Six sprints in one epic share
`globals.css`, `console.css`, `ProductShell` and the token file by construction; siblings cut off one
base pay a per-merge conflict tax.

**Shared surface first, by the architect, in Sprint 1:** the `design-system/` directory, the token
collapse, the widened drift guard and the manifest. Every later branch inherits them, so a mistake
there breaks all five.

**The flag flips ON at the end of Sprint 3, not at epic close.** Sprints 4–6 are then built in the
light, with a live rollback, and a missing control is noticed the day it goes missing. This is the
last epic's own recorded lesson, applied deliberately: *"with the console LIVE since Sprint 2 there
was no dark period in which a missing control would have gone unnoticed."*

**Two visual systems live between S3's flip and S6's deletion.** That is what makes rollback
possible, and it means every S4–S6 story pays a two-branch cost. **Land the replacement and retire
the original in the SAME story** (`console-ia-overhaul` A3) — never as a cleanup sprint.

**Preview does not mirror Production's gates** (`console-ia-overhaul` A2, `vercel env ls`
2026-08-27): a member sees **9** surfaces on a branch preview, not 13. Every sprint walkthrough must
say which environment each step is for, per step — a gate-on step run on Preview renders a correct
page that reads exactly like a broken one.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated) — S1–S5 merged and live; **S6 is PR #135, open**. ⚠️ Two gaps stated: the auth-path production smoke is **owed to Daniel by name**, and there is **no password-reset flow** behind the approved door's "Forgot your password?" (a product decision, not a builder task)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] **All 27 in-scope routes have an approved reference state, derived from `apps/web/design-system/`** *(amended from 29 — see **D13**: Story 4.5 retires three routes and Story 4.3 adds one)*
- [x] **The visual gate is blocking for all 27 in the `authed` project (D5-a), with zero deferred rows carrying no owner and no date** — the two deferred rows (the pod report's evidence tables) each carry `owner: Daniel, until: 2026-11-30`, enforced by `route-manifest.test.ts`
- [x] **Coverage manifest reports 27/27 and the ratchet is wired** (coverage may not decrease) — `node scripts/design-coverage.mjs`. ⚠️ The ratchet is now *tested*: `scripts/design-coverage.test.mjs` watches it go red, which nothing did before Story 6.5
- [x] **`globals.css`'s `.product-shell` rules and `console.css`'s compensations for them are deleted** — 38 + 16, plus `.auth-shell`/`.auth-form` and 22 orphaned landing rules, and 103 dead rules from `hub.module.css`. `design-system/old-world.test.ts` fails if any return (mutation-verified)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated — ⏳ as **merged-pending**, not ✅, until the deploy is verified
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append) — ten, sharpened into the existing cascade/review sections
- [x] ⚠️ **NO kill-switch — this line is now the opposite of what it said** (D6, Daniel, 2026-08-31). ✅ Verified 2026-09-01 by **enumerating** all three Vercel environments (32 production vars / 11 preview / 10 development) and searching the list — ⚠️ a first attempt grepped the CLI's output directly and returned a false "0 matches" because the **command had errored**. Confirm `DESIGN_V2_ENABLED` and `isDesignV2Enabled` appear in **no** source file, **no** Vercel environment and **no** plan; that the 21 `ProductShell` routes and the 9 `Frame` routes render one design with no gated branch behind them; and that the epic owes **nothing** on Vercel. Rollback is `git revert` plus a deploy. *Verify-only — not a new gate.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
