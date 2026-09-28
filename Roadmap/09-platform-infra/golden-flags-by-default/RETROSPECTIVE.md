# Golden Frijoles by default — Retrospective

_Closed: 2026-09-19_

## What shipped

One sprint, six stories, one PR (#24), built in one orchestrated session.

| Story | What landed | Ref |
|---|---|---|
| 1.2 | `template/scripts/preflight.mjs` + `lib/golden-onboarding.mjs` — the mandate as a check, 23 tests | #24 |
| 1.1 | `groom` Stage 6b rewritten to `gf flags create`, with **activation as a fifth named thing** | #24 |
| 1.3 | `check-plugin-leaks` flag-mechanism rule + the guard's first 11 tests | #24 |
| 1.6 | `apps/example-app/flags.mjs` seam, `references/flags-runtime.md`, 13 tests, an api spec | #24 |
| 1.5 | `AGENTS.md` rule 1 + the plan table with its NOT-ENFORCED note | #24 |
| 1.4 | Four onboarding surfaces welded by `check-onboarding-parity.mjs`; CI wiring | #24 |
| 1.6 | Two defects the smoke walkthrough found | #24 |

*(All seven landed in PR #24, squash-merged as `5db30c6`; the branch's own commits carry each
story's reasoning and are reachable from the PR.)*

A project spawned from `template/` now boots with the flag provider wired, fails one command loudly
if it has no Golden Frijoles project, and cannot quietly grow a second flag store.

## What went well

- **Verifying D2 by execution instead of by reading changed the answer.** The plan asked for "the
  Edge-runtime constraints of `createFlagProvider`, verified against the actual package". Running the
  published `dist/` inside a `node:vm` context with only Edge globals produced an answer with *two
  halves* — the API surface is Edge-safe, the lifecycle is not — where reading the source would have
  produced only the first. Only ever hearing the first half is exactly how a middleware seam gets
  planned that cannot work. The doc ships its own reproduction, so it can be re-checked rather than
  quietly going stale when the SDK majors.
- **The parity guard fired on its first run.** `check-onboarding-parity.mjs` immediately caught a
  credential name that `flags-runtime.md` described in prose but never spelled. A guard that goes
  green on its first run has told you nothing; this one earned its place before it was committed.
- **The smoke walkthrough found the only real defect.** Step 4 — Golden pointed at a dead host —
  produced a health payload reading `ready: true` beside `state: 'NOT_READY'`. Nothing in the unit
  tests could have seen it, because the stub was always ready. Running the thing found it.
- **Three incidental leaks were rewritten rather than allowlisted.** Adding the new rule surfaced
  two `session-resume` comments naming an origin-project table and a triage fixture using
  `lib/flags.ts` as an arbitrary path. Each was real residue; an ALLOW entry would have preserved it
  with a plausible-sounding reason.
- **The line budget held.** `groom/SKILL.md` was already at its 220-line ceiling. The two new
  `requires_scripts` lines were paid for by compressing two prose passages — not by raising the
  ceiling, which is the move that quietly ends a budget.

## What we learned

- **A guard with no test is a guard nobody has seen fire.** `check-plugin-leaks.mjs` ran green over
  this epic's leak every single day for months. "CI was green" is the one observation that cannot
  distinguish a working guard from a pattern that matches nothing. Every guard wants fixtures that
  assert it fires, *and* fixtures that assert it does not fire on the thing it is meant to permit.
- **A mechanism does not have to be named after a project to be that project's.** The
  origin-project rule swept for `miyagi|medusa|despacho` and could never have caught
  `lib/flags.ts` `DEFAULT_FLAGS`. Generic filenames are how one consumer's architecture ships to
  everyone.
- **When a dependency can fail, decide loudly which failures are configuration and which are
  weather — and refuse to add the flag that blurs them.** Absent config and a 401 are true until a
  person acts; an unreachable host is not. There is deliberately no `--strict` on the preflight: it
  would have been pasted into a CI file within the week, and the fail-soft promise would be gone
  with nobody having decided to give it up.
- **"The package is not installed" is the most complete outage there is, and it makes a great
  test fixture.** Importing the SDK dynamically means the seam's whole fail-soft contract can be
  tested in a checkout with no `node_modules` — no network, no credentials, no mocking of a
  transport.
- **Definitions and activations are different verbs, and a dashboard cannot tell you which you
  did.** 39 of 42 flags reading "never turned on here" while the runtime served compile defaults is
  the shape this failure takes. The fix was not a paragraph; it was putting the verification command
  into the story template as its own step — `gf flags get <key>`, whose PRODUCTION row must not read
  `—`. **The first version of that command did not exist**, which is its own lesson, below.

## The review round, and the lesson it bought

One fresh reviewer found five real things; the external cross-family layer is DARK in this repo and
could not run (see *Gaps* below). Every finding is fixed, and one of them is the most useful thing
this epic produced:

- **B1 — the epic shipped a command that does not exist.** D4's whole point was that activation
  stops being a cautionary paragraph and becomes a runnable verb. The verb was
  `gf flags ls --env production`, and `gf flags ls` takes no `--env`: it exits 1 with a usage error
  before it ever reaches auth. The annotation beside it quoted the **web console's** wording while
  the CLI prints `—`. Both halves wrong, in the line the whole decision rested on.

  **It survived because it was verified the way prose gets verified.** The smoke step checked the
  string was *present* in every surface — and it was, perfectly, in all five, because
  `check-onboarding-parity.mjs` had just been built to guarantee exactly that. A guard that welds
  five files to one string makes them agree; it says nothing about whether the string is true. The
  build was one `gf flags ls --help` away from catching it and never ran it, in an epic whose entire
  thesis is *checks, not sentences*.

  The fix is not the corrected command. It is `check-onboarding-parity.mjs --exec`, which **runs**
  each advertised command against the real CLI: `unauthorized` (the parser accepted it, then asked
  for a credential) passes, `invalid` fails. CI installs the CLI and runs it — and skips rather than
  fails when it cannot, because a check that goes red on someone else's outage is the same mistake
  D1 exists to refuse.

- **S1 — the epic's title claim was not true.** "A spawned project already carries the flag
  provider": it carried the *seam*, not the *package*. `@golden-frijoles/sdk` was a dependency of
  nothing and no document said to install it, so the reachable end state of following the spawn
  checklist was **five green preflight checks, a live snapshot, and every flag resolving to its
  call-site default forever** — with one log line. The dynamic import that makes the seam testable
  with no `node_modules` is also what made the hole silent. Preflight now has an `sdk` check, and a
  warning is counted in the summary line so five ticks can no longer imply flags work.

- **S2 — a "harmless default" that silently broke production reads.** The seam defaulted
  `environment` to `'development'` and passed it to the SDK, where that field is a *hard assertion*
  and a mismatched snapshot is rejected. On the CI-secrets path this file's own header recommends, a
  valid production key resolved a production snapshot, the SDK rejected it against an environment
  nobody had chosen, and every flag served its compile default permanently — indistinguishable from
  an outage. Reproduced both ways before and after the fix. The CLI had avoided the identical trap
  and written down why; the template did not read its own dependency closely enough.

- **S3 — an assertion pointing exactly backwards.** The shipped e2e gate asserted
  `demo.hello_enabled === false`, so a project that followed this epic's own walkthrough
  (`--kill-switch` means born serving `true`) turned its gate red. It was green precisely while
  flags were not working.

- **N1** — any 200 with parseable JSON could be read as a wrong-environment mismatch and *fail*: the
  one shape of weather that could still break a build. `contractVersion` is now checked first.

**And then the fix to B1 had a defect of its own, which is the sharpest thing this epic taught.**
B1's answer was *stop trusting a string, execute the command*. That is right — and it immediately
produced a check that executes **write verbs**: `gf flags create … --all-envs` creates and activates
a flag in production, `gf flags kill … --env production` kills it. The probe spawned the CLI
inheriting `process.env` and `$HOME`, and the CLI reads a credential from either. The design rested
on `unauthorized` being the outcome — which was true only because nobody was signed in. On the very
machine this epic still owes a live `gf login` on, a **documentation parity check would have written
to the real flag catalog.**

Caught in re-review, before it ever ran that way. The fix is not "be careful": the child now gets a
scrubbed environment, and `unauthorized` is **required** rather than accepted — so if the isolation
ever fails, the probe returns `ok` and that FAILS, loudly. The harmless state is constructed and
then asserted, instead of being an accident of who happened to be logged out.

*Making a check real makes it capable of doing whatever the thing it checks can do.* That is the
cost of moving from grep to execution, and it is worth paying — but it has to be paid deliberately.

## Gaps / follow-ups

- **Owed to the product owner: one live `gf login` + `gf init`.** Completing `gf init` needs a CLI
  token minted from the Golden console by a signed-in human — a production credential this build did
  not take unasked. Step 1 of the walkthrough (fails with the exact command) ran for real; `gf init`
  ran for real and refused correctly with `Not signed in`; the PASS path was proven against a local
  stub of the real snapshot route. Flag serving is enabled on production (a bogus key returns 401,
  not 404), so the live run should differ only in minting a real key. Detail: `sprint-1.md` step 2.
- **The cross-repo half of "one surface" is transcribed, not imported.** `/install` and `gf init`
  live in `golden-beans`; a template cannot import a product's web app to read a string. The
  canonical module names its source for each value, and `preflight.mjs` exercises the real
  deployment with the real variable names — so a rename in the CLI shows up as a failing preflight
  rather than a stale sentence. Compared by hand at close: all four values identical.
- **`MIN_CLI_VERSION` is a hand-maintained floor** (`0.1.0` — the version that shipped the write
  path). Nothing automatically raises it when the CLI ships a verb the story template starts naming.
  Worth a thought the next time a `gf` verb is added to a doc here.
- **The external cross-family review layer is DARK in this repo, structurally.** There is no
  `review-route.mjs`, `cross-review.mjs` or `review-config.json` in `dobby-foundation/scripts/` —
  `fill-ins.yml` says the families are routed *"in a consuming project's checkout"*. So a repo whose
  `reviewScope` is `every-pr` cannot run the layer its own process document prescribes, and never
  could. One fresh reviewer was the only judgment layer on a HIGH-risk shared-infra diff. **B1 is
  exactly the class of external-fact error a second family is good at.** Worth its own chore epic:
  this is the repo that changes the process every project imports.
- **`preflight.mjs` is not in the template's CI gate**, deliberately — `.env.local` is gitignored, so
  a checkout has no credential. It falls back to the process environment for projects that want it
  in CI from secrets, but nobody has run it that way yet.
