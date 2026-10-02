---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: think-skills
title: "Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 3
stories_total: 7   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 53  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
actual_usd: 37.02
actual_mtok: 115.1
actual_basis: "backfill · this machine · 2026-10-02 · 1 session · prices 2026-10-02"
---

# ✅ Epic: Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/think-skills.md`](../../00-ideas/seeds/think-skills.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in the Why section below, not here; this comment never names
     that heading literally, so an edit anchored on it cannot land inside the comment). -->

## Why
The three pre-planning coaches exist only in the product owner's claude.ai account, end in a document written in chat, don't hand off to each other, and groom never sees what they produce; the North Star one also mis-triggers because its description is Risk Validation's. This epic ships them in the plugin, has each write a file in `Roadmap/00-strategy/` and offer the next, makes groom add one line per pitch ("Moves: <input metric> · Tests: <dimension>"), and adds `gf north-star set` so the workshop's metric reaches the engine without retyping. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/think-skills.md).

## Platform-first note
The engine already models a North Star and its inputs (`north_star` + `leading_inputs`, written by `POST /api/v1/north-star/sync`, read by `GET /api/v1/north-star`), so S3 is a client command over the existing route: no table, no route, no schema change (rule #1 holds). **Superseded at the lock (C1, D6):** `gf`'s credential can't call that route, so S3 adds one CLI route over the same sync logic. There is still no table and no schema change, and rule #1 still holds. S1 and S2 are skill text, templates and a groom stage. Skill changes are a plugin release; S3 is a CLI release (`@golden-frijoles/cli`).

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — Port, don't rewrite.** The claude.ai account copies are the only source; the coaching text moves as is, with a `summary:`, a corrected `description` for `north-star`, and file-writing endings.
- **D2 — Names:** `pmf-narrative`, `north-star`, `risk-validation`, so they don't collide with the account copies until those are removed.
- **D3 — Output contracts** in `Roadmap/00-strategy/<name>.md`: frontmatter `kind`, `status: draft | agreed`, `updated`, plus fixed headings from each skill's target structure. `north-star.md` adds a JSON block shaped like `northStarSyncSchema`.
- **D4 — The chain:** each ends by offering the next; `risk-validation` reads `pmf-narrative.md` when it exists.
- **D5 — Groom reads strategy only when it exists**, and writes one pitch line; no file means no line and no nag.
- **D6 — `gf north-star set <file>` is a thin shell** (the `flags-write.ts` rule): dry run by default against `GET /api/v1/north-star`; `--yes` posts the block to the sync route once; server-side validation, `issues` rendered on a 400; exit code from the body.
- **D7 — Public artefacts stay separate.** `/northstar-self-serve.md` isn't rendered from the skill; the skills cite sources by name and URL, never a `references/` path (local-only since `public-monorepo` S4.1).

## Architecture lock (2026-09-30, verified against `main` @ 70ee5b7, the live prod database and the live CLI API)

The lock ran after rebasing `feat/think-skills` onto `main` (24 commits behind). Every claim below was checked
against a file, a query or a request, not against the seed.

### Scope the live system corrected (said out loud)

- **C1 — S3's premise was false; the product owner chose a new CLI route (2026-09-30).** `gf` stores a personal
  token (`gf_pat_…`, `packages/cli/src/credentials.ts`) that only `/api/v1/cli/*` accepts (`lib/cli-auth.ts`).
  `GET /api/v1/north-star` and `POST /api/v1/north-star/sync` accept only a project ingest key
  (`resolveProjectFromAuthHeader` → `active_ingest_keys`). So "`gf north-star set` over the existing route with the
  existing `gf` credential" would 401. Asked as an either/or; **answer: a new CLI route** (D6). That puts a route on
  an auth boundary into S3, and the Platform-first note's "no route" no longer holds. There is still no table and no
  schema change.
- **C2 — Sync never "replaces" the metric.** The route upserts `north_star_metrics` on `(project_id, key)` and
  `leading_inputs` on `(project_id, key)`. A metric with a new key is added *beside* the existing one, and an input
  key that already exists is moved to the new metric. Nothing is ever deleted. Live data, prod
  `slweidgffcfndnskcskc`: `golden-beans-demo` and `miyagisanchez` hold one metric each (`payable_sellers`);
  **`golden-beans` (this product's own project) holds none**, so its first sync is a plain insert. The dry run has to
  show this (D6); it doesn't change the server.
- **C3 — S2.2 is pins, not fixes.** Every Roadmap walker only visits `Roadmap/<NN-area>/<dir>/README.md`:
  `roadmap-extract.mjs` (both copies), `roadmap-to-notion.mjs`, `build-state.mjs`, `roadmap-backfill.mjs`, and
  `doc-format.mjs` (its full walk goes through the extractor; its per-file path returns `null` for anything that isn't
  an epic README, sprint or retro). A flat `Roadmap/00-strategy/<name>.md` is invisible to all of them already. The
  tests pin that, and each is seen failing once by mutating the walker (D8).
- **C4 — Two baseline checks are already red on `main`**: `build-order.mjs --check` (BUILD-ORDER.md is stale) and
  `doc-format.mjs --check` (three other epics' docs). So "passes with `00-strategy/` present" can't mean "the whole
  repo is green". The S2.2 tests are fixture-scoped, and the board is regenerated when this epic's status moves.
- **C5 — 2.3 stays in scope.** `intent-match` has shipped (#196–#198). Its `ROUTES.think_chain` label still reads
  "answer by hand until think-skills ships" in `scripts/intent-match.mjs` and `skills/template/scripts/intent-match.mjs`,
  and in groom's `references/intent-and-visuals.md`.
- **C6 — The sources exist on disk.** The account skills are synced to
  `~/.claude/skills/synced/<bucket>/{pmf-narrative-facilitator,northstar-workshop,deliberate-risk-validation}/SKILL.md`.
  There are two buckets. They differ only in heading emoji and one `name:` spelling, and only one has
  `northstar-workshop`, so that bucket is the source. `northstar-workshop`'s `description` is word for word
  `deliberate-risk-validation`'s, which confirms the mis-trigger.
- **C7 — `gf` is a shell alias on the product owner's machine** (`alias gf='git fetch'`). Smoke steps say
  `npx @golden-frijoles/cli …` (or `command gf …`), never a bare `gf`.

### Decisions

- **D1 — Port, don't rewrite** (grooming D1, source per C6). The coaching text moves as written: persona, concepts,
  case studies, target structure, steps. Allowed edits: the frontmatter (`name`, `summary`, `description`); a new
  closing step per skill that writes the file (D3) and offers the next (D4); Risk Validation's Step 1 reads the
  narrative (D4). Nothing else. **Amended 2026-09-30 (S1 review):** a `Sources` line per skill is also
  allowed, because grooming D7 requires one and this list left it out. The product owner says the coaching is partly
  their own synthesis and partly Reforge's courses. So `pmf-narrative` and `risk-validation` credit Reforge
  (reforge.com), `pmf-narrative` also credits Helmer's *7 Powers* (the moat step uses it), and `north-star` credits
  Amplitude's *North Star Playbook* (Cutler and McBride, amplitude.com/resources/north-star-playbook). Every URL
  answered 200 on 2026-09-30. Credited, never quoted. The builder checks that each case study reads as a public fact with its source named,
  not as copied text.
- **D2 — Names and places:** `skills/plugins/golden-frijoles/skills/{pmf-narrative,north-star,risk-validation}/SKILL.md`.
  None collides with the 11 existing skills or with the account names. `plugin.json`, the marketplace and the README
  adverts are **generated** (`skills/scripts/render-skill-adverts.mjs`), never hand-edited. `.skill` archives follow
  automatically (`pack-skills.mjs` packs every skill directory).
- **D3 — Output contracts.** Each skill ships `templates/<name>.md`, and that template **is** the contract. It lives
  there once, and every reader is tested against the template, never against a restatement. The file is written to
  `Roadmap/00-strategy/<name>.md`, flat. The folder never holds a subfolder with a `README.md` (D8). Frontmatter is
  `kind: <name>`, `status: draft | agreed` and `updated: YYYY-MM-DD`. Headings:
  - `pmf-narrative.md`: `## Initial insight`, then the six dimensions as `## Problem to solve`, `## Target audience`,
    `## Value proposition`, `## Competitive advantage`, `## Growth strategy`, `## Business model`, in prose.
  - `north-star.md`: `## The game`, `## North Star statement`, `## North Star metric`, `## Input metrics`,
    `## Lagging indicators`, `## Sync payload`. That last one holds **exactly one** ```` ```json ```` fence shaped like
    `northStarSyncSchema` (`apps/web/lib/north-star-schema.ts`). An input is `external_push` unless the project
    already sends the event it would count (`telemetry_event` + `sourceEvent`).
  - `risk-validation.md`: `## Broad validation` (analogs and antilogs per dimension), `## Conviction map`,
    `## Highest domino`, `## Targeted technique`, `## Execution rationale`. The dimension rows use the six
    `pmf-narrative` heading names verbatim.
  A skill writes the file with `status: draft`. If the file is `agreed`, it asks before overwriting it. Tests:
  `skills/scripts/strategy-templates.test.mjs` (frontmatter and headings, in skills-ci) and
  `apps/web/lib/north-star-template.test.ts` (the template's JSON block through the real `northStarSyncSchema`, in the
  root unit suite, since the mirror can't import the app).
- **D4 — The chain** (grooming D4): PMF Narrative ends by offering North Star, and North Star ends by offering Risk
  Validation. An offer is a sentence; nothing auto-invokes. Risk Validation's first step reads
  `Roadmap/00-strategy/pmf-narrative.md` when it exists and starts from its six dimensions. If the file is missing,
  it asks as the account copy does.
- **D5 — Groom reads strategy through one reader** (grooming D5). S2.1 adds `groom/strategy.mjs`, pure and
  zero-dependency. It reads `Roadmap/00-strategy/`, prints the input metrics (key and name, from the sync block), the
  highest domino and the conviction map, and prints **nothing** (exit 0) when the folder is missing. Stage 0 runs it.
  The seed template gains one optional line, `Moves: <input key> · Tests: <dimension>` (or
  `Moves · Tests: neither — <why>`), kept only when the reader printed something. Its test parses the three D3
  templates as fixtures, so renaming a heading in a template turns groom's test red.
- **D6 — `gf north-star set <file>`, over a new CLI route** (C1 amends grooming D6).
  - **Server:** `apps/web/app/api/v1/cli/north-star/route.ts`. `GET ?project=<slug>` sits behind `requireCliMember`,
    because the console shows the North Star to any member. `POST { project, sync }` sits behind `requireCliOwner`,
    because it's a definition write, like flag writes. Both sit behind the existing `CLI_WRITE_API_ENABLED` gate (ON in
    prod: `/api/v1/cli/whoami` answers 401, not 404). The read and the upsert are **extracted** from the existing routes
    into `apps/web/lib/north-star-sync.ts` (`listNorthStar(projectId)`, `syncNorthStar(projectId, body)`). The two
    existing routes call it and **keep byte-identical responses**, pinned by the unchanged `e2e/north-star-sync.spec.ts`.
    The CLI route maps outcomes into the `cliError` envelope: 400 → `invalid` with `issues`, 500 → `server_error`.
  - **CLI:** `packages/cli/src/commands/north-star.ts`. It reads the one JSON fence under `## Sync payload`; zero or
    more than one is a usage error and nothing is sent. The **default is a dry run**: one GET, then it prints the
    current North Star beside the proposal. The metric is shown as `new` or `updated`. Each input is shown as `new`,
    `updated`, `moved from <metric>` or `unchanged`. When other metrics exist, one line says sync adds and never
    replaces or deletes (C2). Then it says nothing was sent. **`--yes`** makes exactly one POST and prints the metric
    and `inputsSynced`. A 400 prints the route's `issues`. The exit code comes from the body's `code` through
    `exitForServerCode`. It uses `--project` or the active project and `--json`, like every verb. Validation stays on
    the server (the thin-shell rule, `flags-write.ts`).
  - The kill switch carve-out still holds. There's no new seam: the route is inside the CLI API's existing gate, and
    rollback is `git revert` for the route and the previous CLI version for the command.
- **D7 — Public artefacts stay separate** (grooming D7). The skills cite sources by name and URL, and never name a
  `references/` path, `Daniel` or an origin project (`check-plugin-leaks.mjs`).
- **D8 — `00-strategy/` is flat** (C3). The S2.2 pins cover `roadmap-extract` (both copies), `build-order` (through
  the extractor) and `doc-format` (full walk and `--files`). Each gets a fixture tree with a strategy file, observed
  failing once when the walker is mutated to descend into non-epic folders.
- **D9 — 2.3 changes a label, never a question** (C5). Only the `ROUTES.think_chain` display string changes, in both
  copies (`check-script-parity.mjs`), plus the reference line. The `think_chain` choice text in
  `lib/jev-questions/intent.json` is a **stamped wording** (compiled-prompts D3), and editing it would invalidate the
  recordings.
- **D10 — Releases.** S1 is plugin **0.17.0**, S2 is **0.18.0**, and S3 is **0.19.0** (the North Star skill names the
  command) plus CLI **0.3.0**. The kit version moves in lockstep with the plugin (`skills/RELEASING.md`;
  `check-release.mjs` blocks a shipped change without a bump). The npm publish of `@golden-frijoles/cli@0.3.0` is
  **the product owner's step (npm 2FA)**, owed by name. Until it lands, the skill's command pins `@0.3.0` and fails
  loudly rather than running an older CLI.
- **D11 — Owed by name, never done here:** the live `--yes` against `golden-beans` in prod, which needs the product
  owner's own North Star from running the skill (the lock refuses to invent this product's metric and write it to
  prod; sync can't delete what it adds); the CLI publish; and removing the three account copies.

## What already exists (reuse, don't rebuild)
- The three account skills (`pmf-narrative-facilitator`, `northstar-workshop`, `deliberate-risk-validation`) and `references/northstar-workshop-skill.md`.
- `POST /api/v1/north-star/sync`, `GET /api/v1/north-star`, `apps/web/lib/north-star-schema.ts`.
- `packages/cli/src/commands/flags-write.ts` (thin-shell write, exit codes), `packages/cli/src/api.ts`, `cli-write.test.ts`.
- `render-skill-adverts.mjs`, `check-skill-scripts.mjs`, the groom skill (Stage 0, `templates/scope-seed.md`), `roadmap-extract.mjs`, `build-order.mjs`, `doc-format.mjs`.
- `intent-match`'s gap-routing vocabulary (the "think chain" route).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Port the three coaches into the plugin | low |
| 1 | 1.2 Each writes its file | low |
| 1 | 1.3 The chain | low |
| 2 | 2.1 Groom reads `00-strategy/` | low |
| 2 | 2.2 The Roadmap tools ignore `00-strategy/` | low |
| 2 | 2.3 `intent-match`'s think-chain route names the skills *(cut 1st)* | low |
| 3 | 3.1 `gf north-star set` | high |

## Routing
1.1–1.3 and 3.1 on the strongest tier (skill text ships to strangers; 3.1 writes to a tenant's engine). S2 goes to builders against the locked contract. Review per the router; S3 is HIGH, so the fresh `pr-reviewer` pass is mandatory there and Daniel merges it.

**Amended at the lock (2026-09-30):** the architect builds all three sprints in place, S2 included. S2 turned out to be one small reader plus pins (C3), so briefing a separate builder would cost more than building it. `review-route --builder claude` therefore routes the external passes to the other families. The kickoff makes the fresh `pr-reviewer` pass mandatory on **every** PR, not only S3. Merges are pre-authorized on green (kickoff rule 4, WAYS-OF-WORKING *Review & merge*), and that covers S3: its new route is a CLI write of the same category the flag writes already are, not a new category of production mutation. The one production write in this epic (D11) stays owed.

## Kill switch (Stage 6b)
**Amended at the lock (C1, D6):** the carve-out still holds. The new `/api/v1/cli/north-star` route sits behind the CLI API's existing `CLI_WRITE_API_ENABLED` gate and an owner check, so it adds no seam that gate doesn't already switch off. Rollback is `git revert` for the route and the previous CLI version for the command. The original text follows. **Carve-out:** no new runtime seam. `gf north-star set` is a client command over an existing route already auth-gated by the project key, and dry run is its default; rollback is the previous CLI version (`npm i -g @golden-frijoles/cli@0.2.1`). A flag would gate nothing the route doesn't already gate.

## Deploy order
Stacked branches `feat/think-skills` → `-s2` → `-s3`, merged in order. S1 and S2 are plugin releases; S3 is an app deploy (the CLI route, on merge) plus a CLI release and a plugin release (D10). Owed to Daniel after S1 ships: remove the three account copies in claude.ai settings.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated): #214 `f14c68d`, #215 `ac13f46`, #216 `fbce291`. S3 is
      deployed and its dry run was verified against production. The owed steps are listed in each sprint file and below.
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs) and dated results
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (sharpened, not appended)
- [ ] ~~Kill-switch~~ n/a: the carve-out was recorded at grooming and amended at the lock (C1, D6). The new route sits
      inside the existing `CLI_WRITE_API_ENABLED` gate.
- [x] Feature branches deleted; **this README's frontmatter `status: shipped`**

**Owed to Daniel, by name:** `npm publish` of `@golden-frijoles/cli@0.3.0` (npm 2FA); running the North Star coach on
Golden Frijoles, then the live `--yes` against `golden-beans` and checking the North Star surface in the console (D11);
the interactive coach and groom runs (S1 steps 1–3, S2 step 1); and removing the three account copies of the coaches.
