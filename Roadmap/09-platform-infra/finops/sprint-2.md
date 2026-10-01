---
epic: finops
sprint: 2
title: "Quotes, calibrated, and the loop closes"
risk: low
phase: Shaping
stories_total: 5
stories:
  - id: S2.1
    title: "quote_* and actual_* in the frontmatter contract"
    as_a: "the product owner"
    i_want: "every epic README to carry its quote and its actual in the same fields"
    so_that: "the history the quotes learn from is one git-tracked record"
    risk: low
    status: planned
  - id: S2.2
    title: "quote.mjs — the calibrated range"
    as_a: "the product owner"
    i_want: "a quote for an appetite computed from my own shipped epics"
    so_that: "quotes get better as we ship more"
    risk: low
    status: planned
  - id: S2.3
    title: "Groom writes the quote"
    as_a: "the product owner"
    i_want: "groom to attach the quote at Stage 1.5 and the scaffolder to write it"
    so_that: "no one ever types a quote"
    risk: low
    status: planned
  - id: S2.4
    title: "The band shows quote vs actual — all four states"
    as_a: "the product owner"
    i_want: "the Spend row to compare against the epic's quote"
    so_that: "I see during the build whether we are inside, near or over what we expected"
    risk: low
    status: planned
  - id: S2.5
    title: "Close stamps the actual"
    as_a: "the product owner"
    i_want: "the epic's actual written into its README at close, automatically"
    so_that: "every shipped epic feeds the next quote with no manual step"
    risk: low
    status: planned
---
# FinOps: quote vs actual per epic — measured from your own sessions, shown live in the build view, sent to the engine — Sprint 2: Quotes, calibrated, and the loop closes

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
Builds on Sprint 1's index and summary. `quote.mjs` reads READMEs through the existing frontmatter reader
(`roadmap-extract` `parseFrontmatter`), never its own. Band states are rendered by `build-state.mjs` `renderLines()` (the
resolver owns the words; the mod only decorates — `build-visualization-claude-mods` D3).

## Stories

### Story 2.1 — quote_* and actual_* in the frontmatter contract
**As** the product owner, **I want** every epic README to carry its quote and its actual in the same fields, **so that** the history the quotes learn from is one git-tracked record.
**Acceptance:**
- `roadmap-contract.mjs` declares `quote_low_usd`, `quote_high_usd`, `quote_basis`, `actual_usd`, `actual_mtok`, `actual_basis` (all optional, numbers or null; basis strings) — the ONE place they are listed (D6).
- `doc-format --check` accepts them, rejects a non-numeric value, and stays green on the whole corpus.
- `roadmap-extract.mjs` emits them on epic rows (feeds 3.2) and `build-order.mjs` still regenerates cleanly.
- **Pulled forward:** landed by the architect at the start of Sprint 1 (1.4 needs it); this story is its tests + docs.
**QA:** `roadmap-contract.test.mjs`, `doc-format.test.mjs`, `roadmap-extract.test.mjs` additions.
**Risk:** low

### Story 2.2 — quote.mjs — the calibrated range
**As** the product owner, **I want** a quote for an appetite computed from my own shipped epics, **so that** quotes get better as we ship more.
**Acceptance:**
- `node scripts/quote.mjs --appetite M` prints one line: `$<lo>–<hi> (M, n=<n>, p25–p75)` from shipped epics with `actual_usd` at that appetite.
- With n < 3 it prints the wide default band from a constant in the same file and says `n=<n>, wide` (D4/D7).
- `--report` prints, per appetite, how many actuals landed inside their quote — the calibration signal.
- `--json` for the scaffolder and the band.
**QA:** pure-logic spec over fixture READMEs: percentile edges, n=0/2/3, mixed appetites, an epic with a quote but no actual (ignored).
**Risk:** low

### Story 2.3 — Groom writes the quote
**As** the product owner, **I want** groom to attach the quote at Stage 1.5 and the scaffolder to write it, **so that** no one ever types a quote.
**Acceptance:**
- Groom `SKILL.md` Stage 1.5 runs `quote.mjs --appetite <A>` and records the line in the seed's `## Appetite`; with no history it says so and carries on.
- `scaffold-epic.mjs --quote <lo>-<hi> --quote-basis "…"` writes `quote_low_usd`/`quote_high_usd`/`quote_basis`; omitted → null, never 0. Its CI throwaway epic passes `doc-format --check`.
- `templates/scope-seed.md` gains a `quote:` line under Appetite; `templates/epic-README.md` carries the fields.
- Plugin + kit version bump with a CHANGELOG section.
**QA:** `scaffold-epic.test.mjs` additions (with/without `--quote`); the CI throwaway-epic render.
**Risk:** low

### Story 2.4 — The band shows quote vs actual — all four states
**As** the product owner, **I want** the Spend row to compare against the epic's quote, **so that** I see during the build whether we are inside, near or over what we expected.
**Acceptance:**
- Inside: `▰▰▰▰▱▱ ≈$38 of quote $30–55 (M) · 1.9M tok · 4 sessions` — bar = actual ÷ quote_high, tone `good`.
- Over: `≈$71 · 29% over quote $30–55 (M) · 3.4M tok` — full bar, tone `bad` (D8, the alert).
- No quote: `≈$22 · no quote · 1.1M tok · 2 sessions` — no bar, never an invented quote.
- Thin history: the quote shows its basis, e.g. `(M · 2 past epics, wide)`.
- The four lines match the mockup approved at grooming (seed → Visuals) — a spec pins each line's text.
**QA:** `build-state.test.mjs` + `build-view.test.mjs`: one fixture per state; the `progressOf`-style bar helper unit-tested.
**Risk:** low

### Story 2.5 — Close stamps the actual
**As** the product owner, **I want** the epic's actual written into its README at close, automatically, **so that** every shipped epic feeds the next quote with no manual step.
**Acceptance:**
- `epic-actuals.mjs --epic <slug> --write` stamps `actual_usd`, `actual_mtok`, `actual_basis: "this machine · <date> · <n> sessions"`; re-running replaces, never adds.
- `epic-dod --check` reports a shipped epic without `actual_usd` as a **warning** naming the command (not a failure — epics shipped before this have none; `epic-dod.exemptions.json` untouched).
- `templates/RETROSPECTIVE.md` gains a `Quote vs actual:` line; the close-out step in WAYS-OF-WORKING's DoD (template + `render-ways-of-working --check`) names the stamp.
- This epic's own retro is the first to use it.
**QA:** `epic-dod.test.mjs` (warning path), `epic-actuals.test.mjs` (`--write` idempotence); `render-ways-of-working --check` for all rendered copies.
**Risk:** low

## Sprint QA
- **pure-logic specs:** `quote.test.mjs`, contract/doc-format/extract additions, `scaffold-epic.test.mjs`, `epic-dod.test.mjs`, band state specs — each observed failing once.
- **release:** plugin + kit bump (groom skill text, templates, hooks, kit closure).
- **browser smoke owed:** no; steps 2–5 owed to the product owner (his history, his groom session).
- **deterministic gate:** skills CI + root CI green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: your Mac · the repo at ~/dobby/golden-frijoles · the plugin updated to this sprint's release

1. Run `node scripts/quote.mjs --appetite M`.
   → one line with a $ range and its n; if fewer than 3 M epics have actuals, it says "wide".
2. In Cowork, groom any small seed to Stage 1.5.
   → the appetite section of the pitch carries a quote line with its basis.
3. On an epic branch whose README has a quote, open Claude Code and send one message.
   → the Spend row reads "≈$… of quote $…–… (…)" with a bar.
4. On an epic branch with no quote, send one message.
   → the Spend row says "no quote" and shows no bar.
5. Run `node scripts/epic-actuals.mjs --epic finops --write`, then `git diff Roadmap/09-platform-infra/finops/README.md`.
   → `actual_usd`, `actual_mtok` and `actual_basis` appear in the frontmatter.

If any step fails, note the step number + what you saw — that's the bug report.
