---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Building      # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: semantic-lint
title: "Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow)"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 1
stories_total: 3   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 49      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow)

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/semantic-lint.md`](../../00-ideas/seeds/semantic-lint.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
The rules that cost most have no check. AGENTS rule 1 (no parallel telemetry pipeline) depends on a reviewer noticing
a paraphrase: a usage table under another name, an analytics route, a vendor SDK call. This epic adds a rail where
deterministic selectors pick candidate lines and Jev judges only those, raise-only, and proves it on rule 1 in shadow for
two weeks. The pitch, measurements and flow are in the [seed](../../00-ideas/seeds/semantic-lint.md).

## Platform-first note
Reinforces rule #1; touches no engine data or route. Kit script, config and the advisory pre-push hook only. Every change
under `skills/` is a plugin release.

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — Jev judges what deterministic selectors pick.** Globs + added-line patterns + an allowlist select candidates;
  no candidate, no Jev call. One Noul per candidate per rule (one statistic, fittable later).
- **D2 — Raise-only, and "could not look" is never a pass.** No key, egress off, timeout or oversized hunk prints
  "not checked" and logs it.
- **D3 — One committed switch.** `lib/jev.mjs` `RAILS` gains `lint`; `jev.rails.lint` holds `mode`, per-rule
  `threshold` and `shadowExpires`, so `scripts-guard.yml`'s expiry step covers it unchanged.
- **D4 — Rules are data** in a `lint` section of `golden-frijoles.config.json` (`rules[]`: id, globs, patterns,
  allowlist, question, severity), plus one config-registry row so `gf doctor` shows it (no CLI change). *(The doctor
  half is disproved — see C2.)*
- **D5 — Local only in v1.** The advisory pre-push hook runs it on changed files; no workflow has `TYPESAFE_API_KEY`,
  and adding it is a production-secret decision left for promotion.
- **D6 — Only candidate hunks leave the machine**, under the existing `jev.egress` answer.

## Architecture lock (2026-09-30, against `main` @ 7f6d416)

Verified against live code and data before any code. Where the live system disproved the groomed scope, the correction
is stated here, out loud; builders cite these, never a paraphrase.

**Scope corrected by the lock**

- **C1 — `jev.rails.lint` lives in `jev.config.json`, not `golden-frijoles.config.json`.** `readSection` lays the new
  file's *top-level keys* over the legacy file's (`lib/config.mjs`, "the NEW FILE WINNING PER TOP-LEVEL KEY"), so a
  `jev.rails` in the new file would replace the legacy `rails` object whole and silently put the promoted `review` and
  `prose` rails back to `off`. The switch stays in the file that already holds the other two.
- **C2 — `gf doctor` cannot show a `lint.rules` line.** It prints one line per *module* (`packages/cli/src/modules.ts`
  `moduleLines`), skips `never-yet` rows, and loads the *published* kit. The registry row still lands (it declares the
  section); the visible check is `node scripts/config.mjs get lint.rules` (`gf-kit config get lint.rules`). Smoke step 5
  is rewritten to that.
- **C3 — 30 labelled fixtures, not 10–20.** `jev-eval.mjs` fails any judge with fewer than `MIN_FIXTURES = 30`. Lowering
  the floor for one rail would weaken a guard, so rule 1 gets 30.
- **C4 — In the kit closure, through `jev-eval`** *(corrected during the build)*. The lock first said "not in the
  closure": `build-kit --list` was read on the pre-rebase tree. On `main` @ 7f6d416 the `golden-frijoles` skill
  declares `jev-eval.mjs` (the Jev setup proof), and `jev-eval` replays the lint set, so `check-skill-scripts` requires
  `semantic-lint.mjs` in that skill's `requires_scripts:` — declared, and the kit packs it. A plugin release either way:
  **0.12.1 → 0.13.0**.
- **C5 — `jev-report.mjs` gains a `lint` summary.** It reads only `review`/`prose` rows today, so the promote/tune/drop
  decision owed on `shadowExpires` would have no report. Minimal: per `lint:<id>`, decisions and raise / uncertain /
  clear / not-checked counts.
- **C6 — The pre-push hook is not "advisory" end to end.** Both hooks have a BLOCKING section (build-order, scripts
  unit tests). The lint goes in the ADVISORY section and is called `… || true`; it never contributes to the exit code.
- **C7 — Globs.** Migrations are `apps/web/supabase/migrations/**`, already inside `apps/web/**`; the rule's glob is
  just `apps/web/**`.

**Decisions (the build contract cites these)**

- **D1 — Candidate = one hunk, sent as a window.** From `git diff -U3 --no-color --diff-filter=d <range>`: a hunk in a
  file that matches a rule's `globs` and none of its `allowlist`, with at least one ADDED line matching one of its
  `patterns` (JS RegExp source, compiled with `i`). *Amended during 1.2, measured:* what is sent is the hunk's `@@`
  header plus ±15 lines around each matching added line (merged, gaps marked `…`), not the whole hunk — a new file is
  one hunk, and on 220 commits of `main` 33 of 60 whole-hunk candidates were over `HUNK_CHAR_LIMIT`, so nearly every
  new route and migration would have been "not checked". With windows: 3 of 40. One Noul per candidate per rule, question id `violates`. No candidate → no Jev call and
  no log line.
- **D2 — Four outcomes, one statistic.** `p ≥ threshold` → **raise**; `p ≤ 1 − threshold` → **clear**; between →
  **uncertain**; anything else → **not checked** with the reason: no key, egress false/null, timeout or any
  could-not-look, a `noul` that is not a number in [0,1], a hunk over `HUNK_CHAR_LIMIT` (6,000), past `MAX_CANDIDATES`
  (20) or the run's time budget (60 s). Not-checked is logged and printed; it is never counted as clear.
- **D3 — The switch.** `RAILS = ['review', 'prose', 'lint']`; `DEFAULT_CONFIG.rails.lint = { mode: 'off', thresholds:
  { default: 0.8 }, shadowExpires: null }`. For `lint` only, a threshold key is `default` or a rule id
  (`/^[a-z0-9][a-z0-9-]*$/`), each 0…1; unknown keys stay refused for the other rails. This repo's `jev.config.json`:
  `lint: { mode: 'shadow', thresholds: { default: <measured> }, shadowExpires: '2026-10-14' }`. The template's
  `jev.config.json` is unchanged (defaults = off).
- **D4 — Rules are data.** `SECTIONS` gains `lint`. This repo gets its first `golden-frijoles.config.json`, holding only
  `{ "lint": { "rules": [...] } }` (verified: a section the new file lacks still reads from its legacy file alone). A
  rule is `{ id, source, severity: blocking|should-fix|nit, globs[], allowlist[], patterns[], question: {
  instructions, criteria: { true, false } } }`; `semantic-lint.mjs` owns the parser (the config core never validates a
  section) and a malformed rule throws, loud. Registry row `lint.rules`: module Build, `askWhen: 'never-yet'`,
  `default: null` (the `routines` precedent).
- **D5 — Local only.** Both pre-push hooks pass the pushed ranges as `--range <base>...<head>` (repeatable), read from
  the refs git gives the hook on stdin; with no `--range`, `@{upstream}...HEAD`, then `origin/main...HEAD`.
- **D6 — Egress.** The state sent is `{ rule, source, file, hunk }` for one candidate. Mode `off` or no rules exits
  before `jevContext`, so an off rail never fires the `jev.egress` ask on a stranger's push.
- **D7 — The log.** One `logDecision` per candidate: `rail: 'lint:<id>'`, `mode`, `decider: 'jev' | 'not-checked'`,
  `regex: null`, `jev: outcome === 'raise'` (null when not checked), `confidence: p`, `text: hunk`, `source:
  '<file>@<head sha>'`, `evidence: { file, outcome }`, `error`.
- **D8 — Eval.** `lint` fixtures live in the shared `jev-eval.fixtures.json`: `{ id, rule, file, hunk, label, origin:
  'history:<sha>' | 'constructed', recorded: { model, questionHash, answers }, decision }`. Replay runs the real judge
  with the rule from the project's `lint` config and fails when the question's hash differs from the recording's
  (wording changed → `--live`). A fixture whose rule the project lacks (the template's own run) is skipped, loudly.
  Reported like `intent`: decided (raise or clear) and how many of those were right. `scripts-guard.yml` also triggers on
  `golden-frijoles.config.json`.
- **D9 — Output.** One summary line per run, e.g. `semantic-lint (shadow): lint:rule-1 — 2 candidate(s): 1 would raise
  (p=0.93 apps/web/app/api/x/route.ts), 1 clear · logged, not shown as findings`. `nothing to judge` when there are no
  candidates, `not checked (<reason>)` when Jev could not look. In `jev` mode raised candidates print as findings with
  their severity. Exit 0 always, except 2 for a malformed config (which the hook still ignores). No blocking mode in v1.

**Routing (amended at the lock).** All three stories are built by the architect (Claude), in place — one builder, the
only session in this checkout; 1.1 is shared surface (`lib/jev.mjs`, `lib/config.mjs`) anyway. Review per
`review-route.mjs --builder claude`.

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`askJev`, `effectiveMode`, `logDecision`, `parseJevConfig`, `RAILS`).
- `skills/template/scripts/lib/config.mjs` + `skills/scripts/lib/config-registry.mjs`.
- `jev-eval.mjs` + `jev-eval.fixtures.json` (and its offline replay in `scripts-guard.yml`), `jev-report.mjs`.
- `.githooks/pre-push` (already advisory; also in `skills/template/.githooks/`).
- Rule 1's live shape: writes to `events`/`features` only in `apps/web/app/api/v1/{track,features/sync}/route.ts`;
  tests (`apps/web/e2e/**`) and `scripts/seed-*` write directly by design.
- The `jev-semantic-guards` shadow → report → promote playbook (`shadow-report-2026-09-23.md`).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `semantic-lint.mjs`, the `lint` config section, `RAILS` gains `lint` | low |
| 1 | 1.2 Rule 1 as data, 10–20 labelled diffs, wording measured | low |
| 1 | 1.3 The pre-push hook runs it on changed files, in shadow for two weeks | low |

## Routing
1.2 (question wording) on the strongest tier; 1.1 and 1.3 to a builder against the locked contract. Review per the
router. *(Amended at the lock: the architect builds all three — see the lock's Routing line.)*

## Kill switch (Stage 6b)
Not required (`risk: low`). The rail is `off | shadow | jev` in one committed file; shadow is advisory by construction.

## Deploy order
One branch, one PR, one plugin release. `shadowExpires` is set two weeks after merge; the promote/tune/drop decision is
owed to Daniel on that date.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — `risk: low`, none planned at grooming. **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
