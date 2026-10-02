# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Retrospective

_Closed: 2026-10-02_
_Intent: yes | mostly | no_
<!-- Did we build what the product owner meant? One word, THEIR answer: yes, mostly or no. Required by `epic-dod` only
     when the epic's seed or README carries a numeric `intent_match:` (intent-match D17); the calibration learns from
     it. Keep the line and leave exactly one of the three words between `_Intent: ` and the closing underscore. -->

## What shipped
- **S1 · One stage resolver** — #224 (`a0a5fae`): `scripts/lib/stage.mjs` decides every stage (D13), one extractor
  carries the card's prose (D15/D21), the push contract gained `board` and skips unchanged boards (D16), the workflow
  re-pushes on the event that moved a card (D18), and the kickoff's first step pushes the branch. Hotfix #225: epic
  kickoffs broke `notion-sync` (Notion's 2000-character text limit).
- **S2 · The board on the Hub** — #226 (`98afa52`): `/hub/<slug>/board`, the card view at `?card=`, filters in the URL,
  three approved surfaces registered.
- **S3 · Every client reads it** — #227 (`c2cb30f`): the CLI build view on the resolver (stage, source, age, `Board ↗`), the kit's
  `--sink terminal|hub|notion` and `roadmap-push`, Notion's `Stage` column, WIP advice in the kickoff; plugin + kit 0.21.0.
- **S4 · Areas and the workspace board** — #228 (`da0828c`): the Roadmap tab by area on a horizon (the journey track
  retired from it), `/hub/w/<workspaceId>/board` through `getWorkspaceProjects()` only, with access model A pinned by
  a page-level spec.

## What went well
- **The lock disproved scope before code**: no `golden-frijoles` project in prod (the self-tenant is the public demo),
  workspaces with no slug, BUILD-ORDER.md unable to carry live facts, two extractors already forked, 12 of 13 work
  branches merged and never deleted. Each became a decision instead of a defect.
- **Live data kept correcting the rule**: the first D13 merged-rule read an epic shipped in ONE PR as "paused at S1 of
  3" — the exact 10/10-shown-wrong mismatch the epic existed to kill — caught by the out-loud live run before S1.5.
- **Mutation checks earned their cost**: four specs that passed were proved unable to fail and rewritten (an emoji
  fixture that didn't straddle the boundary, a stale-PR spec that skipped the gather, a copy spec that checked one line,
  a class guard that only saw one runner form).

## What we learned
- **A committed generated file cannot hold facts that move without a commit** — and neither can its sort order: a
  depth-1 CI clone reordered BUILD-ORDER.md's Shipped section because it sorted by a git date.
- **A push on `main` races the deploy that ships the route it pushes to**: the first two pushes after S1 hit the old
  route and lost `board`; the next event repaired it.
- **Fix the class, not the instance — again**: hand-kept lib copy lists broke fixtures twice, a removed broken command
  had a sibling, and a "Miyagi" safety note leaked into shipped code after the leak guard had last run.
- **A safety property needs its prose to agree**: the key-order fix was right in code and stated backwards in five
  places until round 2.
- **External review capacity is a resource that runs out mid-epic**: Codex capped, vibe failing on the review prompt,
  every agy family on quota by S4. The HIGH tenancy PR merged with BOTH external lenses dark, by the product owner's
  explicit decision, on two fresh-reviewer rounds — the first of which found the one spec that pins the access model
  at the page (swap the helper for "every project in the workspace" and nothing else went red). A tenancy PR's first
  question for its own specs: which mutation of the ONE legal read would they survive?
- **A lock decision is easy to violate in the next sprint's convenience code**: S4's first draft computed stages from
  `status` on the Roadmap tab, three weeks of reading after D19 said the Hub never does.

## Gaps / follow-ups
- Owed to Daniel: the `Stage` select on the Notion roadmap DB (S3.3's live column); the board and card view against the
  approved picture in a browser; the workspace board signed in (S4 smoke).
- Seed `kickoff-generator-path`: nine docs name a generator path that doesn't run in an installed repo.
- Vibe fails on the review prompt (asks for a disabled tool) — to diagnose, with Daniel's `!` probe.
- The outside general + security review of #228 runs on `main` once a family has capacity; any finding is a follow-up PR.
- The other Hub views (horizon, epic drill-down, the share page's journey) still read `status`; whether D19 should
  reach them is a grooming question.
- The `tenancy` lint rule cannot see this epic's fan-out shape (`shown.map((p) => read(p.id))`) — input for its
  promote/tune decision due 2026-10-14.
