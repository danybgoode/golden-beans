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

## Uppercase (Do-not #3: exactly two places, and never in mono)

**6** uppercase elements in the content column:
`listhead` · `SPAN` · `h-state` · `h-meta` · `h-act` · `grp on`

## The spec

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
| Content column | 14 / 400 | Archivo | 1180 × 791 | none |
| Page h1 | 23 / 700 | Archivo | 479 × 35 | none |
| Page subtitle | 13.5 / 400 | Archivo | 479 × 41 | none |
| The answer line | 13.5 / 400 | Archivo | 1120 × 68 | none |
| Stat number | 26 / 600 | IBM Plex Mono | 31 × 34 | none |
| Stat label | 12.5 / 400 | Archivo | 241 × 19 | none |
| List header row | 11 / 600 | Archivo | 1118 × 36 | uppercase |
| Feature row | 14 / 400 | Archivo | 1118 × 71 | none |
| Feature key | 13.5 / 500 | IBM Plex Mono | 614 × 20 | none |
| Feature description | 12.5 / 400 | Archivo | 430 × 19 | none |
| State pill | 12 / 600 | Archivo | 48 × 26 | none |
| Switch | 14 / 400 | Archivo | 38 × 21 | none |
| Dormant summary row | 14 / 400 | Archivo | 1118 × 89 | none |
| Primary button | 13.5 / 600 | Archivo | 115 × 38 | none |
| Secondary button | 13.5 / 600 | Archivo | 175 × 38 | none |
