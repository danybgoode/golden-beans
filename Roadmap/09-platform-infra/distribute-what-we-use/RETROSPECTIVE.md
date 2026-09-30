# Distribute what we use — one review rail, Jev and notify setup, schedulers, build view — Retrospective

_Closed: 2026-09-30_

## What shipped
<!-- The capability now live, by sprint, with commit/PR refs. -->
- **S1: One review rail** (#188 → `8774b44`, kit 0.6.0).
  - Three forks (this repo, the template, medusa-bonsai) became one byte-identical rail.
  - One doctor, `cross-agent-doctor.mjs`; `agy-doctor.mjs` stays as an alias.
  - The rail is now locked down:
    - Vibe runs with no host tools, and `--agent devin` is refused. Both could otherwise read `.env.local` into a public PR comment.
    - codex runs `--sandbox read-only --ignore-user-config --ignore-rules --ephemeral`.
    - A reply carrying a verbatim secret is never posted.
    - A diff from an author without write access is refused.
    - The codex→agy heal re-checks the builder.
  - medusa-bonsai got the same bytes in danybgoode/miyagi-product-management#197.
- **S2: What a stranger's kit carries** (#189 → `81c26e6`, kit 0.7.0).
  - The kickoff's own commands (the review rail, `session-resume`, `session-note`) and `build-state` ship in the kit.
  - The build view always runs the resolver bundled in the plugin, never the open repo's.
  - A byte-parity guard covers `scripts/` ∩ `skills/template/scripts/`.
  - Every shipped rail entry runs through a symlinked path.
- **S3: Jev and notify, set up rather than documented** (#190 → `7b60483`, kit 0.8.0).
  - The egress question is asked before anything is sent. This was two bugs, not one.
  - Jev setup route, with a 10-fixture proof that writes nothing.
  - `notify-setup.mjs`: `--chat-id` and `--test`. The Slack sender ships in the template.
- **S4: Schedulers** (#191 → `cba8fc7`, kit 0.9.0).
  - The seven routines ship in the kit, with a `/schedule`-ready bootstrap that refuses any unfilled or unclassified placeholder.
  - Model-free cron templates.

## What went well
- **The lock earned its keep.** It disproved six groomed assumptions before any builder started:
  - project-owned prompts can't be byte-equal;
  - the build-view hook *already* ran repo code on every turn;
  - the Jev ask was two bugs, not one;
  - nothing read `reporting.destination`;
  - the kickoff named a `session-resume.mjs` this repo lacked;
  - S2.3's measured counts differed from the seed.
- **Running every consumer's old tests against the superset** surfaced every behaviour difference. Three of them were real features one copy had and the others lacked: the sha pin on statuses, model attribution, and devin as a reviewer.
- **Probing the function-hooks runtime live** (`import.meta.url` in a hook helper) before designing D5 avoided building on an assumption. The hostile-repo live test proved the fix.
- **The fresh `pr-reviewer` was the load-bearing review layer.** The external families were capped or out of capacity for long stretches. It found every Blocking issue on #188 after round 1, including a secret that could reach a *public commit status* through the output guard's quoted reply.

## What we learned
<!-- Promote the durable, generalizable items to Roadmap/LEARNINGS.md (one-liner + why + date). Dedupe. -->
- **A security review of a guard converges on the guard.** #188 took 7 fresh rounds. Rounds 4–6 each found one small defect in the *new* secret guard, and each came from the previous round's fix (padding, then URL remainders, then `//`-leading keys). The stop signal was a clean round, not a count, and the residual that no code closes went to the product owner as a decision: accept and document.
- **"Stricter wins" has to be applied to every path, not the one you are looking at.** Vibe was locked down in S1.1, and the same round re-admitted devin with the identical hole. Then codex, the *default* reviewer, turned out to have it with MCP servers loaded. Enumerate every runner when a property changes.
- **Retargeting a PR's base does not trigger CI.** After a squash-merge of the base, re-push the child or the PR shows green with no run on its head.
- **A scoped external pass hallucinates about what it didn't see.** agy's `--paths`-scoped general pass on #189 filed a Blocking finding ("vendor/ not committed") and two Should-fixes, all about files the scope withheld. Verify against the tree, and state the coverage of every scoped pass.

## Gaps / follow-ups
<!-- Smoke gaps owed to the product owner, deferred slices, known limitations. -->
- **Owed to the product owner:**
  - the clean-machine stranger install (S2 steps 1–2);
  - a Telegram test send from your own bot (S3 steps 2–4);
  - standing up one routine at https://claude.ai/code/routines (S4 step 3).
- **Accepted residual (documented in the CHANGELOG):** a collaborator's diff can steer codex into reading an operator file and encoding it past the string guard.
- **Follow-ups:**
  - the non-realpath `isMain` class in about 20 other template scripts, outside the rail;
  - an `authorAssociation` fallback when the permission endpoint 403s;
  - routing every report through `reporting.destination` (deviation 5);
  - `gh pr view` for the author gate on GitHub Enterprise.
- **External coverage gaps, as recorded on each PR:**
  - codex was capped from mid-S2.1 (reset Oct 29) and later answered healthy again;
  - agy returned empty or 503 on review-sized prompts for part of the run;
  - vibe has no key in this environment.
