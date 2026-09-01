# `apps/web/design-system/` — the design's home, and the reason it has one

**This directory exists because the last three design epics each scoped their design to
themselves.** The approved prototype, the contract, the reference renders and the extracted CSS all
lived in `Roadmap/02-commercial/<some-epic>/design/` — a folder named after an epic that then
closed. Nothing in it described the routes the next epic would build, so the next epic opened its
own `design/` folder and re-derived a visual contract from scratch. That is **Mechanism F** in
`Roadmap/02-commercial/design-system-rails/README.md`, and moving this here is what closes it.

The rule, stated once so it survives this epic too:

> **The design lives in the product, at a product-level path, and it outlives the epic that
> produced it.** A future epic extends what is here. It does not open a new `design/` folder.

## The behaviour layer, and why the pointer only runs one way

`references/ux-guidelines.md` is the **behaviour** layer to this directory's **visual** one: what
the interface owes the person using it, independent of colour and type — the ten-state taxonomy
`system.css` implements, the "never make someone wonder" rule, the split between *disabled* and
*unbuilt* that this system draws differently on purpose.

⚠️ **It does not point back here, and that is deliberate rather than an omission.** Sprint 6's
Story 6.5 asked for a pointer added to the top of that file. It is a **byte-mirrored handoff** —
`check-design-drift.mjs` asserts it is identical to
`references/golden-beans-design-system-proposal/ux-guidelines.md`, the artefact as it was supplied —
so adding the pointer meant either breaking a shipped guard or editing what the designer handed
over and calling it unchanged. Neither is worth a cross-reference.

So the link is one-way, from the side that can carry it. If you arrived from that document: this
directory is the home, and `CONSOLE-CONTRACT.md` beside it is the binding half.

## What is here

| File | Kind | What it is |
|---|---|---|
| `console-prototype.html` | **source, approved** | The 32 approved states. Its content hash is recorded in `APPROVED.md`; **editing it without a new approval line un-approves the design.** |
| `APPROVED.md` | source | Who approved what, when, its hash, and the five design decisions (DD1–DD5) the architecture lock does not reopen. |
| `_harness.mjs` | source | Loads the prototype into a real browser. **Commit it** — its absence killed both scripts on a fresh clone for four days. |
| `render-reference.mjs` | source | Renders all 32 states to `reference/` (gitignored — baselines are *derived*, never stored). |
| `measure-contract.mjs` | source | Measures the prototype and **emits `MEASURED-SPEC.md`**. `--check` fails on any diff. |
| `extract-css.mjs` | source | **Emits `reference.css`, `tokens.css` and `tokens.ts`** from the prototype. `--check` fails on any diff. |
| `CONSOLE-CONTRACT.md` | source | The rule, the Do-not list, and how the gate works. Its spec table is gone — see below. |
| `MEASURED-SPEC.md` | **generated** | Every number, measured. Do not hand-edit. |
| `reference.css` | **generated** | The prototype's stylesheet, verbatim. Port from this, never from prose. |
| `tokens.css` | **generated** | The product token set, scoped to `.ds`. |
| `tokens.ts` | **generated** | The same names as a closed union, so deleting one breaks `tsc`. |
| `route-manifest.ts` | source | The 29 in-scope routes and their three coverage booleans. |

```bash
node apps/web/design-system/extract-css.mjs        # tokens.css · reference.css · tokens.ts
node apps/web/design-system/measure-contract.mjs   # MEASURED-SPEC.md
node apps/web/design-system/render-reference.mjs   # reference/*.png (32 states)
```

## The direction generation runs, and why it runs that way

**The prototype is the source. Everything the product imports is generated from it.**

The obvious alternative — edit the prototype so it `@import`s the same stylesheet the app uses —
was rejected, and the reason is worth keeping: `APPROVED.md` records the approval as the
prototype's **content hash**. Changing the file to import a stylesheet changes that hash, and a
changed hash with no new approval line means the design is **unapproved**. That file exists
specifically to stop *"edit the prototype and quietly leave the hash alone"*.

So generation runs prototype → product, `--check` runs in CI, and *"one definition"* is true by
construction rather than by discipline.

The one transformation applied on the way out is `FONT_STACK_OVERRIDES` in `extract-css.mjs`:
`next/font` generates a hashed family name at build time and exposes it as `--font-sans` /
`--font-mono`, which a `file://` prototype cannot have. It is a table, not a `replace()` buried in a
pipeline, so `tokens.test.ts` can assert that its keys are the *only* permitted differences. A
transformation nothing can enumerate is indistinguishable from a bug.

## Namespacing

Everything here is scoped to **`.ds`** and every class is **`ds-`**-prefixed (epic D3). Verified
free of collisions in `globals.css`, `console.css`, `references/design/assets/tokens.css` and
`hub.module.css` before it was chosen — landing rules reached the console through shared class
names (`.tag`, `.note`) three times in one epic, and `.row` is *already* declared by two
stylesheets. `check-design-drift.mjs` enforces the prefix.

`--roast-2` is a **recorded fork**: `#221b13` on the landing, `#1c1710` in the console. Both are on
screen today. Scoping to a class is what lets both keep their value under one name;
`tokens.test.ts` holds the allow-list entry that says so on purpose.
