# The console visual contract

**Binding. This file and `flags-console-prototype.html` are the design contract for every
signed-in route. They are not "inspiration".**

## Why this file exists

The epic README originally said, in my own words:

> *"a reference end-state is inspiration, never signed-off scope — the acceptance criteria below
> are the contract, not the pixels."*

That sentence is the reason the console shipped looking nothing like the approved design. Every
acceptance criterion in Sprints 1–3 was **structural** — *"the header renders one project switcher
and four sections"* — and the shipped build **satisfies all of them** while looking like a different
product. A builder cannot hit a visual target described in prose, and nothing in the plan could
fail on the way it looked.

That sentence is withdrawn (epic README, **A20**). WAYS-OF-WORKING's rule about reference
end-states exists to stop a *spec doc* being treated as signed-off scope. It does not mean an
explicitly approved design has no force. Where the product owner has approved a design, **the design
is the contract**, and this file makes that mechanically checkable.

## The rule

> **Measured, not described.** Every number below was read out of the approved prototype by
> `measure-contract.mjs`. If the prototype changes, regenerate this table — never hand-edit it, and
> never restate a number in a story.

Reference states are **derived, not stored**: `render-reference.mjs` renders them from the committed
prototype, so a baseline can never drift from the design it claims to represent.

```bash
node apps/web/design-system/measure-contract.mjs           # regenerate MEASURED-SPEC.md
node apps/web/design-system/measure-contract.mjs --check    # CI: fail on any diff
node apps/web/design-system/render-reference.mjs            # the 32 reference PNGs
node apps/web/design-system/extract-css.mjs                 # regenerate tokens.css / reference.css / tokens.ts
```

> **MOVED 2026-08-29 — `design-system-rails` Story 1.1, closing Mechanism F.** This file, the
> prototype, the harness and all three scripts now live in **`apps/web/design-system/`**. They used
> to live in `Roadmap/02-commercial/console-ia-overhaul/design/` — a folder named after an epic that
> is `shipped`, which is the mechanism this whole epic exists to kill: *the design has no home that
> outlives the work that produced it.*

> ### ✅ Both corrections from epic close are now closed by construction (2026-08-29)
>
> **1. Neither command ran.** Both scripts imported `./_harness.mjs`, which was never committed — so
> on a fresh clone of `main` they died with `ERR_MODULE_NOT_FOUND`, for four days, through an entire
> build, because nothing in CI ran them. The harness is committed, both scripts moved to
> `apps/web/design-system/`, and **CI now runs `--check` on both** — a missing import fails in
> minutes rather than in four days. (Mechanism D.)
>
> **2. The claim above was true of the size/weight column and not of the Box column.** The table was
> a hand-written narrative of what the script printed, and two of its numbers did not survive
> re-measurement:
>
> | Row | Written here | A fresh run says |
> |---|---|---|
> | Project switcher | `140 × 30` | **`122 × 30`** |
> | Feature row | `h 78` | **`1118 × 71`** |
>
> **Correcting those two numbers by hand would have been the same defect a second time.** So the
> table is gone from this file and the numbers are **generated**: see
> [`MEASURED-SPEC.md`](./MEASURED-SPEC.md), which `measure-contract.mjs` emits under a
> do-not-hand-edit header and CI regenerates and diffs. A number nobody can reproduce can no longer
> be committed here and then reasoned about as intent. (Mechanism C.)

## The one assertion that would have caught this on day one

At **1440 × 960**, signed in, on **Ship › Features** in Production with the dormant group collapsed:

| Property | Approved | Shipped 2026-08-28 |
|---|---|---|
| `document.documentElement.scrollHeight` | **960** — equal to the viewport, the page does not scroll | ~2400+ |
| Feature rows rendered | **2**, plus one dormant summary line | 25 |
| `document.body.scrollWidth > innerWidth` | **false** | true (tables clipped) |

Three numbers. Any one of them fails on the current build. **Wire these first** — before any CSS —
so the gate is red while the work is being done, and going green is what "done" means.

## The measured spec

**It is not in this file any more, and that is the fix.** Every number lives in
[`MEASURED-SPEC.md`](./MEASURED-SPEC.md), which is **generated** by
`node apps/web/design-system/measure-contract.mjs` and regenerated-and-diffed in CI.

Ground: `--roast` `#16120d`.

> ⚠️ **CORRECTED 2026-08-29 (`design-system-rails` D2-c).** This section used to end with *"Every
> colour comes from `references/design/assets/tokens.css`; the prototype introduced no new ones."*
> **That is false.** `tokens.css` does not define `--card-2`, `--card-3`, `--line-soft`,
> `--green-deep` or `--red-deep` — five colours — nor `--r`, `--r-lg`, `--shadow`, `--shadow-hi` or
> `--t`. It also disagrees on one value it does define: `--roast-2` is `#221b13` there and
> `#1c1710` here, and **both are on screen today** (the landing's alternating band and the
> console's). `console.css` carried the identical false claim in a comment. The product token set is
> now generated onto `.ds` in [`tokens.css`](./tokens.css) from the approved prototype, so the two
> sets can no longer silently disagree about anything.

## Do-not list — each of these is visible in the shipped build

1. **The page `h1` must not use the `display` class.** `globals.css`'s
   `.product-shell main > h1` sets `clamp(30px, 7vw, 48px)`; the approved h1 is **23px/700** on one
   line. *"Feature flags — miyagisanchez"* currently wraps to two lines and takes 100px of vertical
   space before any content.
2. **Rail items carry no description and no `GATED` badge.** Story 1.4 as I wrote it said the rail
   renders *"with their existing inventory descriptions"* — that instruction produced the
   three-line cards on screen, and it was wrong. A rail item is one line, 36px. What a surface *is*
   belongs on the surface, not in the navigation. `ConsoleRail.tsx` drops the `<small>` and the
   `data-surface-status` badge.
3. **Uppercase appears in exactly two places, and never in mono.** Measured: the list header row
   and the group heading, both **11px Archivo 600**. Everything else is sentence case. The build
   renders *"WHAT THIS LIST REPORTS IS WHAT PRODUCTION IS SERVING"*, *"SHOWING 25 OF 42 FEATURES"*
   and *"RECENT ACTIVITY"* in uppercase mono — that is a column-label style being used as a body
   style. `measure-contract.mjs` prints the uppercase element count; it is the cheapest check here.
4. **The AgentRail does not sit inside the console's content width.** It is in none of the ten
   reference states. It currently takes ~25% of the viewport and squeezes the content column to
   ~530px, which is why every table clips. Either it moves out of the console grid or it is not
   rendered on console routes — **this is a decision the epic never made, and it must be made
   explicitly rather than inherited.**
5. **Environment is a rail control, not chips in the page body.** Story 1.4 said this and it did not
   land: `development / preview / production` still render as tags inside the flags page.
6. **No horizontal page scroll, ever.** Wide content scrolls inside its own `overflow-x: auto`
   container. Both screenshots show clipped tables.
7. **No page copy about storage.** *"Definitions, immutable versions and their audit remain visible
   while flag serving is dark. Activating or deactivating a flag changes one environment snapshot
   with optimistic revision protection."* is still the live subtitle. Every user-facing word goes
   through `flag-vocabulary.ts`. **This sentence is covered by no story in the epic** — that is a
   gap in my plan, closed by Story 3.0c.

## How the gate works

`e2e/console-visual.authed.spec.ts`, in the **`authed`** project.

> ⚠️ **CORRECTED 2026-08-29 (`design-system-rails` D5-a).** This line used to say the **`browser`**
> project. `playwright.config.ts` matches `*.authed.spec.ts` to `authed`, and `ci.yml` runs this one
> file as its own blocking step with every gate env var mirrored — so the gate is already blocking
> on every PR. The `browser` project runs **nowhere**, which is why `landing.browser.spec.ts` is red
> on `main`. Every new visual row lands in `authed` or it is not in the gate.

1. **The three assertions above** — no vertical scroll, 2 rows + 1 summary, no horizontal scroll.
   Cheap, stable, and each maps to a sentence the product owner said.
2. **A computed-style table check** — for each row of the measured spec, assert the real element's
   font size, weight and height. This is what makes "looks like the mockup" mechanical. Tolerance
   ±1px on heights, exact on font-size and weight.
3. **A screenshot diff** against `render-reference.mjs`'s output, at a deliberately loose threshold
   (structural, not pixel-perfect) — it catches layout drift the style table misses.

**Every one of these must be observed failing on the current `main` before the work starts**
(WAYS-OF-WORKING: *every new spec was observed failing at least once*). They will be. That is the
point — the plan had no assertion that could go red on a bad-looking page, and now it does.

## Porting

[`reference.css`](./reference.css) is the prototype's stylesheet, extracted verbatim (regenerate:
`node apps/web/design-system/extract-css.mjs`). **Port from it, not from this document's prose.** Its class names are the prototype's; mapping them onto the `ds-`-prefixed
names under `.ds` (epic D3) is the work. Where the two disagree, [`MEASURED-SPEC.md`](./MEASURED-SPEC.md) wins.
