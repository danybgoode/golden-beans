# One design system, every surface — Sprint 6: The doors, the hub, and deleting the old world

**Status:** ✅ **BUILT — Stories 6.1–6.5 complete**, awaiting merge to `main`. Coverage **27 / 27**,
the visual gate opens every one of them, and the design this epic replaced is **deleted** rather
than layered over.

| | Before Sprint 6 | After |
|---|---|---|
| Coverage (`node scripts/design-coverage.mjs`) | 18 / 27 | **27 / 27** |
| Routes the visual gate OPENS | 19 | **23** (+ 4 named siblings, all of which really open theirs) |
| `.product-shell` rules in `globals.css` | 38 | **0** |
| `.is-console .product-shell*` compensations in `console.css` | 16 | **0** |
| `.auth-shell` / `.auth-form` rules | 10 | **0** |
| Stylesheets painting the signed-in shell | 2 | **1** (`design-system/system.css`) |
| `/s/[token]`'s gate coverage | a `coveredBy` label on an API-only spec | the gate **opens it** with a minted token |

## What was found by building it — five plan corrections

Each was found by reading the code or running the thing, not by reading the plan. They are listed
because "the plan was right" is the claim a close-out must not make by default.

1. **`/signup`'s password hint promised twelve characters.** `lib/signup-schema.ts` enforces
   **eight**, with a written reason. A person typing nine characters would have been told nothing
   until the server said no. The floor is now imported rather than retyped.
2. **Its note promised "Straight to Setup › Connect".** `app/auth/callback/route.ts` lands a freshly
   confirmed account on `/app/onboarding/<slug>` — the one screen that can show the project's API
   key, which exists for a single request and is never stored. The design's promise was right in
   substance and wrong in destination.
3. **`door-signup-closed` is approved and UNREACHABLE.** `/signup` calls `notFound()` while
   `SIGNUP_ENABLED` is off, so the closed state of that route is a 404, not a waitlist. Turning it
   into a 200 is a behaviour change on the gate that decides whether strangers can create tenants,
   and the epic's platform-first note says every route keeps the gate it has. Recorded in
   `route-manifest.ts` rather than quietly skipped — the waitlist itself is live on the landing page.
4. **`/talk`'s approved lede says "Thirty minutes".** The shipped page and the Cal.com event it
   books (`quick-chat`) are **twenty**. A mock's round number is not a scheduling change.
5. **`door-login`'s "Forgot your password?" has no flow behind it.** Nothing in the repo calls
   `resetPasswordForEmail`, and there is no reset route. The control is **omitted rather than shipped
   dead** — Story 4.1's own rule is *a control that goes nowhere is worse than no control*. ⚠️ **This
   is a real capability gap, and it is owed to Daniel as a decision, not to a builder as a task:** a
   person who forgets their password today has no self-serve way back in.

## ⚠️ Five defects found by OPENING THE PAGE, after every gate was green

This is the section that matters most, because it is the epic's own thesis turned on its author.
`tsc`, `build`, 1 634 unit tests, 492 `api`, 122 `authed`, 62 `browser`, the drift guard, the
coverage ratchet and the visual gate were **all green** — and then I rendered the five public routes
and looked at them.

1. **`/login` was not centred. The entire door frame silently did not apply.** `Frame` rendered
   `<div className="ds ds-door">`, and every rule in `system.css` is `.ds .ds-…` — a **descendant**
   combinator, which `system-cascade.test.ts` requires for good reasons. A descendant selector cannot
   match the element carrying the scope class, so the page rendered top-left on the browser's default
   ground. **Every structural assertion passed**: it had `ds-` classes inside `<main>`, it spent
   little chrome, it did not scroll sideways. Correct markup, correct stylesheet, and no relationship
   between them.
   → Fixed, and **guarded**: `every ds- element sits inside a .ds ANCESTOR, on every covered route`
   in the visual gate, keyed on `parentElement.closest('.ds')` — deliberately not `closest()` on the
   element itself, which would call the broken markup correct. **Mutation-verified**: re-compounding
   the class turns it red, un-compounding turns it green.
2. **`/install`'s "THREE STEPS" label sat flush against the paragraph above it** and read as that
   paragraph's last line. `.ds-label` has `margin-bottom` and no `margin-top`, and every shipped
   caller until now put it first in its own card — so the gap was real and invisible. Fixed in the
   system (`.ds-label:not(:first-child)`) *and* on the page, which now mirrors `Setup › Connect`'s
   own markup exactly. That page's callout claims the two are "the same three steps"; a claim about
   sameness is worth more when the markup is actually the same.
3. **`/talk`'s booking calendar was clipped mid-row, because I invented a number somebody had
   measured.** The shipped `.talk-frame` carried `min-height: 700px` (780 at ≥900px) *with its
   working recorded*: 620 was measured to scroll, 860 to leave a gap. My port wrote 640 — below the
   value already measured as too short. **Porting a page means porting its measurements**, and
   re-deriving one badly is the same defect as the two unreproducible contract numbers this epic
   opened by fixing.
4. **`/talk`'s callout said the embed "gets a dashed slot", and the dashes were invisible** — the
   iframe filled the box edge to edge and covered the border. Prose asserting a property the render
   does not have, on the page that explains the idea. Six pixels of padding makes the sentence true.
5. **The port orphaned 22 landing rules** — `.talk*`, `.install-*`, `.surface-note` — which nothing
   renders any more. Swept, because *"deleting a component leaves a trail in the stylesheet, and the
   trail comes with confident prose attached"*.
   → ⚠️ **And the sweep itself had a bug, caught by diffing what it removed against what it was asked
   to remove.** It drops a rule when ANY selector in its comma list matches, so
   `.eyebrow, .surface-note strong, .panel-label, .kicker { text-transform: uppercase }` went with
   the one dead member — which would have silently un-uppercased three classes that are live across
   the public site. **A rule dies only when EVERY selector in it does.**

Two more came from the harness rather than the design, and both were fixed as classes:

- **A JSX pragma is PER FILE.** `design-system/primitives.tsx` had none, so the moment
  `report-components.tsx` composed `Answer`/`Callout`/`Empty` from it, **fourteen specs went red at
  once** with "Objects are not valid as a React child" — Playwright's transform pins its own jsx
  runtime. Three files already carried the line and a fourth needed it; `components/ui/Icon.tsx` too,
  which covers every icon in the product in one place.
- **`setup-route-guards.test.ts` sliced `ProductShell` by INDENTATION.** Adding one wrapper element
  moved every line two columns and turned a correct guard red for a reason unrelated to what it
  guards. It balances parentheses now.

## Review round 1 — what the reviewers found that I did not

Recorded because a close-out listing only what the author caught is not an audit.

**Codex was quota-capped** for this PR (until 2026-09-16, far past the router's 30-minute fallback
window), so the second cross-family pass is a **downgrade, stated rather than hidden**.

**agy, in four scoped passes** (the diff is 346 KB against a 256 KB argv cap). Two real defects in a
guard I had already mutation-verified:
- **Blocking — the markup guard was blind to three of the four JSX shapes.** It matched
  `className="…"` and ``className={`…`}`` only, so `className={'auth-shell'}` reintroduced a retired
  class with the test GREEN. Prettier happens to rewrite that form here, which is a convention: a
  guard that holds only while a formatter runs reports success for the wrong reason.
- **Should-fix — the name boundary reported a false positive my own docblock forbade.**
  `.product-shelling` failed as `.product-shell`. The boundary is BEM now.
- ⚠️ **And three "Blocking" findings that are false** — duplicate imports, a duplicate
  `seedShareFixture`, a duplicate `shareToken()`. There is one of each and `tsc` exits 0. agy had
  silently fallen back to `gpt-oss-120b-medium` on those passes, which is the documented condition
  for this failure mode. **Verified, not actioned.**

**The fresh reviewer — two Majors, both real, both mine:**

1. **`:where()` zeroes only its OWN argument, and my comment claimed otherwise.**
   `.ds .ds-shell :where(input, textarea, select)` is **(0,2,0)**, not the (0,0,0) the comment
   asserted — while the rule it replaced genuinely was (0,0,0), because both compounds sat inside
   `:where()`. At (0,2,0) in the last-loaded stylesheet it beat three live rules on ties, including
   **`.is-console .command-palette__input`** — so ⌘K's borderless 16px search line would have become
   a bordered, filled 14px box **on every console route**. A Sweeper claiming "changes no pixel"
   would have shipped a redesigned command palette, and `MEASURED_SPEC` has no row for any input, so
   nothing could have caught it. Written `:where(.ds .ds-shell) :where(…)` now, and both guards it
   then trips — the `.ds`-scope test and the (0,2,0) floor — are taught about it by name rather than
   loosened.
2. **The "three exceptions" header was missing a fourth.** Merging the project chip and the
   switcher's `<summary>` into one rule **dropped the chip's green ring** — `globals.css` gave it
   `color: var(--green)` and `border: 1px solid var(--green-line)`, and `console.css`'s reset touched
   only font properties, so both branches shipped green-on-green. Two rules again, because the two
   elements never had the same ones. ⚠️ Restoring it exposed a second bug: `--green-line` is a
   **landing** token, so reading it from inside `.ds` is the same contamination the `--espresso` fix
   removed. Derived from the product's own `--green` instead, with the per-channel delta recorded.

**Minors actioned:** `/install`'s three `<h2>`s restored (the port left the outline h1-only);
`/install` and `/talk` keep the agent-readable paths a `<Footer/>` was the only carrier of;
`.agent-rail`'s `bottom: 78px` clearance for a deleted tab bar; the dead `CopyUrlField.tsx` and its
`.copy-url` rules; the share 404 added to the mobile sweep, which really is swept (the new bar has no
`flex-wrap` and its nav is `flex: none` — the exact shape of two overflow defects this epic already
paid for). ⚠️ **`/signup`'s row buys a documented gap, not a swept page**: `run-local-e2e.mjs` sets
`SIGNUP_ENABLED=false` for the `browser` project, so that row always takes the skip branch — and
nothing in CI runs this file at all (D5-a). Said plainly, because "added to the sweep" reads as
coverage gained; the ds-ancestor guard renamed to what it actually covers, and what it skips is now
printed; three stale comments naming deleted selectors; and a comment claiming a dependency
`design-coverage.mjs` does not have.

⚠️ **And one over-claim of my own, on the poster.** `Roadmap/README.md` said **"Live in production"**
for an epic whose last sprint was still an open PR. Corrected to *merged-pending* — the poster rule's
one hard line is that it never claims ✅ for unshipped work, and I broke it in the commit that
updated it.

## Review round 2 — the fixes reviewed with the same suspicion as the code

The repo's rule is that a fix earns no benefit of the doubt, so round 2 attacked round 1's fixes.
It found **one Major, and it was a hole I opened while closing another.**

- **Major — my scope guard became WEAKER than the one it replaced.** Teaching
  `system-cascade.test.ts` the `:where(.ds …)` form by checking a PREFIX missed that
  `splitSelectorList` only splits TOP-LEVEL commas: `:where(.ds .ds-shell, .totally-unscoped) .a .b`
  arrived as one string starting `:where(.ds `, was declared scoped, and cleared the (0,2,0) floor
  too — **an entirely unscoped rule passing both guards**. Written plainly it would have been split
  and flagged; the `:where()` form hid the comma. The head is parsed and every part checked now,
  recursively. Mutation-verified on three shapes.
  ⚠️ And the claim that both guards were "taught about it BY NAME rather than loosened" was **true of
  the floor exemption and false of the scope test** — a pattern *is* the loosening. Corrected.
- **Minor — nothing pinned the base reset AT (0,0,0).** The floor has no ceiling, so appending the
  exact broken form (`.ds .ds-shell :where(input)`) left all five tests green: the M1 defect could
  walk back in through its own exemption's door, with CI green. There is now an assertion that the
  literal selector is still in the file. Mutation-verified.
- **Minor — the chip/summary rewrite widened the ellipsis clamp to the legacy chip**, under a comment
  claiming exception #3 was "the ONLY thing about these two elements this story changes". It is kept
  (that branch IS the public bar now, and an unbounded slug in a non-wrapping flex row is the defect
  this epic paid for twice) and recorded as a **fourth** exception. The header said three.
- **Minor — `.ds-public--hub .ds-pubfoot` matched nothing** once the footer became opt-in, sitting
  inside the comment warning about selectors that match nothing. Deleted.
- **Minor — `/signup`'s mobile row buys a documented gap, not a swept page.** Corrected above.

## Review round 3 — one more undeclared change, and a guard that blocked correct work

Round 3 was cut short by a session limit, so I ran its first three items myself.

- **`isDsScoped()` holds.** Five smuggling shapes go red (`:where(.ds .x, .naked)`, `:is(.ds .x) .y`,
  `:where(.dsx .y)`, `:where(.ds .a):where(.naked)`, `:not(.ds) .x`) and three legitimate ones stay
  green. `:where(.ds) .a .b` also stays green, correctly: it *is* contained in `.ds` and scores
  (0,2,0) from `.a .b`.
- **Minor — the base-reset pin blocked correct work.** It compared bytes, so
  `:where(.ds  .ds-shell)` — the same selector to CSS, two spaces to `includes()` — turned it red on
  correct code. Whitespace-normalised now, and re-verified in both directions: the equivalent form
  passes, the genuinely broken `.ds .ds-shell :where(…)` form still fails. This is the third time
  this epic has shipped a guard that fires on correct work.
- **Major — a FIFTH undeclared change, and the header said four.** The public branch's nav links
  (`Connect`, `Agent notes`) shipped `display: inline-flex; align-items: center; gap: 6px; padding:
  8px 10px; font-size: 12px`. My port wrote `padding: 7px 10px; font-size: 13px` and **dropped the
  flex context entirely** — and *both* links contain an `<Icon>`, so each icon collapsed against its
  text and lost its vertical centring. Restored verbatim.
  ⚠️ **This header has now been wrong twice (three, then four), and both misses were found the same
  way: by diffing against `git show origin/main:…`, never by re-reading the port.** The durable
  lesson is that a *"carried verbatim"* claim is worth exactly as much as a diff against the deleted
  source.
- **And a SIXTH, found by going looking for one.** The exceptions list was still missing the mobile
  **fixed bottom tab bar**: below 640px the public branch's `Connect` / `Agent notes` were
  `position: fixed; bottom: 12px` with their own ground and shadow, and they sit in the top bar at
  every width now. It had been written down in `ProductShell.tsx` since the port and never reached
  the list the header points at. **A change is either reverted or it is on that list — "recorded
  somewhere else in the diff" is neither.** (It is also why `.agent-rail`'s `bottom` went 78px → 12px:
  78 was the clearance for that bar.) The list is five, in order, each with its reason.

**What round 2 settled** (checked rather than taken on trust, including a chromium probe of the real
stylesheets in the real link order): the `:where()` specificity fix is genuinely (0,0,0) and all
three previously-losing rules win again; the `ZERO_SPECIFICITY_BASE` exemption resists four smuggling
attempts; the green ring's `color-mix` resolves to #405e32 against the landing's #3a5c33 exactly as
claimed, on both branches, from the product's own tokens; the `/s/[token]` footer violation and the
`/signup` false-pass were both real and both already closed; and the `<span>`→`<h2>` swap on
`/install` is pixel-identical.

## Review round 4 — a BLOCKING regression the gate went green *because of*

- **Blocking — the Sweeper deleted the console's page frame.** The port assumed `console.css`'s
  `.is-console … > main` block was the whole story. It was not: that block only ever supplied
  `min-width: 0` plus padding at **≤900px** and **≥1100px**. `globals.css`'s `.product-shell main`
  supplied the **width, the centering and the padding for every width in between**, and console.css
  never overrode any of it.
  Measured in a browser at eight viewports: in the **901–1099px band** — a laptop at a non-maximised
  window — every console route rendered flush to `x = 0` with **zero padding on all four sides**, the
  first line against the sticky tier-2 nav. At 1440 the column silently widened 1120 → 1180.
  ⚠️ **And the visual gate went green *because of* the regression.** It samples 1440 and 390 only, so
  the broken band is untested — and at 1440 the widening *satisfies* its `contentMaxWidth === 1180px`
  assertion, because that reads the `max-width` PROPERTY while the deleted rule set `width`. The
  spec's own comment ("it renders 1120") had quietly become false.
  Also lost with it: `main > p`'s 760px measure and `margin-top: 12px`, and `p + *`'s 28px rhythm.
  **Fixed, and the CLASS fixed with it:** a new `the page frame holds at every width` walks the
  stylesheet's real breakpoints (390 · 700 · 950 · 1040 · 1280 · 1440) and asserts the two properties
  that were lost — the column is inset, and it has vertical padding — without pinning values the
  design is free to change. Mutation-verified: re-deleting the frame names 950px and 1040px by number.
- **Major — a sixth undeclared change.** The active section tab's underline went **4px → 2px**.
  `globals.css` drew `box-shadow: inset 0 -2px 0 var(--gold)` and `console.css`'s override never
  touched `box-shadow`, so on `main` the current tab drew a 2px inset band **plus** its 2px border —
  on the one control that says which of four sections you are in. Restored.
- **Major — the base-reset pin was green while the property was broken.** `includes()` proves the
  correct selector is present; it proves nothing about a **competing** rule beside it. Appending the
  exact broken `.ds .ds-shell :where(input…)` form left all six tests green — the round-2 finding
  ("the floor has no ceiling") repeating one layer up. The (0,2,0) form is now **banned outright**.
- **Minor — the chip's `line-height`.** `globals.css` set it with a `font:` SHORTHAND, which resets
  `line-height` to `normal`; omitting it let the chip inherit `1.55` and grow 34px → 37.5px in a 54px
  bar whose contract measures the control at 30px. The shorthand giving away a property nobody named
  is the exact trap this epic's own drift rule was written for.
- **Minor — the `--green-line` → `color-mix` substitution was documented only in its own rule's
  comment**, one commit after the header declared that "recorded somewhere else in the diff" is not
  enough. The rule, applied to itself. It is #3 on the list now.
- **Minor — a stale cross-reference** left by the previous renumbering.

⚠️ **The exceptions header has now been wrong three times** — three, then four, then five. It reads
**six**, in order, with reverted changes deliberately excluded, and the rule is stated on it: *a
change is either REVERTED or it is on this list.*

**Round 4 verified clean:** the shell root, the console header, `__identity`, the switcher/account
pair and their markers, the whole `__menu` family, `__tabs` + scrollbar + non-current tab + `:hover`,
both `:has()` rail blocks, the ≥640px public nav port, and that `.content` is genuinely dead.
`agentFooter` reaches neither `/s/[token]` nor its 404.

## Review round 5 — a 44px accessibility floor lost on the nine public routes

- **Major — every button-styled link on the ported routes fell from 44px to 26px.** `FrameLink`
  renders `<a class="ds-btn ds-btn--sm">`; measured at 390px: "Add to Claude" **26px**, the 404's two
  actions **26px**, the hub's "Back to the console" **26px**. On `main` these were `<Button href>` →
  `.btn`, which `tokens.css` gives `min-height: 44px`. **This is lost, not redesigned** — WCAG 2.5.5,
  on the first screens a customer ever sees.
  ⚠️ **And `system.css`'s own porting note #3 prescribes the exact fix, which `.ds-btn` never got:**
  *"Where the design's ink is smaller than 44 the floor is met by a transparent pseudo-element, as
  the row switch already does."* `.ds-switch` and `.ds-kebab` do it; `.ds-btn` did not. It did not
  matter while every `.ds-btn` was a `<button>` (the CSS rail covers those); Sprint 6 made it matter
  by putting button-styled **anchors** on nine public routes, and the rail deliberately exempts `a`.
  ⚠️⚠️ **The guard was blind by construction.** `mobile-heuristics.ts`'s target selector said
  `a.btn` under a comment reading *"button-styled links are targets"* — and never `a.ds-btn`. Worse,
  the share-404 row was added to that sweep **in this sprint** because it *"renders the widest button
  row on any door"*, and the sweep measured that row's overflow and never its size. Both fixed;
  mutation-verified that removing the floor now turns `/install`, `/talk` and the 404 red.
- **Minor — the 404's quiet aside was not quiet.** `.ds-gone-quiet` (0,2,0) lost **both** its
  declarations to `.ds .ds-gone p` (0,2,1), so the line explaining why we refuse to say which failure
  occurred rendered identically to the paragraph above it. A rule whose every declaration is
  overridden is a rule that is not there.
- **Minor — my round-4 ban was one SPELLING, not the form.** The regex required `input` to be the
  first `:where()` argument, so `.ds .ds-shell :where(textarea, input, select)` — same specificity,
  same defect — walked past it. Three rounds, three versions, each checking a proxy. It now
  **computes** the property with this file's own specificity parser, scoped to shell-wide resets so
  it does not fire on `.ds-search input` (legitimately specific). All three spellings verified red.
- **Minor — the frame guard measured `right` and threw it away**, so a column overflowing the right
  edge passed every check while the document scrolled sideways. Asserted now.
- **Minor — `hub.module.css` was 116 classes, 40 used.** The port orphaned **103 rules** while the
  docs called the file *"kept for the report's tables"* — true of what was used, and it read as if
  the rest had gone. Story 6.4 is a Sweeper: **1020 → 327 lines**, applying this sprint's own
  comma-list rule, with all 40 used classes verified still defined. `tokens-defined.test.ts` then
  caught two dead-token register entries the sweep had made stale — the register working as designed.
- **Minor — three comments described `CopyUrlField` / `.copy-url` as live.** This PR deleted both.
  The handoff doc's reference cannot be fixed there (byte-mirrored), so it is recorded in
  `design-system/README.md`, the side that can carry it.

**Round 5 verified clean:** focus rings on every new control, contrast on all new surfaces, no
horizontal overflow at 360/390 on any door, `.ds-codeblock` and the report tables keeping their own
`overflow-x`, the honeypot's off-screen rule surviving the sweep, every `ds-` class the nine routes
render having a rule, and the four carried `main` frame blocks reproducing `main`'s cascade at every
band.

## Review round 6 — one evasion left in the ban, and the rest verified clean

Round 6's agent hit a session limit before reporting, so I ran its checks myself.

- **Minor — the (0,2,0) ban had one evasion left.** Its pattern required the tag to END the compound,
  so `.ds .ds-shell input[type='text']` — (0,2,1), a real shell-wide control reset — walked past it.
  A trailing `[…]`, `:…` or `::…` is the same subject; the pattern accepts them now. Verified: the
  attribute and `:focus` forms go red, and `:where(input) + span` correctly stays green because its
  subject is a span, not a control. **Fourth version of this assertion, and the first three each
  checked a proxy** — presence, then one spelling, then a tag position.
- **The 44px floor measures correctly and breaks nothing.** On the real stylesheets at 390px: ink
  26px → target 44px on every `FrameLink`; **no overlap** between the two `.ds-gone-acts` actions,
  the two in `.ds-pubbar`, or stacked `.ds-talkitem` links; and an inline prose link 9px from a
  button's overlay still hit-tests to itself. It follows `.ds-kebab::before`'s existing precedent in
  the same file, and the door forms are excluded because their buttons are already 42px full-width.
- **The `hub.module.css` sweep is exact in both directions.** Audited programmatically: **zero**
  surviving rule-parts whose classes are all unused, and **zero** used-but-undefined classes.

## What is deliberately NOT on the design system, with its decay date

**The pod report's evidence tables — and now ONLY those.** ⚠️ Round 5 measured the file: 116 classes
defined, **40 used**, and one importer (`report-components.tsx`). The port had orphaned 103 rules —
roughly the first half of the file — while both this doc and the manifest's deferral described it as
*"kept for the report's tables"*, which was true of what was USED and read as if the rest had gone
with the port. **Story 6.4 is a Sweeper and its acceptance is *less code*.** Swept: 1020 → 327 lines,
applying this sprint's own comma-list rule (a rule dies only when EVERY part of it is dead), with
every one of the 40 used classes verified still defined afterwards. The description is now literally
true rather than nearly true.

`/hub/[projectSlug]/report` and `/s/[token]` render their
shell from `design-system/` — page head, provenance stamp, headline answer, caveats band, section
headings, empty state, refusal, benchmark list — and their **tables** (delivery metrics, the
maturity ladder, the not-instrumented panels, the outcome funnel) are still painted by
`app/hub/hub.module.css`.

That is Story 6.3's own allowance (*"retired into the system or explicitly kept with a written
reason"*), and the reason is: **the approved design has no state for any of it.** `hub-report` in
the prototype is PROSE — a stamp, a `.doc` block and a callout. Porting the tables would mean
inventing roughly forty visual decisions nobody approved, deep inside the sprint that closes the
epic — the exact shape the epic amended itself to forbid.

`hub.module.css` is a **CSS module**, so its class names are hashed and the D3 collision hazard
cannot occur in either direction. What remains is a second set of visual *decisions*, not a second
cascade. Both rows carry a `deferred` entry with **owner: Daniel, until 2026-11-30**, and
`route-manifest.test.ts` fails once that date passes.

> **Two jobs.** The nine routes outside `ProductShell` — the first screens a customer ever sees —
> and then **deleting the design this epic replaced.**
>
> **The deletion is not tidying.** Until `globals.css`'s `.product-shell` rules and `console.css`'s
> compensations for them are gone, the redesign is a layer on top of the thing it replaced, and
> landing rules keep reaching the console through shared class names — which they already did, three
> times, in one epic. Sprint 6 is a **Sweeper**: less code, same behaviour, no regressions, and the
> old path proved unreachable.

## Build contract (locked by the architect before the builder started)

> Sprint 6 is **not delegated** (README → *Routing*): seam B, the flag retirement, and proving an old
> path unreachable. **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/design-system/Frame.tsx` (new) · `apps/web/app/{login,signup,install,talk}/**` ·
`apps/web/app/s/[token]/**` · `apps/web/app/hub/**` · `apps/web/app/globals.css` ·
`apps/web/app/console.css` · `apps/web/lib/flags.ts` · `references/ux-guidelines.md` ·
`Roadmap/README.md`.

| # | The contract | Cites |
|---|---|---|
| 1 | **Seam B is `design-system/Frame.tsx`, with DD3's `door` and `public` variants.** Decided at the lock; **this story implements it, it does not re-decide it.** ⚠️ It is shared CHROME, not a gate — there is no flag for it to ask (D6). Root `layout.tsx` is still **rejected**: it also wraps `/` and `/methodology`, which two shipped epics own, and this epic's frame has no business wrapping them. | **D6** |
| 2 | The nine routes share **no** wrapper today — `.auth-shell` (login, signup), the landing `Nav`/`Footer` (install, talk), `hub.module.css` (4 hub routes), and `/s/[token]` reusing `../../hub/report-components`. Frame replaces all four, one route at a time. | verified |
| 3 | ⚠️ **No gate-off branch to prove** (D6) — this row cited a Story 3.1 that no longer exists. What Seam B still owes is that the 9 routes it wraps **render**, asserted by the `authed` suite, not by reading the diff. | **D6** |
| 4 | ⚠️ **There is no flag to retire** (D6, Daniel, 2026-08-31). This row named `DESIGN_V2_ENABLED` / `isDesignV2Enabled()` and Story 6.4's removal of them; neither ever shipped. Story 6.4 verifies the ABSENCE — a grep over the source and the Vercel envs — rather than performing a removal. | **D6** |
| 5 | ⚠️ **`/s/[token]` has no expired state, and that is a security decision.** `app/s/[token]/page.tsx` calls `notFound()` for unknown, malformed, expired **and** revoked alike, so the page cannot tell an attacker which one a token is. All four land on **`public-gone`**, one designed 404 whose copy deliberately does not say which. **Do not add an expired state to satisfy a doc.** | **F2** |
| 6 | **`/install` keeps serving the demo project's token.** It is a public route and that is correct; the defect was ever linking a signed-in user to it, which Story 4.4 fixed. | AGENTS rule #2 |
| 7 | Story 6.4 is a **Sweeper**: less code, same behaviour, no regressions, **and the old path proved unreachable** — no route renders it, no selector matches it, and a guard fails if it returns. `globals.css` holds **48** `.product-shell` references today; a scripted CSS prune needs a **parsed-rule** diff and will still be wrong the first time. | LEARNINGS |
| 8 | Story 6.4 **changes no pixel.** Prove it with the visual gate, which by then covers all 29 routes. | Story 6.4 |
| 9 | **No deferred row exists without an owner and a date**, and the gate fails when the date passes. The last epic shipped five deferred rows at birth. | Story 6.5 |
| 10 | The ratchet is on: a PR that lowers coverage **fails**. | Story 6.5 |
| 11 | ⚠️ **`/talk` is in scope and was missing from the scaffolded README's D6 list**, which named only `/hub/*`, `/login`, `/signup`, `/install` and `/s/[token]` — eight routes, not nine. Story 6.2 already lists it. The count that is right is **9**. | **D5-b** |

## Stories

### Story 6.1 — The second seam ✳ *executes D6's open question* — ✅ **DONE** (`design-system/Frame.tsx`)
**As a** product owner, **I want** the nine non-`ProductShell` routes behind a switch too,
**so that** the redesign covers the whole product rather than 21 of 30 routes.
**Acceptance:** the seam the architecture lock chose — **`design-system/Frame.tsx`, carrying DD3's
`door` and `public` variants** — is implemented as decided, **not re-decided here**. ⚠️ It reads no
flag: this said "reading the same `isDesignV2Enabled()`", and there is none (D6, 2026-08-31). It is
shared chrome. Root `layout.tsx` was considered and **rejected** at the lock: it also wraps `/` and
`/methodology`, which two shipped epics own. That the 9 routes render is proved by the `authed`
suite, not by reading the diff.
**Risk:** high

### Story 6.2 — The doors — ✅ **DONE** (5 routes + the designed 404, `app/s/[token]/not-found.tsx`)
**As a** person arriving at the product, **I want** the first screens to speak the product's
language, **so that** signing in is not a change of visual worlds.
**Acceptance:** `/login`, `/signup`, `/install`, `/s/[token]` and `/talk` render from
`design-system/`, each with an approved reference state.
- **`/install` keeps serving the demo project's token.** It is a public route and that is correct
  (AGENTS rule #2); the defect was ever linking a signed-in user to it, and Story 4.4 fixed that.
- ⚠️ **CORRECTED 2026-08-29 — there is no expired state, and that is a decision.**
  `app/s/[token]/page.tsx` calls `notFound()` for unknown, malformed, expired **and** revoked alike,
  so the page cannot tell an attacker which one a token is. This story previously asked for "the
  expired state" as a designed page, which would have been a builder implementing a security
  regression to satisfy a doc. All four cases land on **`public-gone`**, one designed 404 whose copy
  deliberately does not say which. Found by reading the route while designing it (finding F2).
**Approved states:** `door-login`, `door-signup-closed`, `door-signup-open`, `public-install`, `public-share`, `public-gone`, `public-talk` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 6.3 — The hub — ✅ **DONE** (4 routes; `hub.module.css` kept for the report's tables, with a decay date)
**As an** internal reader, **I want** the roadmap hub on the system, **so that** the four `/hub`
routes stop being a separate product.
**Acceptance:** `/hub/[project]`, `/hub/[…]/epic/[epicSlug]`, `/hub/[…]/horizon` and
`/hub/[…]/report` render from `design-system/` with reference states. `hub.module.css` is retired
into the system or explicitly kept with a written reason.
**Approved states:** `hub-roadmap`, `hub-epic`, `hub-horizon`, `hub-report` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 6.4 — Delete the old world ✳ *Sweeper* — ✅ **DONE** (59 rules deleted; `old-world.test.ts`, mutation-verified)
**As a** builder on the next epic, **I want** exactly one stylesheet to reason about,
**so that** a rule I write cannot be silently overridden by the design this epic replaced.
**Acceptance:**
- `globals.css`'s `.product-shell` rules and `console.css`'s compensations for them are **deleted**,
  including `.product-shell main > h1`'s `clamp(30px, 7vw, 48px)` (contract Do-not #1).
- ⚠️ **NOTHING TO RETIRE — there was never a flag** (D6, Daniel, 2026-08-31). This bullet asked for
  `DESIGN_V2_ENABLED` and `isDesignV2Enabled()` to be removed from `lib/flags.ts` and from all three
  Vercel environments. Neither ever shipped: the predicate was written at the start of Sprint 3 and
  deleted in the same sitting. **Verify the absence instead** — `DESIGN_V2_ENABLED` and
  `isDesignV2Enabled` appear in no source file and in no Vercel environment — which is a grep, not a
  story's worth of work.
- **The old path is proved unreachable**, not merely unused: no route renders it, no selector matches
  it, and a guard fails if it returns.
- Behaviour is unchanged — this story changes no pixel. Prove it with the visual gate, which by now
  covers all 29 routes.
**Risk:** high

### Story 6.5 — 27 of 27, and the ratchet on — ✅ **DONE** (`scripts/design-coverage.test.mjs` watches the ratchet go red)
**As a** product owner, **I want** coverage to be complete and unable to slip,
**so that** the next epic inherits the rails instead of rebuilding them.
**Acceptance:**
- The manifest reports **27 / 27**. ⚠️ *Corrected at the lock (**D13**): 29 was 32 pages minus
  3 out of scope, before this epic's own Story 4.5 retired three routes and Story 4.3 added one.
  Two booleans are manifest fields; the third — "passes the visual gate" — is the gate's RESULT and
  deliberately not a field, because a field for it would be `true` on `main` by construction.*
- **The visual gate is blocking**, and **no deferred row exists without an owner and a date.** The
  last epic shipped five deferred rows at birth; this one ships with a decay date on each.
- The ratchet is on: a PR that lowers coverage **fails**.
- `references/ux-guidelines.md` and `CONSOLE-CONTRACT.md` point at `apps/web/design-system/` as the
  one home, and `Roadmap/README.md`'s poster records that the design now lives in code.
**Risk:** high


## ⚠️ Inherited from Sprint 5 — read before flipping any manifest row

**A `coveredBy` string in `console-visual.authed.spec.ts` is a CLAIM, and four of them were false.**
Sprint 5 found that `funnel.spec.ts`, `impact.spec.ts`, `journey-management.spec.ts` and
`experiment-governance.spec.ts` were named as covering four routes counted toward the coverage
number — and all four are `api`-project specs with no session. `journey-management.spec.ts` does not
open a page at all. Two of those routes were verified by nothing.

**One is still live and it is yours:** `/s/[token]` names `e2e/report-share.spec.ts`, which has zero
`page.goto` calls. It is inert only because that row is still `rendersFromDesignSystem: false`. The
moment this sprint flips it, the route counts toward coverage with nothing verifying it renders.

The fix is the one Sprint 5 used: mint a real share token in the authed fixture and let the gate's
own loop open the route, rather than naming a sibling spec. **Do not reword the string.**

Same question for every row this sprint flips: does something actually OPEN it? `EXPECTED_SKIPS` is
where a route goes to stop being checked.

> ### ✅ CLOSED — and the answer to "does something actually OPEN it?" for all nine
>
> `/s/[token]` left `EXPECTED_SKIPS`. `auth.setup.ts`'s `seedShareFixture` mints a real `team`-lens
> token — the widest, so the gate opens the page with its report body **and** both roadmap strips
> rather than the least markup — and the loop opens the route with it. The `coveredBy` string was
> **deleted, not reworded**. `shareToken()` **throws** rather than skipping if the mint failed: a
> skip nobody decided reads exactly like a suite that ran, which is the whole defect.
>
> The other eight are opened directly by the loop. Verified by reading the gate's own output rather
> than by trusting the code: it now prints **"23 route(s) opened here; 4 covered elsewhere"**, and
> all four of those siblings genuinely open their route in a browser — Sprint 5 checked the two that
> did not and re-pointed them.

## Sprint QA — what was actually built, and where it lives

- **the visual gate** (`e2e/console-visual.authed.spec.ts`, `authed` project, blocking): the nine
  new rows are driven by the manifest like every other, plus **one new assertion** — `every ds-
  element sits inside a .ds ANCESTOR` — added because the four existing ones all passed on a page
  whose entire stylesheet was missing (see the defects section above). Mutation-verified both ways. `/s/[token]` **left `EXPECTED_SKIPS`** and is
  opened with a token `auth.setup.ts` mints via the product's own `generateShareToken` +
  `hashCredential` — not invented, and not a `coveredBy` label on an API-only spec.
- **the old-world guard** — ⚠️ `apps/web/design-system/old-world.test.ts`, **not** the
  `e2e/*.spec.ts` the QA note named. It reads stylesheets and component source; it makes no HTTP
  request and starts no browser, so the Playwright `api` project is the wrong home for it. Three
  assertions, each **observed failing** before the file was committed: re-adding a
  `.product-shell__tab` rule, re-adding `className="auth-shell"` to a page, and re-adding Do-not #1's
  `clamp(30px, 7vw, 48px)`.
- **the ratchet's own test** — ⚠️ `scripts/design-coverage.test.mjs`, not
  `e2e/coverage-ratchet.spec.ts`, for the same reason: it drives a CLI against a real throwaway git
  repository. Six cases, including the one that matters — uncover a route, regenerate, and watch the
  ratchet **go red naming `/login`**. Until now nothing ran that script except CI, on the happy path.
- **`e2e/design-v2-dark.spec.ts` was NOT deleted, because it never existed** — there is no flag and
  never was (D6). Verified by enumerating all three Vercel environments rather than by a grep, which
  is what caught the first attempt returning a false "0 matches" from an errored CLI.
- **browser smoke owed:** yes, to Daniel — **signing up and signing in as a brand-new user in
  Production** (step 2) and **opening a real share link while signed out** (step 3). Both are
  auth-path and neither is covered by an automated smoke.
- **deterministic gate, run locally before the PR:** `npm run typecheck` ✅ · `npm run build` ✅ ·
  `npm run test:unit` **1634 pass / 0 fail** ✅ · Playwright `api` **492 pass** ✅ · `authed`
  **123 pass** ✅ · `browser` **62 pass** ✅ · `check-design-drift` ✅ · `extract-css --check` ✅ ·
  `design-coverage --check` **27 / 27** ✅.

## Sprint 6 — Smoke walkthrough (do these in order)

Env: **production · https://goldenfrijoles.com**, after this PR merges. Every step names what it is
for and what "wrong" looks like, because "it looked odd" is not a bug report anyone can act on.

1. Open https://goldenfrijoles.com/login in a **private window**.
   → **One centred column on the dark roast ground** — same type, same buttons, same field styling as
   the console. Not a card floating on a different palette, which is what `.auth-shell` gave you.
   → Type a wrong password. The error appears **on the password field**, the button does not move,
   and the message does **not** say whether that email is registered. That last part is the point:
   an error that distinguishes them is a way to test which of your customers uses this product.
   → ⚠️ **There is no "Forgot your password?" link, deliberately.** The approved design has one and
   the product has no reset flow behind it — see correction 5 above. **This is the step where you
   decide whether that gap gets an epic.**

2. *(Owed to Daniel by name — auth path, and no automated smoke covers it.)* Sign up a fresh
   disposable account at https://goldenfrijoles.com/signup, then sign in.
   → The door is the same one as step 1. The password hint says **"At least 8 characters"** — the
   number the API actually enforces, not the twelve the mock promised.
   → Confirm the email. You land on **`/app/onboarding/<slug>`**, which shows your API key once. The
   door's note says exactly that; if it says "Setup › Connect" the correction did not ship.
   → Delete the account afterwards.

3. Open a real share link `https://goldenfrijoles.com/s/<token>` while **signed out**.
   → A slim bar with the mark and **one** action, then a "Read only" stamp and the report. There is
   **no way into the product** from this page — the mark is not even a link. A share link that
   quietly offers a way in is a share link that leaks a map of the account.
   → ⚠️ **Expected asymmetry, stated so it is not reported as a bug:** the report's *tables* still
   look like the old hub. That is the deferred row above, owned by Daniel with a decay date.
   → Now mangle a character in the token and reload.
   → You get the designed **`public-gone`** page: a broken-link mark, "This link is not working", and
   a sentence saying we deliberately do not tell you which of expired / revoked / never-existed it
   is. **If it names one of them, that is a security bug, not a copy bug.**

4. Go to https://goldenfrijoles.com/hub/miyagisanchez.
   → The hub is the same product as `/app`: the same bar, its own three tabs (Roadmap · Horizon ·
   Report), and a **Back to the console** action. The build-order track sits above the epic list, and
   the legend's three numbers are derived from the same array the track draws — if the track and the
   legend disagree, that is the exact defect this epic is named after, reappearing.
   → ⚠️ **The project switcher and ⌘K are NOT in the hub's bar.** Recorded as a deviation in
   `app/hub/hub-frame.tsx`, not an oversight: reaching them needs `ProductShell`, whose `section` is
   a closed union of the four console sections, and widening it would re-decide DD2.
   → Click **Horizon**. Each destination card carries a lamp AND the word — *lit*, *partly lit*, *on
   the way* — in three strengths of one colour, never three hues.

5. Go to https://goldenfrijoles.com/app/flags/miyagisanchez.
   → **Unchanged from Sprint 4.** This is the step that checks the Sweeper moved nothing: Story 6.4
   deleted 38 rules from `globals.css` and 16 from `console.css` and re-declared the winning half in
   `design-system/system.css`. The top bar is still 54px, the section row still 44px, the rail still
   sits at 98px. The visual gate asserts all four numbers, but a person looking at the page is the
   check that a *screenshot* cannot be wrong about.
   → **Three changes are expected here and are not regressions** — they are named in the commit and
   in `system.css`: the project switcher / account dropdown menus have a slightly lighter ground (they
   were reading the *landing's* `--espresso`, which is what D2 and D3 exist to prevent), and on a
   session-less demo dashboard the project chip is sentence-case rather than UPPERCASE MONO.

6. Open the PR's CI run, step **Design coverage + ratchet**.
   → It prints **COVERED (both) 27 / 27 (100%)**. The visual gate is a separate blocking step and is
   green. No deferred row is listed without an owner and a date — the two that exist name Daniel and
   2026-11-30, and `route-manifest.test.ts` fails the day that passes.

7. Confirm the flag that never existed still does not.
   → `DESIGN_V2_ENABLED` / `isDesignV2Enabled` appear in **no source file** and in **none** of the
   three Vercel environments. Verified 2026-09-01 by *enumerating* all three (32 production vars, 11
   preview, 10 development) and searching the list — ⚠️ the first attempt grepped the CLI's output
   directly and returned "0 matches" because the **command had errored**, which is a false green of
   exactly the shape this epic exists to catch. There is one design now, and one shell stylesheet.

If any step fails, note the step number + what you saw — that's the bug report.

## What this sprint does NOT claim

Stated because a close-out that lists only what worked is not an audit:

- **The signed-in production walkthrough is owed to Daniel** and has not been run by me. Steps 2 and
  3 are auth-path and no automated smoke covers them; step 1's judgement call is his by definition.
- **`console.css` still exists**, with ~150 `.is-console` rules that are not shell chrome — the
  command palette, the console rail, modals, the environment picker — every one on a bare class name
  (`.btn`, `.pill`, `.tag`). `tokens.css`'s generated header used to promise the `.is-console` alias
  would be retired "in Sprint 6 with the rest of the old world". **It was not, and the promise is
  corrected in `extract-css.mjs` rather than left standing.** What Sprint 6 retired is the
  `.product-shell*` family, which is a different thing.
- **The two rail components carry two class names each** (`console-rail ds-rail-slot`). The layout
  rules live in `system.css`, which may only match `ds-`-prefixed selectors (D3), and renaming the
  components outright would have touched fifteen `console.css` rules and three specs inside the
  sprint that is already deleting a stylesheet.
