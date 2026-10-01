---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: sketch-specs
title: "Sketch specs — a surface spec renders the grey wireframe and becomes the state contract"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 2
stories_total: 5   # 6 groomed; S2.3 moved out at the lock (C5) — the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 52  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# ✅ Epic: Sketch specs — a surface spec renders the grey wireframe and becomes the state contract

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/sketch-specs.md`](../../00-ideas/seeds/sketch-specs.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in the Why section below, not here; this comment never names
     that heading literally, so an edit anchored on it cannot land inside the comment). -->

## Why
Today a screen is approved as hand-made prototype HTML, and CI's state contract is extracted from it afterwards, so what the product owner approves and what the build is checked against are two artifacts. This epic lets a screen be written once as a `surface` block (state, route, the blocks in order with the words that matter), rendered as a grey wireframe for approval, and used directly as the route's state contract. The flow, state, sequence, architecture, data and copy formats the portfolio seed proposed are dropped: `intent-match`'s Mermaid diagrams and tables already are those specs. The pitch, the split with `intent-match` and the diagram are in the [seed](../../00-ideas/seeds/sketch-specs.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). S1 is kit tooling (a parser and a zero-dependency renderer); S2 changes this repo's design-system contract generator (`apps/web/design-system/state-contract.mjs`), which is a CI gate's input, not runtime code. Every change under `skills/` is a plugin release.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — A surface block is a signature written first:** state id, route, then one line per block (kind, the words that matter, and only `action`, `count` and `columns` as facts). No values, row counts or pixels. The same data a `STATE-CONTRACT.json` entry holds.
- **D2 — A line grammar, not YAML** (the kit is zero-dependency); fenced as ` ```surface ` in a seed. The lock fixes the exact grammar.
- **D3 — A generic vocabulary of about twelve kinds** in the kit, and a project `surface.map.json` mapping each onto its own kinds (this repo: onto the 47 in `state-contract-core.mjs`'s `BLOCK_KINDS`). The lock lists which of the 47 are reachable.
- **D4 — The renderer is deliberately grey** and never imports the design system.
- **D5 — One source per state id.** Prototype or spec, never both; a duplicate id fails `state-contract.mjs`. The 33 prototype states are not migrated.
- **D6 — Approval is a hash.** An approved surface is copied to `apps/web/design-system/surfaces/<state>.surface` and gets an `APPROVED.md` line with its SHA-256; `--check` fails on a mismatch (Rail 2, as for the prototype).
- **D7 — `intent-match` writes the blocks.** Its visuals rule (amended 2026-09-29) already writes screens as `surface` blocks with ten-state names; this epic renders and contracts them, and adds no format for flows, states, sequences, containers, data or copy.

## Architecture lock (2026-09-30, verified against `main` @ 0e1ac23 and the live `STATE-CONTRACT.json`)

Builders cite these; the sprint files' build contracts cite them in turn and restate nothing.

### Scope the live system corrected (said out loud)
- **C1 — 38 states, not 33.** `STATE-CONTRACT.json` holds 38 (33 console + 5 from `approved-prototype.html`, batch 6);
  `route-manifest.test.ts` pins 38. Every "33" above reads as 38.
- **C2 — Nothing checks the prototype's hash today.** `git grep 5bc7e24ed5e3d0aa` finds it only in `APPROVED.md`; no
  script or test compares it with the file. D6's "as for the prototype" describes a rule, not a check. The surface
  hash check (D12) is the **first mechanical approval check** in the repo. Extending it to the two prototypes is out
  of scope (a follow-up, named in the retro).
  **⚠️ Corrected 2026-09-30 at close-out — C2 was WRONG.** `apps/web/design-system/tokens.test.ts` has compared both
  prototypes' SHA-256 with `APPROVED.md` since #128 (2026-08-29), in `test:unit`. It reads the hash out of
  `APPROVED.md` by regex, so a grep for the literal value found nothing. D12 is the first hash check on a *spec*
  surface, alongside those two prototype pins, not the first in the repo, and there is no follow-up. Found by the
  close-out audit (#212); the lesson is in LEARNINGS.
- **C3 — The seed template already ships an incompatible `surface` shape.** `groom/templates/scope-seed.md` writes
  `route:` / `state: empty` / `blocks:` / `  - heading: "…"` / `  - empty-state:` / `  - primary-action:`: a YAML-ish
  list with other kind names, and `state:` holding a taxonomy word instead of an id. D7 only holds if S1 rewrites
  the template example and the visuals rule to D8's grammar, so it does (1.3). No seed in the repo uses the old
  shape (`git grep '```surface'`: the template, this epic and its seed only), so nothing migrates.
- **C4 — The walkthrough's "three entries with `source: spec`" contradicts D5.** Those three states are defined by
  the prototype; defining them again by spec is the duplicate D5 forbids, and removing them from the prototype is
  the migration D5 rules out. D5 wins (it is a numbered decision; the walkthrough was derived from it). Parity is
  proven by **fixtures compared in a test** (D14), and `STATE-CONTRACT.json` holds **zero** spec entries until a
  real approved surface lands. Sprint 2's walkthrough is rewritten to exercise the duplicate and hash refusals.
- **C5 — Story 2.3 is cut to its own cut line.** It waits for an epic that adds a console state; on 2026-09-30 the
  board's only ready epic is `cms-integration-spike` and no funnel seed at the front adds one. 2.3 is recorded
  ⏭ deferred, not built, and the epic ships without it.
- **C6 — Only three of 38 states are byte-identically expressible.** A spec emits `annotations: 0` (a designer's
  callout is never a spec block), so a state qualifies only when every block is one of D10's twelve and its
  prototype entry has `annotations: 0`: `ship-features`, `ship-features-dormant` and `ship-activity`. The first two
  have the same signature, so byte-parity covers two distinct signatures; D14 adds three blocks-level comparisons
  to cover what those miss (a trailing empty column, a tile count, a glyph in an action).

### Decisions
- **D8 — The grammar** (fixes D2). A block is a fenced ` ```surface ` in markdown (CommonMark: ≤3 spaces of indent,
  backticks or tildes, info string exactly `surface`), or the whole of a `.surface` file (no fence).
  ```
  # a comment line
  state: ship-features                 required, once — [a-z0-9]+(-[a-z0-9]+)*
  route: /app/flags/[projectSlug]      required, once — starts with /
  - head "Features" action "+ New feature"
  - summary count 4
  - list columns "feature | state in production | type & risk | on / off"
  ```
  Header lines (`state:`, `route:`, either order) come before the first block line; any other `key:` is an error.
  A block line is `- <kind>`, then at most one quoted **words** string, then facts as `<name> <value>` pairs in any
  order, each at most once: `action "<text>"`, `count <integer ≥ 0>`, `columns "<a> | <b> | …"`. Strings are
  double-quoted on one line with `\"` and `\\` escapes. Blank lines are skipped. At least one block.
  **Refused with a pointer:** `when:` (a surface is ONE state — write the empty state as its own block) and the C3
  legacy shape (`blocks:`, `- heading: "…"`). Every error reads `<file>:<line>: <message>` with the **file** line
  number; an unknown kind names the nearest known kind and lists all twelve.
- **D9 — The parse result** (1.1's acceptance shape, plus line numbers): `{ state, route, line, blocks: [{ kind,
  words, line, action?, count?, columns? }] }` — `words` is a string or `null`, `action` the text as written,
  `count` a number, `columns` an array of trimmed strings (`"a | b |"` → `["a", "b", ""]`: a trailing bar is an
  unlabelled column, which is how an actions column reads today). Case is kept; normalising is the project's job (D13).
  Exports: `parseSurfaces(markdown, file)` → every fenced block; `parseSurface(text, file, firstLine = 1)` → one bare
  block; `SURFACE_KINDS`; `SurfaceError` (carries `file`, `line`).
- **D10 — The generic vocabulary is twelve kinds, each with the facts it may carry** (fixes D3): `head` {action} ·
  `answer` · `summary` {count} · `tiles` {count} · `toolbar` · `list` {columns} · `empty` · `card` · `steps`
  {count} · `field` · `tabs` · `note`. A fact on a kind that does not carry it is an error at parse time.
- **D11 — `surface.map.json` lives at `apps/web/design-system/surface.map.json`** (`{ "_": "<what it is>",
  "kinds": { "<generic>": "<BLOCK_KINDS kind>" } }`). This repo maps all twelve **by identity**: every generic
  name already exists in `BLOCK_KINDS`. **Reachable: 12 of 47** (`head answer summary tiles toolbar list empty card
  steps field tabs note`). The other 35 — `plot smallplots bars crumbs kpis dialoghead dialogbody dialogfoot demobar
  sharehead talkgrid goneglyph goneacts gonequiet band legend sectionlabel sprints destinations haze provenance
  document doorbrand title doorform doorfoot doornote versions builder-steps builder-panes results-tabs results-top
  results-kpis results-two callout` — stay prototype-only. The kit ships `validateMap(map)` (keys are generic
  kinds, values non-empty strings); this repo's test adds that every value is a `BLOCK_KINDS` kind (1.2).
- **D12 — Approval is a hash line, checked** (fixes D6 + C2). An approved surface lives at
  `apps/web/design-system/surfaces/<state>.surface`, a bare block whose `state:` equals the file name. `APPROVED.md`
  gains `## Approved surfaces`, a table `| State | File | SHA-256 (first 16) | Approved by | Approved |` — the
  prototype's own 16-hex convention. The check fails on: a surface with no row, a row whose hash is not the first 16
  hex of the SHA-256 of the file's bytes, a row naming a file that does not exist. It runs in
  `state-contract.mjs --check` (the acceptance) **and** in a unit test over the live folder, so the static job
  catches drift without a browser.
- **D13 — Spec → entry lives in `apps/web/design-system/surface-contract.mjs`, pure** (no browser, no `_harness`),
  so the generator and the tests share one implementation. Per block: map the kind (D11); emit exactly the facts
  the mapped `BLOCK_KINDS` entry declares, in the shape `extractSignature` produces — `{ kind, <fact> }`, with an
  absent `action`/`columns` as `null` and an absent `count` **refused** (a tile row with no count is ambiguous, and
  `extractSignature` would record 0); a fact the mapped kind does not record is **refused** (this repo's `steps`
  records no count, so `steps count 3` is an error here rather than a silently unenforced number). `action` and
  each column are normalised the way `extractSignature`'s `text()` does it: whitespace collapsed, trimmed,
  lower-cased. The entry is `{ missing: false, blocks, disclosures: 0, annotations: 0, unknown: [], source: 'spec' }`
  — `source` is the only key a prototype entry lacks, so prototype entries (and 38 × their bytes) do not change.
  `state-contract.mjs` appends spec entries after the prototype ones, sorted by id, and fails on an id that is
  already a prototype state or appears twice (D5). The `_source` header names `surfaces/*.surface`.
- **D14 — Parity by fixture** (2.2, per C4 + C6). `apps/web/design-system/surface-parity/` holds
  `ship-features.surface`, `ship-features-dormant.surface`, `ship-activity.surface`; a test converts each and asserts
  `JSON.stringify(entry without source)` equals `JSON.stringify(STATE-CONTRACT.json's entry)`. Three more —
  `setup-keys`, `measure-journeys`, `measure-scenarios` — are compared on `blocks` only, their one difference being
  a designer annotation a spec cannot contain. The folder is not a contract input and needs no approval line.
- **D15 — Where the kit files live.** `lib/surface.mjs`, `sketch-render.mjs` and their tests exist **byte-identical**
  in `scripts/` and `skills/template/scripts/` (`check-script-parity.mjs`). `groom`'s `requires_scripts` gains
  `sketch-render.mjs` and `lib/surface.mjs`. S1 is plugin + kit **0.16.0** with a CHANGELOG section and re-rendered
  adverts. The map, `surface-contract.mjs` and everything under `apps/` are this repo's (no plugin release in S2).
- **D16 — The renderer** (fixes D4). `sketch-render.mjs <file.md|file.surface> [--out <file.html>]` imports only
  `node:*` and `./lib/surface.mjs` (a test reads its source and fails on anything else). No `--out` → it writes
  `<os.tmpdir()>/sketch-<basename>.html` and prints the path, so a render never litters `Roadmap/`. One
  self-contained page: inline `<style>`, greys only, no `<script>`, no external URL; one `<section>` per block headed
  `state · route`; every word escaped. A file with no `surface` block, or any parse error, exits 1 with the D8 error.

## What already exists (reuse, don't rebuild)
- `apps/web/design-system/state-contract.mjs` (generator, `--check`) + `state-contract-core.mjs` (`BLOCK_KINDS`, `extractSignature`), `STATE-CONTRACT.json` (38 states — C1).
- `APPROVED.md` (hash-as-approval), `approved-states.mjs`, `e2e/console-visual.authed.spec.ts` (built route vs contract, unchanged).
- `references/ux-guidelines.md` (the ten-state taxonomy) and `system.css`.
- `intent-match`'s visuals rule and seed template (the blocks' author), `build-kit`'s `requires_scripts` closure.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The `surface` grammar and parser | low |
| 1 | 1.2 Generic vocabulary and project mapping | low |
| 1 | 1.3 The grey renderer | low |
| 2 | 2.1 Approved surfaces feed the state contract | low |
| 2 | 2.2 Parity on three approved states | low |
| 2 | 2.3 First state built from a spec *(cut 1st — ⏭ deferred, C5)* | low |

## Routing
1.1 and 2.1 on the strongest tier (the grammar and the contract seam). The rest go to builders against the locked contract. Review per the router.

**As run (2026-09-30):** the architect (Claude, Opus) builds 1.1, 1.2, 2.1 and 2.2 — 1.2 is the map and one test, and 2.2
is fixtures against the seam 2.1 defines, so both ride with their contract story. 1.3 (the renderer) goes to a
Sonnet-class builder against D8–D10 and D16, in its own worktree off `feat/sketch-specs`. Built **in place** on the
stack otherwise: this is the only session in the checkout. Every PR is reviewed via
`node scripts/review-route.mjs --builder claude <PR#>`.

**Amended 2026-09-30:** the 1.3 builder died on a session rate limit before writing a file (its worktree held a
branch and nothing else, checked with `git status`); rather than respawn into the same limit, the architect built
1.3 too. Every story in the epic is therefore Claude-built, which is what the review router is told.

## Kill switch (Stage 6b)
Not required (`risk: low`): planning tooling and a CI gate's input; no runtime seam. Rollback is reverting the generator change (S2) or pinning the previous plugin version (S1).

## Deploy order
Stacked branches `feat/sketch-specs` → `-s2`, merged in order. S1 is a plugin release; S2 is this repo only. Builds after `intent-match` S2 (its visuals rule writes the blocks).

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed) — #210 `307999c`, #211 `e7e5f5f`, both deployed; owed to Daniel: whether a wireframe reads, and the signed-in `/app/flags` look (S2 step 4)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — `risk: low`, none planned at grooming. **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [x] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
