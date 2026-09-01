# The measured spec — Ship › Features at 1440 × 960

⚠️ **GENERATED — DO NOT HAND-EDIT.** Regenerate with:

```bash
node apps/web/design-system/measure-contract.mjs
```

CI runs `--check` and **fails on any diff**, so a number here cannot be argued into existence.
Source: `apps/web/design-system/console-prototype.html`, the 32 states approved 2026-08-29
(`APPROVED.md`). Font is whatever the prototype resolves; the Family column says which.

> **Why this file exists rather than a table inside `CONSOLE-CONTRACT.md`.** That table was
> hand-written under a heading reading *"Measured, not described"*, and two of its numbers did not
> survive re-measurement — the project switcher (written `140 × 30`) and the feature row (written
> `h 78`). A story then reasoned about `78` as declared design intent. Correcting those two numbers
> by hand would have been the same defect a second time; generating the file is the fix.

## The three assertions the visual gate leads with

| Property | Measured |
|---|---|
| Ground | `rgb(22, 18, 13)` |
| No vertical page scroll | **true** |
| No horizontal page scroll | **true** |
| Feature rows rendered | **2** |
| Dormant summary line present | **yes** |

⚠️ **`2` rows is the PROTOTYPE's dataset, not production's.** Production
`miyagisanchez` carries 42 flags with **3** active in Production and **39** never activated
(queried 2026-08-29 — epic README, D10). The gate asserts the *shape* — rows plus at most one
summary line, the summary standing for rows that are not also listed — never the literal number.

## Uppercase

Do-not #3 says uppercase appears in **exactly two places, and never in mono**: the list header row
and the group heading.

⚠️ The count below is of ELEMENTS, not of places, and the two numbers are different on purpose — a
previous version of this heading said *"exactly two places"* directly above a count of six, which
reads as the generated file contradicting itself (cross-family review, agy). The list header row is
one place rendered as four elements (the row plus its three column labels), and the group heading is
the second. Two places, six elements.

**6** uppercase elements in the content column:
`listhead` · `SPAN` · `h-state` · `h-meta` · `h-act` · `grp on`

## The spec

> **`_text-sized_`** means that dimension is decided by how a glyph run rasterises, and **does not
> reproduce across platforms** — measured here and on `ubuntu-latest`, the same webfonts loaded and
> verified loaded, `Page h1` is 479px wide on one and 496px on the other. Writing a number there
> would be recording a fact about one machine and calling it the design, which is the same defect
> D8 catches in the hand-typed `140 × 30`. Those dimensions are emitted as a marker and are **not
> compared** by `--check`; everything else is, exactly. No contract-cited number is affected — the
> switcher's `122 × 30`, the feature row's `71`, the rail item's `36`, the list header's `36`, the
> pill's `26` and the switch's `38 × 21` all reproduce on both.

| Element | Size / weight | Family | Box | Transform |
|---|---|---|---|---|
| Top bar (tier 1) | 14 / 400 | Archivo | 1440 × 54 | none |
| Project switcher | 13 / 400 | Archivo | 122 × 30 | none |
| Section nav (tier 2) | 14 / 400 | Archivo | 1440 × 44 | none |
| Section tab · active | 13 / 500 | Archivo | 51 × 43 | none |
| Section tab · inactive | 13 / 400 | Archivo | 59 × 43 | none |
| Rail (tier 3) | 14 / 400 | Archivo | 236 × 862 | none |
| Rail item · active | 13.5 / 600 | Archivo | 207 × 36 | none |
| Rail item | 13.5 / 600 | Archivo | 207 × 36 | none |
| Content column | 14 / 400 | Archivo | 1180 × _text-sized_ | none |
| Page h1 | 23 / 700 | Archivo | _text-sized_ × 35 | none |
| Page subtitle | 13.5 / 400 | Archivo | _text-sized_ × 41 | none |
| The answer line | 13.5 / 400 | Archivo | 1120 × 68 | none |
| Stat number | 26 / 600 | IBM Plex Mono | _text-sized_ | none |
| Stat label | 12.5 / 400 | Archivo | 241 × 19 | none |
| List header row | 11 / 600 | Archivo | 1118 × 36 | uppercase |
| Feature row | 14 / 400 | Archivo | 1118 × 71 | none |
| Feature key | 13.5 / 500 | IBM Plex Mono | 614 × 20 | none |
| Feature description | 12.5 / 400 | Archivo | _text-sized_ × 19 | none |
| State pill | 12 / 600 | Archivo | 48 × 26 | none |
| Switch | 14 / 400 | Archivo | 38 × 21 | none |
| Dormant summary row | 14 / 400 | Archivo | 1118 × 89 | none |
| Primary button | 13.5 / 600 | Archivo | _text-sized_ × 38 | none |
| Secondary button | 13.5 / 600 | Archivo | _text-sized_ × 38 | none |

<!-- NOT-COMPARED-BELOW -->

## The chrome budget — how far down each approved state's first DATA begins

⚠️ **EVIDENCE, NOT CONTRACT. Every number below this line is emitted as a MARKER and is NOT compared
by `--check`.**

The numbers are text-layout positions, and they do not reproduce across platforms — the same reason
`Page h1`'s width is `_text-sized_` in the table above. Measured on macOS and on `ubuntu-latest`:
`ship-features` is 458 here and **459** there, and `today` is 223 here and **202** there, because the
lede wraps differently under different font metrics. Committing them as a compared contract is
recording a fact about one machine and calling it the design, which is the defect this whole file
exists to prevent — and CI said so on the first run of the version that did it.

So `--check` stops at the marker above, and the BUDGET the gate asserts is a stated bound rather than
a byte-exact weld: see `CHROME_BUDGET_PX`, which `console-spec.test.ts` holds to being at least this
table's maximum and within a stated allowance of it. That keeps the constant derived from the design
without letting a one-pixel renderer difference turn the gate red.

⚠️ **This table replaced an assertion that was green for the wrong reason.** The visual gate used to
require every covered route to fit 1440 × 960 without scrolling, citing *"a page that scrolls means
the chrome is eating the viewport"*. Measured against the design itself, **11 of the 23 approved console
states scroll** — so the gate asserted a property the approved design does not have, and passed only
because the fixture tenant is thin.

What that assertion was FOR is a budget on **chrome**: a 48px `h1` wrapping to four lines, a
three-line rail card, a summary strip that eats the screen. None of those is about how many rows a
tenant has. The **Chrome** column is the top of the first element carrying data, and its maximum is
the budget `console-gate-spec.ts` asserts — welded by `console-spec.test.ts`, so the constant
cannot drift from the design.

**Chrome budget: 458px**, set by `ship-features`.

| State | Chrome | Page height | Fits 960? |
|---|---|---|---|
| `ship-features` | 458 | 960 | yes |
| `ship-features-dormant` | 458 | 2273 | **no** |
| `feature-value` | 458 | 960 | yes |
| `feature-environments` | 458 | 960 | yes |
| `feature-funnel` | 458 | 960 | yes |
| `setup-connect` | 223 | 960 | yes |
| `setup-keys` | 243 | 960 | yes |
| `ship-activity` | 223 | 1274 | **no** |
| `ship-compare` | 259 | 1021 | **no** |
| `measure-north-star` | 267 | 1033 | **no** |
| `measure-journeys` | 287 | 960 | yes |
| `measure-journey` | 301 | 1055 | **no** |
| `measure-scenarios` | 287 | 1103 | **no** |
| `funnel-standalone` | 301 | 960 | yes |
| `today` | 223 | 1711 | **no** |
| `tasks-standalone` | 384 | 1238 | **no** |
| `ship-experiments` | 287 | 960 | yes |
| `experiment-ready` | 301 | 1488 | **no** |
| `experiment-blocked` | 301 | 1625 | **no** |
| `setup-destinations` | 267 | 960 | yes |
| `setup-shares` | 267 | 960 | yes |
| `hub-roadmap` | 267 | 1364 | **no** |
| `hub-epic` | 301 | 960 | yes |
| `hub-horizon` | _no console chrome_ | 1108 | no |
| `hub-report` | _no console chrome_ | 960 | yes |
| `door-login` | _no console chrome_ | 960 | yes |
| `door-signup-closed` | _no console chrome_ | 960 | yes |
| `door-signup-open` | _no console chrome_ | 960 | yes |
| `public-install` | _no console chrome_ | 960 | yes |
| `public-share` | _no console chrome_ | 960 | yes |
| `public-gone` | _no console chrome_ | 960 | yes |
| `public-talk` | _no console chrome_ | 960 | yes |
