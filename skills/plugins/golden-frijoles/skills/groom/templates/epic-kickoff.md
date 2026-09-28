Read AGENTS.md, Roadmap/WAYS-OF-WORKING.md (especially *Epic-mode builds* and *Review & merge*) and
Roadmap/LEARNINGS.md. Skim team memory.
Then read Roadmap/{{MACRO}}/{{SLUG}}/README.md and every sprint file: {{SPRINT_FILE_LIST}}.

You're building the ENTIRE "{{EPIC_TITLE}}" epic in EPIC MODE, in one orchestrated run — not
{{SPRINT_COUNT}} independent sprint sessions. The sprint documents are integration, review and rollback
boundaries INSIDE this run; they are not separate engagements. Risk tier: {{RISK}}.

## 1. Lock the architecture before any builder starts
This is the single highest-leverage act of the whole run, and it is yours alone. Before delegating
anything, read the epic + sprint docs AND the shipped code and live data they describe, then write into
Roadmap/{{MACRO}}/{{SLUG}}/README.md:
- numbered decisions `D1…Dn` — each one verified against the live system, not inferred from the doc;
- a per-sprint **"Build contract (locked by the architect before the builder started)"** section.
Builders CITE those decisions. They never re-derive them, and a paraphrased contract drifts permissive.

The locking pass is not a summary of the sprint docs. It must:
- **Disprove scope.** Read the code before believing the doc. An acceptance criterion describing a guard,
  a table, a dependency or a flag state the live system doesn't have is fiction — correct the doc, with
  the reasoning, and say so out loud.
- **Query live data, not just migration files.** Row counts decide what is safe: a schema fork that is
  free while a table is empty is only free then, and that window is worth spending deliberately.
- **Name every deviation** in the README, decided — not discovered by a builder mid-build.
- **Say where each contract lives, once.** Import the shipped rule; never restate it.

## 2. Stack the branches
`feat/{{SLUG}}` → `-s2` → `-s3` …, each cut from the previous, one PR per sprint, merged in order.
Sprints in one epic share hot files by construction — siblings cut off one base pay a per-merge conflict
tax. Stack or pay. One PR for the whole epic is acceptable only when the sprints don't split along a
review boundary; prefer per-sprint PRs so the highest-risk sprint gets reviewed as one.

Work in your own isolated `git worktree`, not the shared root checkout. Commit per story PATH-SCOPED
(`git add <your files>` + `git commit -- <those paths>`, never `git add -A`).

## 3. Route the work, and invert it for review
Assign the sprint that defines the contract everything else imports — the authorization boundary, the
migration, the shared seam — to the stronger model; the sprints that are mechanical over a locked
contract go to the faster one. State the routing in the epic README so the choice is auditable.

Escalate rather than guess: stop and hand back on any trigger in the ONE list, WAYS-OF-WORKING →
*Escalate, don't guess*. Default to escalate when unsure. A scope that stops moving is a raised hand, not a reason for
more tokens.

## 4. Review: one external general pass, a security lens when the paths trigger it, and the fresh reviewer
Run the router, don't pick a reviewer by hand:

```
node scripts/review-route.mjs --builder <who-wrote-it> <PR#>
```

It prints the exact commands: **one external general pass** from the highest-preference family that did
NOT build the diff, **a lean security lens** by the next family when the changed paths (`scripts/review-config.json`
→ `securityPaths`) or a `risk: high` body trigger it, and **the fresh `pr-reviewer` subagent** — in the
scope `reviewScope` sets.
- **A capped family is routed past with `--exclude <family>`** — there is no refund pause. If only one
  family can run, it runs both prompts and you SAY SO in the PR body; if none can, the layer is DARK and you
  say that.
- **A reviewer that returns nothing is a FAILED run, not a clean one** — the run exits non-zero and posts a
  failing `cross-review/<lens>` status on the PR.

Every finding gets fixed, or answered on the PR with the reason it isn't a bug, before merge. Neither pass
authorizes anything; **you merge your own PR on a green gate** once findings are resolved.

## 5. Merging: pre-authorized on green. Done means shipped.
For this epic you are **pre-authorized to merge on a green gate** — deterministic gate green, review
findings resolved, risk tier declared. Don't come back to me for a merge round-trip at each sprint
boundary. Pre-authorization removes the round-trip, not the layers: the gate, the two reviews and the
tier rule all still apply.

It does **not** extend to a new category of production mutation — TLS/IAM/secrets, money or entitlement
writes, a new external dependency or production secret. Name those in one focused question.

**Done means shipped.** A merged PR that hasn't deployed, a migration written but not applied, a flag
that exists in code but not in Golden Frijoles, and a flag created there but never ACTIVATED (`gf flags get
<key>` still printing `—` for production) — none of those are done. Apply migrations BEFORE
merging (merging deploys, and code reading a new column against an unmigrated table breaks a live path),
verify live, then merge, then confirm the deploy actually succeeded.

## 6. Assume you die mid-flight
Session limits kill whole agent trees. Derive what is derivable; journal only what isn't — the decided
state lives in the epic README's `D1…Dn` and the per-sprint build contracts, so re-entry is cheap. Never
trust a worker's own completion report: verify by re-deriving actual repo state.

## 7. Close it
Write each sprint's SMOKE WALKTHROUGH into its sprint file before calling that sprint done (numbered
steps, one action + one expected result, real URLs; money/auth steps flagged as owed to me by name).
At epic close, run the full epic Definition of Done in the README — retro, poster, memory, LEARNINGS,
`status: shipped`.

---

## The epic: "{{EPIC_TITLE}}" ({{SPRINT_COUNT}} sprints, risk {{RISK}})

{{SPRINT_BREAKDOWN}}
