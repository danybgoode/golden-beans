---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Building       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: intent-match
title: "Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 3
stories_total: 9   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 48      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/intent-match.md`](../../00-ideas/seeds/intent-match.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
Nothing measures whether a groomed pitch captures what the product owner meant, so gaps surface as "that's not what I
meant" after the build. This epic keeps the ask verbatim, scores each pitch against it with Jev (advisory, labelled
uncalibrated), names the artifact that closes each gap, makes a system diagram the default for every shaped bet, and
asks at every epic close whether we built what was meant, seeded with past epics from golden-frijoles and
medusa-bonsai. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/intent-match.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). Kit scripts, groom skill text and templates only; every change under
`skills/` is a plugin release, and medusa-bonsai picks it up by pinning the new plugin version.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — Advisory only (E6).** The score can add a step; it never blocks a scaffold or removes approval.
- **D2 — One statistic per Noul/Score** (the ReAnchor spike's lesson), so every signal can be fitted later.
- **D3 — The score at the gate is coverage (in + out), clarity and teach-back.** Total = 100 × equal-weight mean of
  the signals present, labelled "uncalibrated"; bands 80 / 60 are placeholders.
- **D4 — The reader is optional and never Claude** (product owner, 2026-09-29). `intentReader: off` by default; when on,
  one pass from the first of codex, agy, vibe that answers, a hard timeout, and any failure is a one-line skip. It never
  blocks or stalls the lock.
- **D5 — The ask is stored verbatim** in the seed, with numbered claims (split by the groom agent, editable) and the
  teach-back answer.
- **D6 — Visuals are drawn from the shape of the ask** (groom Stage 4.6): a system context for every M/L bet, plus the
  triggered diagram types, in Mermaid; a screen is a `surface` block (the `sketch-specs` format), its states named from
  the ten-state taxonomy. *(Amended 2026-09-29 at the `sketch-specs` groom; no story added.)*
- **D7 — The close label is a retrospective line** (`_Intent: yes | mostly | no_`), required by `epic-dod` only for
  epics whose seed carries a score.
- **D8 — Backfilled pitches are flagged `ask: proxy`**; no agreement is backfilled.

## Architecture lock (2026-09-29, verified against `main` @ `8aef03a` and live data)

### Corrections the live system forced (said out loud, not silently absorbed)
- **C1 — `intentReader` is not a key the config loader accepts.** Settings are `<section>.<name>` over a closed
  `SECTIONS` list (`lib/config.mjs`), and every askable setting is a `REGISTRY` row. The setting is **`intent.reader`**
  (`off | on`, default `off`), in a new `intent` section with one registry row.
- **C2 — The scorer is not a Jev *rail*.** `RAILS` is closed (`review`, `prose`); a rail means `off/shadow/jev`, a
  threshold, a regex fallback and a shadow expiry. The score has no deterministic rule to fall back to and decides
  nothing (D1). So it reads `jev.egress` and `jev.model` from the same loader and asks only when egress is `true` and a
  key exists; otherwise "could not look". `jev-eval` evaluates an `intent` fixture set beside its rails without making
  `intent` a rail (`parseJevConfig` would refuse it).
- **C3 — The ten-state taxonomy's home (`references/ux-guidelines.md`) is local-only** (`references/` is gitignored,
  public-monorepo D7) and not in the kit, so a stranger's groom could not open it. Stage 4.6 names the ten states
  inline, from `design-system-rails` F2.1: **idle · hover · focus · pressed · loading · success · error · empty ·
  disabled · unbuilt**.
- **C4 — The cross-agent runners have no timeout, and fail noisily.** `runCodex`/`runAntigravity`/`runVibe` call
  `spawnSync` with no `timeout`, agy retries on a second model, and a soft failure prints its own `⚠` line. The reader
  needs one hard deadline and exactly one skip line, so `cross-agent-cli.mjs` exports its argv builders (`agyArgs`,
  `vibeArgs`, beside the existing `codexExecArgs`) and the reader spawns each family once, with `timeout`, never
  through the retrying wrappers.
- **C5 — A pitch that carries the ask verbatim would score its own ask.** Coverage-in asks "does the pitch address
  this claim?"; with the ask in the state, every claim is trivially present. The state strips `## The ask, as given`,
  any `## Intent match` section and the frontmatter.
- **C6 — Most past seeds have no `## Problem`.** Shipped epics with a seed: 30 of 36 here (19 with `## Problem`), 81 of
  149 in medusa-bonsai (**5** with `## Problem`). The proxy ask is `## Problem` when present, else the seed's opening
  prose (between the H1 and the first `##`, which is where the "As the product owner, I want…" lines live).
  Seeds run to 27k characters, well under Jev's 110k state budget.
- **C7 — medusa-bonsai's plans are its own.** This repo is public. Fixtures drawn from medusa-bonsai pitches are
  anonymised (the `jev-eval` precedent: "consuming project A"), and medusa-bonsai's backfill record lives in
  medusa-bonsai, not here.
- **Pre-existing, not this epic's:** `doc-format --check` fails on 6 files at `main` (`experiments-for-humans` ×5,
  `public-monorepo` retro); not touched to make this epic look green. *(Corrected at the S1 push: the stale
  `BUILD-ORDER.md` noted here WAS this epic's — its plan commits never regenerated the board. Regenerated in S1.)*

### Decisions (D9…D19 — the builder cites these; D1…D8 above stand)
- **D9 — The seed format is the parser's contract.** `## The ask, as given` holds the product owner's words (a
  blockquote), then `### Claims` (a numbered list, `1. …`, split by the groom agent, editable), then a line
  `**Teach-back:** yes | partly | no — <the mirror sentence>`. Acceptance criteria are the list items under the first
  heading matching `## Acceptance…`. Frontmatter gains `intent_match: <n> | null` and `intent_ask: verbatim | proxy`.
  A section that is absent makes its signal absent — never zero.
- **D10 — One Jev call scores; a second routes.** State = `{ pitch, claims: {c1…}, criteria: {a1…} }`; questions
  `in_<i>` (Noul), `out_<j>` (Noul), `clar_<j>` (Score, 4 levels). The scorer prints the question count first. A
  second call asks one Choice per gap (D14). Timeout 30 s per call (40-odd questions in one request).
  `askJev`'s over-budget refusal is the "never truncated" guarantee.
- **D11 — The statistics.** Coverage in = mean P(true) over claims; coverage out = mean P(true) over criteria; clarity
  = mean score ÷ 3 over criteria; teach-back = yes 1 · partly 0.5 · no 0; agreement = P(true). **Total = round(100 ×
  equal-weight mean of the signals present)**, printed with "uncalibrated" and the names of the signals present. Bands:
  **80+ build · 60–79 resolve the follow-ups first · below 60 sketch or spike first**. A gap is a claim with P < 0.5
  (uncovered) or a criterion with clarity < 0.5 (unclear); a criterion with coverage-out P < 0.5 is listed as
  untraced ("trace it or cut it"), not routed.
- **D12 — Output and exit codes.** `0` scored · `2` could not look (its own code, LEARNINGS) · `1` usage. `--json` for
  tools; `--write` puts `intent_match:` into the seed's frontmatter and replaces its `## Intent match` section, with
  the components in a `<!-- intent-match: {…} -->` comment so the reader step can recompute the total. Each run
  appends one line to `.jev/decisions.jsonl` through `logDecision` (`rail: 'intent'`, the signals present).
- **D13 — Every question lives in one exported object**, `INTENT_QUESTIONS` (id → `{ type, instructions, criteria }`,
  the `REVIEW_QUESTIONS` shape: `criteria.true`/`.false` for a Noul), so `compiled-prompts` can move it unchanged.
- **D14 — The route vocabulary** (Jev Choice): `copy_deck · wireframe · flow · data_sample · state_machine · sequence ·
  container_diagram · spike · think_chain`. `think_chain` prints as "think chain (answer by hand until think-skills
  ships)". Stage 4.6 draws from the same words.
- **D15 — Wording is measured, not guessed.** `jev-eval.fixtures.json` gains an `intent` set (≥ 30 labelled items:
  one claim or criterion against its pitch, each with the answer it should get). `jev-eval --live` records it once; the
  decided/right counts go into `INTENT_QUESTIONS`' comment.
- **D16 — The reader.** `intent-reader.mjs --epic <slug>`. With `intent.reader: off` it prints one line and exits 0
  before touching a CLI. On: codex → agy → vibe, the first whose binary exists; one spawn with a hard `timeout`
  (default 120 s); the reply must carry the three prompt headings (*Will build*, *Won't build*, *First question*).
  **Never Claude** — not in the list, and a spec pins that. Then one Jev Noul, "same build?", with state `{ plan: the
  epic README, reading: the reply }`. Agreement is written into the epic README's `## Intent match` section and the
  total recomputed with it. Any failure — no CLI, cap, timeout, empty or unstructured reply, Jev could not look —
  prints exactly one `reader skipped: <why>` line and exits 0. The kickoff's lock step always names the command;
  off, it costs nothing.
- **D17 — The close label.** `templates/RETROSPECTIVE.md` gains `_Intent: yes | mostly | no_` under `_Closed:`.
  `epic-dod` gains a sixth item, `intent-answered`: an epic is **scored** when its README or its seed carries a
  numeric `intent_match:`; a scored epic needs `_Intent: yes_`, `_mostly_` or `_no_` in its retro, and an unscored
  epic passes with "not scored". The template's own `yes | mostly | no` never counts as an answer.
- **D18 — `intent-outcomes.mjs`.** `--repo <path>` repeatable (default `.`). A row per scored epic: the score from the
  seed/README frontmatter, or from the repo's `Roadmap/00-ideas/intent-backfill.json`; the answer from the retro's
  `_Intent:`; `ask: proxy` flagged; corrections **derived from files** — stories added after scaffold (README
  `stories_total` now vs. at its first commit), dated amendments (`Amended YYYY-MM-DD`), disproved scope
  (`disprov…`). Footer: "n of 20" = scored epics with an answer.
- **D19 — The backfill.** A mixed sample of 24 shipped epics that have a seed (12 per repo, spread across sprint
  counts), each scored on the seed **as approved**: the seed's content at the commit that first added the epic
  README (`git show <sha>:<seed>`). Proxy ask per C6, claims split by the orchestrator (the groom agent's role), no
  teach-back (never recorded, so absent). Records go to each repo's own `intent-backfill.json`; the product owner's
  answers go into each retro's `_Intent:` line, the one place an answer lives. medusa-bonsai is scored with
  `--root ../medusa-bonsai`, under its own `jev.config.json`.

### Build contracts (locked by the architect before the builder started)
**S1 · `feat/intent-match` · plugin 0.10.0.** New `template/scripts/intent-match.mjs` (+ `.test.mjs`), copied
byte-identical to `scripts/`. Pure core (`parseSeed`, `buildRequest`, `scoreAnswers`, `band`, `formatReport`) and an
injected-I/O shell; `askJev`/`loadJevConfig`/`readApiKey`/`logDecision` reused, never re-implemented. Covers D9–D15.
`jev-eval.mjs` gains the `intent` set (C2, D15), in all its copies. groom's `requires_scripts` declares
`intent-match.mjs` so it ships in the kit closure. Tests: a replay client, no key, no network; every "could not look"
path (no key, egress `null`/`false`, over budget, a malformed answer) exits 2 with no number.

**S2 · `feat/intent-match-s2` · plugin 0.11.0.** `templates/scope-seed.md` (D9 sections + `## Visuals` with a
`surface` block example); `scaffold-epic.mjs` copies the seed's `intent_match:` into the README frontmatter;
groom `SKILL.md` Stage 3.5 (run `intent-match.mjs --write`) and Stage 4.6 (the visuals table, C3's ten states,
D14's words); `lib/config.mjs` `intent` section + registry row (C1); `lib/cross-agent-cli.mjs` exports `agyArgs`/
`vibeArgs` (C4); new `intent-reader.mjs` (+ tests, one per skip path); `templates/epic-kickoff.md` names the reader in
step 1. `doc-format`/`roadmap-extract`/`build-order` already tolerate the new keys (probed: adding
`intent_match: 72` to a seed and a README changed no check's output).

**S3 · `feat/intent-match-s3` · plugin 0.12.0.** `templates/RETROSPECTIVE.md` (D17); `epic-dod.mjs` `intent-answered`
in all three copies (`scripts/`, `skills/scripts/`, `skills/template/scripts/`), the new case observed failing
first; new `intent-outcomes.mjs` (+ tests over fixture repos, git fixtures sealed); the backfill (D19).

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`askJev`, `effectiveMode`, `logDecision`), `lib/review-guard.mjs`'s
  `noul`/`choice` question pattern, `jev-eval.mjs` + `jev-eval.fixtures.json`.
- `lib/cross-agent-cli.mjs` (`runCodex`, `runAntigravity`, `runVibe`), `review-route.mjs`'s family order,
  `cross-panel.mjs`'s single-pass shape.
- The groom skill (`skills/plugins/golden-frijoles/skills/groom/`): `SKILL.md`, `templates/scope-seed.md`,
  `templates/RETROSPECTIVE.md`, `emit-epic-kickoff.mjs` + `templates/epic-kickoff.md`.
- `skills/scripts/epic-dod.mjs` (`isRealClosedDate`), `skills/scripts/lib/roadmap-contract.mjs`, `build-kit`'s closure.
- The history: 34 shipped epics here, about 120 in medusa-bonsai (same Roadmap layout).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `intent-match.mjs`: question sets, one statistic each, total + bands, "could not look" without Jev | low |
| 1 | 1.2 Gap routing (Jev Choice) *(cut 1st)* | low |
| 1 | 1.3 Labelled fixtures and measured wording (`jev-eval --live`) | low |
| 2 | 2.1 Seed template: the ask as given, numbered claims, teach-back, `## Visuals` | low |
| 2 | 2.2 Groom Stage 3.5 (score) and Stage 4.6 (visuals rule) | low |
| 2 | 2.3 An optional reader at the lock, off by default, skipped on any failure | low |
| 3 | 3.1 `_Intent:` in the retro template + an `epic-dod` item for scored epics | low |
| 3 | 3.2 `intent-outcomes.mjs` across repos: the join, derived corrections, "n of 20" | low |
| 3 | 3.3 Backfill: golden-frijoles and medusa-bonsai samples scored and answered *(medusa half cut 2nd)* | low |

## Routing
1.1, 1.3 and 2.2 on the strongest tier (question wording and the groom stages are judgement). The rest go to builders
against the locked contract. Review per the router.

**As run (2026-09-29):** the architect (Claude, strongest tier) builds every story itself. The stories share hot files
(the scorer's parser feeds S2's template; S3's `epic-dod` and outcomes read S2's frontmatter), so a fan-out would pay
three integrations for no parallelism. The builder is therefore `claude` for `review-route.mjs`.

## Kill switch (Stage 6b)
Not required (`risk: low`): planning tooling, advisory by construction, no runtime seam. Rollback is pinning the
previous plugin version.

## Deploy order
Stacked branches `feat/intent-match` → `-s2` → `-s3`, merged in order, one plugin release per sprint. The backfill
(3.3) runs after S3's release is installed in both repos.

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
