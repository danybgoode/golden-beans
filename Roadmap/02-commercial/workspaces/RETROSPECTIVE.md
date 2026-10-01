# Workspaces become the tenant: one person, many products, one boundary — Retrospective

_Closed: 2026-10-01_
_Intent: yes | mostly | no_
<!-- Did we build what the product owner meant? One word, THEIR answer: yes, mostly or no. Required by `epic-dod` only
     when the epic's seed or README carries a numeric `intent_match:` (intent-match D17); the calibration learns from
     it. Keep the line and leave exactly one of the three words between `_Intent: ` and the closing underscore. -->

## What shipped
**Sprint 1, the tenant exists** (#220, `4ee9bb1`):
- `workspaces` and `workspace_members` exist above `projects`: RLS on, no policies, anon and authenticated refused with
  42501.
- Every live project was backfilled into exactly one workspace by one SQL rule: creator, else earliest owner, else
  abort. `miyagisanchez`, `golden-beans-demo` and `golden-beans` went into "Daniel's products"; `miyagi` went into
  "miyagi's products".
- A new signup claims its workspace before its first project exists.
- AGENTS.md states the invariant at workspace level, in the same PR as the tables.

**Sprint 2, every path checks it** (#221, `68b9974`):
- `workspace_id` is NOT NULL, and the backfill function is dropped.
- A trigger keeps every project member inside the project's workspace.
- All three membership reads re-check the workspace through one pure predicate.
- `getWorkspaceProjects()` is the one legal multi-project read.
- The switcher groups projects by workspace, and `gf whoami` prints the workspace (CLI 0.4.0, publish owed).
- The semantic-lint rule `tenancy` watches the invariant in shadow.

Both migrations were applied to production before their PR merged and verified live. Nobody gained or lost access: 0
project members sat outside their workspace when Sprint 2's check went live.

## What went well
- **The lock earned its keep.** Querying the four live projects first removed the "platform workspace" the plan had
  invented: 0 projects had neither creator nor owner. It also moved NOT NULL out of Sprint 1. Signup is live, and the
  provisioning code then in production wrote projects without a workspace, so a NOT NULL applied before Sprint 1
  deployed would have failed every signup in the gap.
- **Every new spec was observed red under a mutation that compiled and linted.** That covered the backfill branches, the
  release guard, the race branch, each of the three membership reads, the grouping and the auth-setup wiring. One
  mutation first failed lint instead of a test; it was redone so it compiled, per LEARNINGS.
- **The backfill rule lived in one place**, a SQL function the migration called and the spec called, so no TS copy could
  drift from it. Migration B dropped it once its job was done.
- **Two clean external passes per PR** (Codex general, agy security lens). The fresh `pr-reviewer` found everything
  that mattered, below. ⚠️ On #221 both external passes ran on `e3dc9db`, BEFORE `e026711` added the catch-up
  `INSERT INTO workspace_members … FROM project_members` to migration B. Only the fresh reviewer's round 2 read that
  insert. It's grant-shaped SQL on a security path, so the next time a fix commit touches a migration, re-run the
  security lens.

## What we learned
- **A "it's gone from the list" assertion against a one-item list can't fail.** The console spec asserted the left
  project's link count was 0, but with one project the switcher renders a label, not a link, so the count was 0 either
  way. Fixed with two projects, a control first, and a positive assertion on the label. Mutation-checked.
- **An authed spec that gives the shared fixture user a second project changes what every parallel spec sees.**
  `/app` renders that user's first project. The fix is a disposable person per spec, signed in through the real form,
  in a context with **empty** storage state: in the authed project a new context inherits the shared user's session,
  and `/login` silently bounces to `/app` as that user.
- **A boundary check added at a seam has to come with a structural guarantee for every grant path.** Otherwise it quietly
  removes access the old rule granted. Here that meant a trigger for future `project_members` rows and a catch-up insert
  for existing ones, rather than "prod measured 0 today".
- **A doc written in the same PR as the code must not describe the next PR's code in the present tense.** AGENTS.md said
  the seam re-check "is" there while it was still Sprint 2 work. The reviewer caught it, and it was hedged until it
  shipped.

## What didn't / friction
- My local DB holds ~4,000 leftover fixture projects and 300 leftover flags on `project-one`. Ten unrelated CLI specs
  fail locally with `URI too long` on every run, and CI's fresh DB passes them. `supabase db reset` is rightly on the deny
  list, so each local migration was applied over `psql` (in a transaction, with the full-table backfill call left out).
- agy's full-diff security pass returned nothing on both Gemini and gpt-oss, though `agy-doctor` said it was healthy. It
  ran clean once scoped with `--paths` (74 KB on #220, 37 KB on #221).

## Gaps / follow-ups
- **Owed to Daniel by name:** the signed-in prod walkthroughs (S1 steps 1–3 and 5, S2 step 1), and `npm publish` of
  `@golden-frijoles/cli@0.4.0` (2FA), then S2 step 2. S2 step 3 is n/a in prod; CI replaces it.
- `provisionTenantForUser`'s release-on-failure wiring is verified by inspection only. The provisioner is `server-only`,
  and no spec can make it fail midway.
- The `tenancy` lint rule is in shadow. Promote, tune or drop it with rule-1's review (shadow expires 2026-10-14). Its one
  undecided fixture (p=0.35) is the LEGAL shape `getWorkspaceProjects()` + `.in('project_id', …)`. That's exactly
  what board S4 and the portfolio will write, so measure it on those PRs before promoting.
- Unblocked: `board-sinks-and-scrumban` S4 (the workspace-wide board) and seed `portfolio-view`, which both read through
  `getWorkspaceProjects()`.
