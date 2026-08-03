---
title: "Harness portability — clear the origin-project residue from the ways-of-work plugin"
slug: harness-portability-residue
status: queued
area: "09"
type: chore
priority: "#S1"
appetite: S
underwritten_by: "Roadmap/bets/wave-2026-08-03-harness-portability.md"
risk: low
epic: null
build_order: "#S1"
updated: 2026-08-03
---

# Scope — harness portability: the de-Miyagification residue

> **This seed never scaffolds a golden-beans epic.** The work executes in the sibling repo
> `~/dobby/dobby-foundation` (the plugin + template), so `epic:` stays `null` here permanently.
> It closes by flipping this seed to `archived` when the plugin PR merges — the shipped record
> lives in the plugin repo's own history, not in this project's board. Stated up front so a
> future board reconciliation doesn't read the missing `epic:` as drift.

## Mirror-back

You want the `ways-of-work` plugin to stop carrying the origin project's specifics — paths, repo
names, auth provider, chat destinations, and the product owner's personal name — so that any
`~/dobby/` sibling can consume it without reading around someone else's project. And you want
golden-beans to actually be consuming the current version of it. Right?

## Stage 2 — classification

- **Class: Chore** (tooling/docs, no user-facing change).
- **Archetype: Sweeper** — acceptance is *"less project-specific text / same behaviour / no
  regressions"*, and the sweep must prove the old coupling is unreachable rather than merely
  unmentioned.
- **Lane: fixed scope.** By WAYS-OF-WORKING this lane skips the betting table and goes straight to a
  builder at `appetite: S`. It is recorded in a wave file anyway
  (`wave-2026-08-03-harness-portability.md`) because it is cross-repo and displaces product work —
  the opportunity cost is real even when the shaping isn't.

## Stage 2.5 — can we already do this?

**Genuinely new work**, but smaller than it looks: every fix is a text edit in a `SKILL.md`, a
template, or a comment. No script logic changes, no new files except one guard-shaped decision
deliberately deferred (see *No-gos*). Bucket 2-adjacent — a light sweep, not an epic.

## The problem (why now)

Two distinct failures, one root cause — the plugin was extracted from `medusa-bonsai` and never
finished the trip.

**1. The installed plugin is one commit stale.** `golden-beans/.claude/settings.json` correctly
declares the marketplace (`extraKnownMarketplaces: danybgoode/dobby-foundation`) and enables
`ways-of-work@dobby-foundation` — so the plugin *is* wired in, and has been since 2026-07-13. But
the marketplace source is **GitHub**, and `dobby-foundation`'s local `main` is **one commit ahead of
`origin/main`**: `145ec73 feat(ways-of-work): Shape Up economics layer + de-Miyagify groom,
scope-seed, prose prompt` is unpushed. Golden Beans therefore consumes `f85be19` — a `groom` skill
with **no appetite stage, no lane classification, and no bill of materials**. The economics layer
adopted at the 2026-08-03 betting table is, from the plugin's point of view, not shipped. This is
almost certainly the "is it even installed?" symptom: it is installed, and it is the wrong version.

**2. The residue is 16 files, not 10.** Re-derived from the repo rather than from memory. Two
leak classes, and the second one is the one that spreads:

### Deep coupling — a consuming project cannot run these as written

| File | What leaks |
|---|---|
| `skills/live-smoke/SKILL.md` | `apps/miyagisanchez/scripts/live-smoke.mjs`, `apps/miyagisanchez/e2e/_live/ad-hoc.browser.spec.ts`, **Clerk** as *the* auth provider, `MIYAGI_ADMIN_EMAILS`, `MS_TEST_ADMIN_EMAIL`, a provisioned test account (`agentsm@miyagisanchez.com`) and a named Clerk instance (`honest-eel-39` / "Despacho Bonsai") |
| `skills/weekly-recap/SKILL.md` | the hardcoded 3-repo list, `apps/miyagisanchez/lib/telegram.ts`, the `MiyagiDevopsTele` bot |
| `skills/standup-post/SKILL.md` | same 3-repo list + bot; `browser-smoke.yml only exists in miyagisanchezcommerce` |
| `skills/pmo-report/SKILL.md` | `medusa-bonsai`, the SmallDocs story-deck link, the Telegram destination |
| `skills/vercel-prune/SKILL.md` | `--project` defaults to `miyagisanchez`; `gh pr list --repo danybgoode/miyagisanchezcommerce`; `despachobonsai-vercel` |

### Thin leaks — a stale path, a repo name, or a personal name

| File | What leaks |
|---|---|
| `skills/doc-hygiene/SKILL.md` | `apps/miyagisanchez/AGENTS.md`, `apps/backend/` |
| `skills/babysit-pr/SKILL.md` | `medusa-bonsai`, "the 3 repos" |
| `skills/build-order-sync/SKILL.md` | "Daniel asks to…" ×2 |
| `skills/prose-draft/SKILL.md` | `medusa-bonsai` |
| **`skills/groom/templates/epic-README.md`** | **a `## Medusa-first note` section heading** + "the Medusa-first reframe" |
| `skills/groom/templates/sprint-N.md` | "checks Daniel can run", "browser smoke owed to Daniel" |
| `skills/groom/templates/RETROSPECTIVE.md` | "Smoke gaps owed to Daniel" |
| `README.md` (plugin root) | provenance prose + a **dead path** — `Roadmap/00-ideas/2. readyforscope/…`, the folder-based funnel that frontmatter replaced |
| `template/.githooks/pre-push.example` | `apps/miyagisanchez/.githooks/pre-push`, "apps/golden-beans-style repos" |
| `template/scripts/roadmap-to-notion.mjs` | "Daniel ratifies" ×2 (comments) |
| `template/scripts/cross-panel.mjs` | "Daniel commits", "Daniel's scope-doc approval" ×2 (comments) |

**`epic-README.md` is the highest-blast-radius item in the set** and should be fixed first.
`scaffold-epic.mjs` renders it into *every* new epic, so every future epic in every consuming
project inherits a section header asking whether **Medusa** already models the thing — a question
that is meaningless outside one project. This is the same leak class as the kickoff/sprint fixes in
`f6a7b95` and `f85be19`, one layer further in: those fixed what the skill *says*, this fixes what
the scaffolder *emits*.

`plugin.json` / `marketplace.json` carrying `author: Daniel` is **not** a leak — an author field is
supposed to name a person. Excluded deliberately.

## Bill of materials

Optional for the fixed-scope lane; included because scope is the entire risk here — sixteen files
is exactly the size that invites a rewrite.

| What | Why |
|---|---|
| Push `145ec73` to `origin/main` **first** | Until this lands, golden-beans consumes a `groom` with no appetite stage. Everything else in this bet is cosmetic next to a plugin that contradicts the adopted process. |
| `epic-README.md`: Medusa-first → **platform-first** | One heading, rendered into every future epic by the scaffolder. Highest leverage character-for-character in the repo. |
| The 5 deep-coupling skills → named `TEMPLATE FILL-IN` config | Turns "here is how *my* project does it" into "here is the shape, supply yours". The concrete detail moves from prose into a named per-project value, so the skill still tells you *what* it needs. |
| "Daniel" → "the product owner" across skills + templates | The `groom` skill already made this move in `145ec73`; the rest of the plugin didn't follow. Role names survive a change of person; personal names don't. |
| Dead-path fix in the plugin `README.md` | A path that no longer exists teaches a fresh agent a funnel model we abandoned. Worse than no reference. |
| Sync `template/Roadmap/SESSION-KICKOFFS.md` from this project's copy | The template's copy is *behind* golden-beans': missing §8 Resume, and still on the codex/antigravity reviewer stack instead of Agy/Devin/Cursor. The template should ship the newer shape plus the new Shape/Bet sections landed here in Cowork. |

## Rabbit holes (patch these now)

- **Do not rewrite the scripts.** Every skill wraps a `.mjs` that ships in the *consuming* project's
  `scripts/` dir. This bet edits `SKILL.md` prose and templates only. If a script's default is wrong
  (e.g. `vercel-prune`'s `--project`), the skill documents that it must be passed — it does not
  change the script.
- **`live-smoke` will get thinner, and that is the correct outcome.** Most of its value was concrete
  Clerk detail. Genericizing means the skill describes the *shape* (an auth provider, an admin
  predicate, a test identity) and the consuming project supplies the values. Resist re-adding
  richness by inventing a second project's specifics.
- **The Clerk instance / test-account lines are operational facts, not documentation.** Don't
  genericize them into vagueness and lose them — move them to the origin project's own docs, or
  drop them with a note saying where they went. A deleted operational fact is a bug.
- **"3 repos" appears in four skills.** Fix it as one decision (a per-project repo list), not four
  independent paraphrases that drift apart by next quarter.

## No-gos (so the appetite holds)

- **No leak guard this wave.** A `check-plugin-leaks.mjs` grep-to-zero guard mirroring
  golden-beans' `check-template-drift.mjs` is the obvious follow-up and is deliberately **not** in
  this bet — it needs a CI wiring decision and would push S to M. Re-bet it next wave once we know
  what the cleaned text looks like.
- **No plugin split.** Moving `live-smoke`/`pmo-report`/`standup-post`/`weekly-recap` into a
  separate origin-specific plugin was considered and rejected at the table: one distribution is
  worth more right now than a clean boundary, and the split stays available later.
- **No new skills, no behaviour changes, no script edits.**
- **No golden-beans code changes.** The only golden-beans writes are Roadmap docs, done in Cowork.

## Acceptance (the product owner can run these)

1. `cd ~/dobby/dobby-foundation && git rev-list --count origin/main..main` → `0`.
2. `grep -rniE "miyagi|medusa|despacho|honest-eel|SmallDocs" plugins/ template/ README.md` → matches
   only in deliberate provenance prose, listed by the builder line-by-line in the PR body.
3. `grep -rn "Daniel" plugins/ template/` → matches only `plugin.json` / `marketplace.json` author
   fields.
4. `grep -rn "Medusa" plugins/ways-of-work/skills/groom/templates/` → no matches.
5. Open a fresh Claude Code session in golden-beans; `/groom` a throwaway ask → **Stage 1.5 asks for
   an appetite** and Stage 2 names a lane. That is the proof the current plugin is live.

## Open risks

- Genericizing `live-smoke` without a second real consuming project to test against means we find
  out whether it's still usable only when someone runs it. Mitigated by (3) above: preserve the
  operational facts elsewhere rather than deleting them.
- `template/scripts/*.mjs` comment edits touch files the template ships; they are comments only, but
  they are still a shared-surface touch in the plugin repo — do them in one commit, not scattered.

---

## Build handoff — paste into a fresh Claude Code session in `~/dobby/dobby-foundation`

```
Read AGENTS.md if present, then README.md and plugins/ways-of-work/skills/groom/SKILL.md (the
already-de-Miyagified reference — match its register and its "the product owner" phrasing).
The pitch is ~/dobby/golden-beans/Roadmap/00-ideas/seeds/harness-portability-residue.md — read it
first; it carries the full per-file inventory, the rabbit holes and the no-gos.

Bet: harness portability. Appetite S, fixed-scope lane, risk LOW, underwritten by
golden-beans/Roadmap/bets/wave-2026-08-03-harness-portability.md.

Plan mode → confirm the story list with me → then execute in this order (the order is load-bearing):

  0. FIRST, before any edit: git push origin main. Commit 145ec73 is unpushed, so every consuming
     project is running a groom skill with no appetite stage. Verify with
     `git rev-list --count origin/main..main` → 0.
  1. plugins/ways-of-work/skills/groom/templates/epic-README.md — "## Medusa-first note" →
     "## Platform-first note", "the Medusa-first reframe" → "the platform-first reframe". Highest
     blast radius in the repo: scaffold-epic.mjs renders this into EVERY new epic.
  2. The other two groom templates (sprint-N.md, RETROSPECTIVE.md) — "Daniel" → "the product owner".
  3. The 5 deeply-coupled skills (live-smoke, standup-post, weekly-recap, pmo-report, vercel-prune):
     replace project specifics with named `TEMPLATE FILL-IN` config the consuming project supplies.
     Keep the SHAPE (an auth provider, an admin predicate, a repo list, a chat destination) — the
     skill must still say what it needs, just not whose it is.
  4. The 4 thin leaks (doc-hygiene, babysit-pr, build-order-sync, prose-draft) + the plugin README
     (fix the dead `00-ideas/2. readyforscope/…` path — that folder model was replaced by
     frontmatter) + template/.githooks/pre-push.example.
  5. template/scripts/{roadmap-to-notion,cross-panel}.mjs — comment-only "Daniel" → "the product
     owner". One commit, not scattered.
  6. Sync template/Roadmap/SESSION-KICKOFFS.md from golden-beans/Roadmap/SESSION-KICKOFFS.md,
     generalized: it now has the three-stage table, appetite/lane/wave fill-ins, the lane split in
     §1, and new §9 (bet a wave) + §10 (re-shape after a breaker). The template's copy is BEHIND —
     it also lacks §8 Resume. Keep §1–§8 numbering stable; WAYS-OF-WORKING and the groom skill both
     cite §4 and §7 by number.

Do NOT: touch any .mjs logic (SKILL.md prose and templates only), split the plugin, add a leak
guard (explicitly next wave), or invent a second project's specifics to replace the deleted ones.
Operational facts being removed (the Clerk instance honest-eel-39, the provisioned test account)
are facts, not documentation — move them to the origin project's own docs or say in the PR where
they went. Deleting them silently is a bug.

Commit per step, PATH-SCOPED (git add <your files> && git commit -- <those paths>; never -A). Open
a PR declaring risk LOW. In the PR body, paste the output of the 5 acceptance greps from the seed,
and list line-by-line every remaining match you judged to be deliberate provenance prose.

Escalate rather than guess: if genericizing live-smoke needs a real second consuming project to
validate against, stop and hand back — that's the S lane's only circuit breaker.
```

**Acceptance is the 5 greps in the section above** — re-derived from the repo, not from this doc.
Verified 2026-08-03 from a clean `git ls-files` scan: **18 files match, 16 are real** (the 2
excluded are the `author: Daniel` fields in `plugin.json` and `marketplace.json`, which are correct
as-is).
