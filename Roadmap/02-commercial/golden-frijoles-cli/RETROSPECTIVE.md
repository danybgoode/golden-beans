# Retrospective — Golden Frijoles CLI v1

**Shipped:** 2026-09-17 · **Appetite:** L (three waves) · **Risk:** high

The engine got a write surface an agent can drive. `gf flags create <key> --kill-switch --all-envs`
is the line that used to stop and wait for a human to open a browser.

---

## What actually happened

### The architecture lock disproved three of the scope doc's assumptions, and that was the cheapest hour of the epic

Every `D` decision was checked against live code rather than against the plan, and three did not
survive contact:

- **D1.** The plan said "a console-minted PAT". It did not say *where the row lives*, and the
  obvious answer — a seventh `api_keys` scope — is wrong for a reason visible only in the schema:
  `api_keys.project_id` is `NOT NULL` and all six scopes resolve *through* a project. A CLI token
  has to answer "which projects does this caller have?" **before** a project is known. Its own table.
- **D3.** The scope doc said an enablement flag is "created DISABLED". In this control plane a
  definition with no activation is **absent from the environment's snapshot**, so the consumer falls
  back to its own literal and the flag is invisible in the provider — the exact failure the epic
  exists to end. "Disabled" had to mean *serving `false`*. Both polarities activate.
- **D6.** The scope doc framed this as a compatibility decision: legacy `GOLDEN_BEANS_*` names
  versus new ones. Checking found the SDK reads **no** environment variable at all — those names
  appear only in README examples. There was no compatibility to preserve, and the real requirement
  was different: the file and the snippet that reads it must be generated together.

**The transferable part:** a lock that only confirms the plan has not been done. Two of these three
would have been found by a builder mid-sprint, at ten times the cost, and D3 might not have been
found at all — a flag that is merely absent looks exactly like a flag that is off.

### Fourteen review findings across four rounds, and the last two rounds were not the cheap ones

| Round | Findings | Shape |
|---|---|---|
| 1 | 3 (Codex) + 8 (fresh reviewer) | the usual mix, plus two Blocking |
| 2 | 2 Should-fix | contract violations |
| 3 | 1 Blocking + 2 Should-fix | **the primary login flow was broken** |
| 4 | 2 Should-fix | a false comment, and a silent wrong-environment config |

Round 3 is the one to remember. `gf login` — the first verb any new user runs — **hung after
Enter**, because `for await (const chunk of process.stdin)` ends at EOF and pressing Enter does not
close a TTY. Round 2 had already fixed the `--json` branch of that same function and left the
interactive one. Four rounds in, on the happy path, with 1800 tests green.

**The transferable part is not "do more rounds".** It is that *what the suite cannot reach is where
the defects live*. A piped test cannot exercise a TTY, which is precisely why it shipped. The fix
was verified by driving the built binary through a **pseudo-terminal** with `expect` — and the old
code, under the same script, hangs. That is the difference between a fix and a claim.

### The same defect class, three times, in the thing written to prevent it

`CODE-QUALITY #3` — *a comment that asserts a property must be true, and you must have checked* —
was violated three separate times in this epic, each time in a comment written to explain a guard:

1. The migration claimed its grants "are asserted by attempting the writes they forbid". They were —
   **once, by hand, in a psql session.** A verification that happened once in a terminal goes green
   forever afterwards regardless of what the schema does next.
2. `gf projects create`'s route claimed it recovers the `?provision=failed` state. It cannot: calling
   it needs a token, and minting a token needs a membership.
3. The gate's comment said it does not gate flag inspection. It does — every `/api/v1/cli/*` route,
   reads included.

**And then the fix for (1) had the same problem.** The forged-INSERT spec written to satisfy #3
passed `randomUUID()` as `user_id`, which violates the foreign key — so the write failed on the FK,
not on the grant, and restoring `GRANT INSERT` left the test **green**. Found only because the
mutation check was actually run.

> **The rule, sharpened: a guard written to satisfy a rule is not exempt from that rule.** Mutation-
> check the guard, and check *what refused the write*, not just that something did.

### Parity became structural, and the test for it needed two halves

D4 put the command core in the **SDK** — not in `packages/cli`, because the MCP tools live in
`apps/web`, which must not depend on the CLI. Both sides import one module, so `gf flags kill` and
the `kill_flag` tool cannot disagree about what killing means.

Testing that claim honestly took two kinds of assertion:

- **Plan equality** — the same input produces the same plan. A near-tautology, and saying so is the
  point: it is true *because* there is one implementation, and it is what goes red the day someone
  adds a second.
- **Absence** — neither surface *contains* a decision: no polarity branch, no variant list, no basis-
  points arithmetic. This is the one with teeth. Plan equality survives a copy-paste of the planner;
  absence does not.

...and then a third assertion proving the absence patterns actually match the planner, so they
cannot be green for looking at nothing.

### `agent_write` could not authorize a flag write, and forcing it would have made the audit lie

Sprint 3.4 looked like it would reuse the connector's existing write credential. It cannot: the flag
control plane's RPCs require an owner **user** and write that id into `flag_lifecycle_audit`. An
`agent_write` key resolves to a project, not a person.

The two ways to force it were both worse — attribute an agent's change to whichever human owns the
project (making the most consequential records this system keeps say something false), or add an
external-actor path to those RPCs (a new attribution concept and a migration, mid-sprint). So MCP
flag writes take a **third** credential: the CLI's own account-scoped PAT, whose holder must own the
connector's project. Three independent conditions, honest attribution, no new concepts.

### The repo's own guards did a lot of the work

Adding one console route and two MCP tools turned **nine** existing checks red, each demanding the
new thing be declared rather than discovered: the nav inventory, the rail, the ⌘K palette, the route
manifest's three ledgers, the `getSiteUrl` caller registry, and two exhaustive MCP tool lists.

The `getSiteUrl` registry is the one worth naming — it refused to let a new caller exist without
someone classifying it *informational* or *durable*, in writing.

And the born-ON gate could not simply be excused: `flags.test.ts` asserts every gate in `flags.ts`
is in one of its tables. A skip-list entry would have left the one deviating gate with **no**
contract at all — worse than the default it deviates from. It got a mirrored matrix instead, plus an
assertion that exactly one gate is born ON, so the new table cannot become an escape hatch.

---

## What we would do differently

- **Run the `--help`/`--json` golden files against a pseudo-terminal too.** Everything agent-facing
  was pinned as bytes; nothing was pinned as *behaviour under a real terminal*, and that is where the
  Blocking defect was.
- **Write the mutation-check table into the sprint doc as the checks are run**, not at the end. The
  spec said "see sprint-1.md" for three rounds before sprint-1.md said anything.
- **Scope the agy security lens from the first call.** Two rounds were spent on argv-cap failures
  (261 KB against a 256 KB limit) before scoping to the actual security paths, which fit at 106 KB.

## What we would do again

- **Lock the architecture against live code, and let it disprove things.** Three decisions changed.
- **Put the shared core where both callers can reach it, then assert the absence of decisions
  elsewhere.** Parity stopped being a review checklist.
- **Verify a database guarantee by attempting the write.** `active_cli_tokens` selects from a single
  table and *is* auto-updatable, unlike all three of its siblings — so its `REVOKE` is the only thing
  between the app role and a forged credential. That is knowable only by trying it.
