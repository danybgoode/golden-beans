---
title: "Think skills: PMF Narrative → North Star → Risk Validation ship in the plugin, write files groom reads"
slug: think-skills
status: scaffolded
area: "09"
type: feature
priority: "audit-wave-B"
appetite: M
underwritten_by: null
risk: high
epic: "09-platform-infra/think-skills"
build_order: 53
updated: 2026-09-29
---

# Seed: Think skills: PMF Narrative → North Star → Risk Validation ship in the plugin, write files groom reads

Seed 5 of the [unification audit](../audits/golden-frijoles-unification-2026-09-23.md) §5; moved here by `one-roadmap`.
The [single-product audit](../audits/single-product-and-grooming-2026-09-28.md) §3 makes it `intent-match`'s "is it
worth doing?" route. Groomed 2026-09-29: **feature · shaped bet · appetite M · risk high** (one story: `gf north-star set` writes to a tenant's engine; the rest is low). Stage-2.5 bucket: **light
enhancement.** The three coaches already exist as skills in Daniel's claude.ai account, with frontmatter; what's missing
is that they ship to nobody else, write nothing a file can hold, don't hand off to each other, and groom never reads
what they produce.

**As a product owner using Golden Frijoles, I want** the PMF Narrative, North Star and Risk Validation coaches in the
plugin, each leaving a file in `Roadmap/00-strategy/` and offering the next, **so that** grooming can ask of every seed
"which input metric or risky dimension does this move?" instead of that living in a chat I've closed.

## The ask, as given

> "then think-skills" (the product owner, 2026-09-29), on the portfolio seed: "The three pre-planning coaches … are
> chat prompts with a fenced YAML header that no loader reads, uncommitted in this repo, with no output contract.
> groom can't read what they produce."

## System, actors and data flow

```mermaid
flowchart LR
  PO([product owner])
  subgraph Plugin["golden-frijoles plugin"]
    P[pmf-narrative] -- offers next --> N[north-star] -- offers next --> R[risk-validation]
    G[groom]
  end
  subgraph Repo["the project's Roadmap/00-strategy/"]
    PF[(pmf-narrative.md<br/>six dimensions · conviction)]
    NF[(north-star.md<br/>metric · inputs · sync payload)]
    RF[(risk-validation.md<br/>highest domino · hypothesis · technique)]
  end
  E[(Golden Frijoles engine<br/>POST /api/v1/north-star/sync)]
  PO <--> P & N & R
  P --> PF
  N --> NF
  R --> RF
  PF --> R
  NF -- gf north-star set · dry run, then --yes --> E
  PF & NF & RF --> G
  G -- "moves input · tests domino?" --> S[(seed pitch)]
  IM[intent-match gap route: think chain] -.-> P
```

## What grooming measured (2026-09-29, against `main` @ 93aec48)

- **The skills exist, but only in one account.** `pmf-narrative-facilitator` (65 lines), `northstar-workshop` (61) and
  `deliberate-risk-validation` (62) are claude.ai account skills with frontmatter. The dobby-foundation `references/`
  copies the seed named were never committed, and that folder is archived; the account copies are the only source.
- **The North Star skill mis-triggers.** Its `description` is a copy of Risk Validation's ("identify and prioritize
  the riskiest dimensions … targeted validation technique"), in the account skill and in
  `references/northstar-workshop-skill.md`. A request for a North Star workshop matches the wrong text.
- **Each ends in a document written in chat.** PMF Narrative: six sections in prose. North Star: game, statement,
  metric, 3–5 inputs, lagging indicators. Risk Validation: analogs/antilogs per dimension, conviction map, highest
  domino, technique, rationale. None names a file, and Risk Validation asks for the narrative it depends on by hand.
- **The engine already takes a North Star.** `POST /api/v1/north-star/sync` (project key auth) takes `metric {key,
  name, description}` and `inputs[]` (`apps/web/lib/north-star-schema.ts`). The CLI has no `north-star` command
  (`packages/cli/src/commands/` has auth, config, doctor, flags-*, init, keys, projects).
- **The public workshop is a different artefact.** `/northstar-self-serve.md` (`apps/web/app/northstar-self-serve.md/
  route.ts`) is a script a stranger's agent runs from the landing, built with `getSiteUrl()`, with its own e2e spec
  and a citation allow-list. The skill serves a project's own groom. Rendering both from one source would couple a
  public page to a plugin skill for little gain.
- **The Amplitude PDF question is answered.** It isn't redistributable and was never committed; the route cites
  `amplitude.com/resources/north-star-playbook` (checked 200 when it shipped). Since `public-monorepo` S4.1,
  `references/` is local-only, so the page map (`references/northstar-sources.md`) isn't public either: the skills cite
  by name and URL.
- **Nothing reads strategy today.** No `Roadmap/00-strategy/` exists here or in medusa-bonsai; groom's Stage 0 reads
  the poster, WAYS-OF-WORKING, LEARNINGS and the macro README only. `intent-match`'s gap routing already names a
  "think chain" artifact, "answer by hand" until this ships.
- **Adding a skill is a generated-advert change.** Each `SKILL.md` carries a `summary:`; `render-skill-adverts.mjs
  --check` fails CI if `plugin.json`, the marketplace and the README don't list it.

## Bill of materials

| What | Why |
|---|---|
| **Three plugin skills**: `pmf-narrative`, `north-star`, `risk-validation` under `skills/plugins/golden-frijoles/skills/`, ported from the account copies, each with a `summary:` and its own `description` | Ships to every plugin user; fixes the North Star mis-trigger. |
| **Output contracts** in `Roadmap/00-strategy/`: `pmf-narrative.md`, `north-star.md`, `risk-validation.md`, each with frontmatter (`kind`, `status: draft \| agreed`, `updated`) and fixed headings | A file groom can read, and a later session can revise, instead of a chat transcript. |
| **The chain**: each skill ends by offering the next; Risk Validation reads `pmf-narrative.md` when it exists | The narrative feeds the risk read without retyping it. |
| **North Star → engine**: `north-star.md` carries a JSON block shaped like `northStarSyncSchema`; **`gf north-star set <file>`** reads it, shows what would change against `GET /api/v1/north-star` (dry run by default) and posts to the existing `POST /api/v1/north-star/sync` only with `--yes` | The metric reaches the engine without retyping, through the CLI an agent already drives, and no new engine code. |
| **Groom reads strategy**: Stage 0 loads `00-strategy/` when present; the pitch gains one line, "Moves: <input metric> · Tests: <dimension>" (or "neither: say why") | The question the seed asked for, at the cost of one line per pitch. |
| **`intent-match`'s think-chain route points at the skills** | Its "is it worth doing?" gap gets a real next step. |

## Rabbit holes (patched now)

- **Two copies after install.** The account skills stay in Daniel's claude.ai and would compete with the plugin's.
  Owed to Daniel once S1 ships: remove the three account copies (one minute in settings). The plugin names differ
  (`north-star`, not `northstar-workshop`), so nothing collides in the meantime.
- **Case studies and frameworks in a public, Apache-2.0 skill.** The text is Daniel's own; it names Helmer's 7 Powers,
  the North Star Framework and company case studies as facts with attribution, and quotes no book or PDF. The port
  keeps it that way (the builder checks each case study is stated as a public fact, not copied text).
- **An empty strategy folder.** Most projects won't have run the coaches. Groom's line is optional: with no
  `00-strategy/`, it says nothing (no nag), and the pitch line is omitted.
- **`00-strategy/` and the Roadmap contract.** `roadmap-extract`, `build-order` and `doc-format` must ignore the new
  folder (it holds no epics or seeds). The lock checks all three.
- **A write to a tenant's engine.** `gf north-star set` is the only story that mutates production data, so it's
  `risk: high` and Daniel merges it. Dry run is the default; `--yes` sends. It replaces the metric and upserts the
  inputs exactly as the sync route already does (no new server semantics), prints the before/after, and exits
  non-zero on any `ok: false`. The skill never calls the engine itself; it tells you to run the command.
- **Validation lives on the server.** The CLI doesn't re-implement `northStarSyncSchema`; it posts and renders the
  route's `issues` on a 400, the same "thin shell" rule `flags-write.ts` follows (one brain, server-side).

## No-gos

- No new engine route or schema change: `gf north-star set` calls the existing sync route.
- No single source for the skill and `/northstar-self-serve.md`; they serve different readers.
- No scoring of seeds against strategy (that would be a Jev question; `intent-match` can add it once it has data).
- No new methodology content: port, fix, add contracts and hand-offs. Rewriting the coaching is a different bet.

## Slices (stacked branches `feat/think-skills` → `-s2`)

| Sprint | Stories | Risk | QA stage |
|---|---|---|---|
| **S1: The three skills, with files** | 1.1 port the three skills into the plugin, `summary:` + corrected descriptions, adverts regenerated · 1.2 the three output contracts (templates under each skill, written to `Roadmap/00-strategy/`) · 1.3 the chain: offer-next endings, Risk Validation reads the narrative, North Star's sync block + printed command | low | `render-skill-adverts --check`, `check-skill-scripts`, a template test per contract. Owed to Daniel: run the North Star skill once on Golden Frijoles and say whether the file is right. |
| **S2: Groom reads strategy** | 2.1 groom Stage 0 loads `00-strategy/` when present; the pitch line "Moves · Tests" · 2.2 `roadmap-extract` / `build-order` / `doc-format` ignore `00-strategy/` · 2.3 `intent-match`'s think-chain route names the skills | low | groom + scaffold tests; a groom dry run with and without `00-strategy/`. |
| **S3: The metric reaches the engine** | 3.1 `gf north-star set <file>`: reads the sync block, dry run against `GET /api/v1/north-star`, `--yes` posts to the sync route, before/after report, exit codes; the North Star skill names the command | **high** | `cli.test.ts` / `cli-write.test.ts` against a mocked API (dry run sends nothing; `--yes` sends once; a 400 renders `issues`); one live run against Golden Frijoles' own project. Owed to Daniel: run it on a real project and merge (HIGH). |

**Cut line:** 2.3 goes first if `intent-match` hasn't shipped (its route keeps "answer by hand"). The three skills and
their files never go.

**Kill switch (Stage 6b), carve-out:** no new runtime seam. `gf north-star set` is a client command over an existing
route that is already auth-gated by the project key, and dry run is the default; rollback is the previous CLI version
(`npm i -g @golden-frijoles/cli@0.2.1`). A flag would gate nothing the route doesn't already gate.
**Model routing:** 1.1–1.3 on the strongest tier (skill text is judgement and ships to strangers); S2 to builders.
Risk: S1 and S2 **low** (skill text, templates, a groom stage); S3 **high** (a production write), so Daniel merges
S3. Every change under `skills/` is a plugin release; S3 is a CLI release (`@golden-frijoles/cli`).

## Acceptance (Daniel can check)

- `/plugin` lists `pmf-narrative`, `north-star` and `risk-validation`; asking "run a North Star workshop" loads
  `north-star`, not the risk skill.
- Finishing the North Star skill leaves `Roadmap/00-strategy/north-star.md` with the metric, the inputs, a sync JSON
  block, and the one command to send it.
- Starting Risk Validation after PMF Narrative uses the narrative's six dimensions without asking for them again.
- Grooming a seed in a project with `00-strategy/` adds "Moves: … · Tests: …" to the pitch; in one without it, groom
  says nothing about strategy.
- `node scripts/build-order.mjs` and `doc-format --check` pass with `00-strategy/` present.
- `gf north-star set Roadmap/00-strategy/north-star.md` prints what would change and sends nothing; with `--yes` it
  syncs, and https://goldenfrijoles.com/app shows the new North Star and its inputs.

## Reuse

The three account skills (the only source), `references/northstar-workshop-skill.md`, `GET` + `POST /api/v1/north-star/sync` +
`packages/cli/src/commands/flags-write.ts` (the thin-shell write pattern, exit codes from the body),
`apps/web/lib/north-star-schema.ts`, `/northstar-self-serve.md`'s citations, `render-skill-adverts.mjs`,
`check-skill-scripts.mjs`, the groom skill's Stage 0 and `templates/scope-seed.md`, `roadmap-extract.mjs`, and
`intent-match`'s gap-routing vocabulary.
