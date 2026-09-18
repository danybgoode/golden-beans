# Golden Frijoles CLI — Sprint 3: distribution, CI, and MCP parity

**Status:** ✅ Shipped — PR #151, `cb4b8c5`; release PR #152, `185744f` (2026-09-18)

> Sprint 3 is what makes the epic's promise checkable on a machine that has never seen this
> product: one line, a token, and a kill-switch story completed end to end. It also closes the
> gap the connector has been carrying — **audit first, then code.**

## Build contract (locked by the architect before the builder started)

- **AGENTS rule #2 and #3 are NOT relaxed.** `/api/v1/public/*` still serves the demo project only;
  the connector is still enablement-gated and still needs its two credentials. Parity is closed by
  bringing MCP **up** to the CLI, never by widening the public surface. A parity gap whose only fix
  would loosen either rule is recorded in the table as **deliberate**, with the rule cited.
- **D4** — MCP write tools import the same `packages/sdk/src/flag-commands.ts` planners the CLI
  uses. A test asserts the CLI verb and the MCP tool produce the **same plan** for the same input;
  that is what makes parity structural rather than a review checklist.
- **D8** — the MCP write tools sit behind `isCliWriteApiEnabled()` **and** the connector's own two
  gates. Three independent kill switches, as `agent_write` established.

## Stories

### Story 3.1 — the one-line installer and the `npx` path
**Acceptance:**
- [x] `npx @golden-frijoles/cli@latest --version` → **`0.1.0`**, exit 0, verified 2026-09-18 with an
      EMPTY npm cache, an empty working directory and an empty `HOME` — it pulled
      `@golden-frijoles/sdk@0.5.0` from the public registry. The same clean install then ran against
      production: `gf doctor` diagnosed the missing credential, and `gf whoami` with a bogus token got
      production's `unauthorized` with **exit 2** and JSON on stdout.
- [x] `npm i -g @golden-frijoles/cli` puts `gf` on `PATH` — the published manifest's `bin` is
      `{ "gf": "dist/bin.js" }`, read from the registry, not from the repo.
- [x] The package ships `dist/` + `README.md` only, with `bin` pointing at a shebanged entry that
      runs on Node 20+.
**Risk:** low

### Story 3.2 — CI mode
**Acceptance:**
- [x] `GOLDEN_FRIJOLES_TOKEN` authenticates with no credentials file present and no prompt.
- [x] Nothing reads a TTY when `--json` is set or stdin is not a TTY. `gf init --yes` never prompts —
      and the stronger form holds: `gf init` never prompts at all, so `--yes` is accepted and inert
      rather than suppressing a question that does not exist. `--help` says so.
- [x] Exit codes are stable and documented in `--help`; a non-zero exit always writes a
      machine-readable error to **stdout** under `--json` (stderr stays human).
**Risk:** low

### Story 3.3 — the MCP parity **audit** (a table, no code)
**Acceptance:**
- [x] A table in the epic README: every CLI verb → its MCP tool, or a stated reason there is not one.
- [x] Every "no tool" row names *why* — rule #2, rule #3, credential shape, or "Sprint 3.4".
- [x] The table is derived from the registered tool names in the connector route, not from memory.
**Risk:** low

### Story 3.4 — MCP write tools behind the shared command core
**Acceptance:**
- [x] The gaps 3.3 identifies as closeable are closed: flag create / set / rollout / kill as MCP
      tools, each calling the **same planner** the CLI calls.
- [x] ⚠️ **AMENDED — the credential is the CLI's PAT, not `agent_write`.** They require the connector
      token **and** a `gf_pat_…` whose holder OWNS the connector's project, plus **D8**'s gate —
      three independent conditions, as planned, with a different second one.

      `agent_write` cannot do this job: `create_flag_definition_version` and `set_flag_activation`
      require an owner USER and write that id into `flag_lifecycle_audit`, and an `agent_write` key
      resolves to a project, not a person. Forcing it would mean attributing an agent's flag change
      to whichever human owns the project — making the most consequential records this system keeps
      say something false — or adding an external-actor path to those RPCs, which is a new
      attribution concept and a migration. `lib/mcp-flag-tools.ts` states both alternatives.
- [x] A spec asserts plan equality between the CLI verb and the MCP tool for the same input.
**Risk:** high

### Story 3.5 — `/install` and the docs teach the CLI
**Acceptance:**
- [x] `/install` leads with `npx @golden-frijoles/cli init`, and the connector becomes the second
      section rather than the only one.
- [x] The page and `gf init`'s printed next-steps say the **same** thing — one surface, checked by a
      test that compares the page's command strings against the CLI's own constants.
- [x] `packages/sdk/README.md` names `GOLDEN_FRIJOLES_*` as what `gf init` emits (**D6**).
- [x] `packages/cli/README.md` is the published front door: install, login, the kill-switch story.
**Risk:** low

## Smoke walkthrough

Run against **production** after `cb4b8c5` deployed.

1. **`/install` teaches the CLI.** `https://goldenfrijoles.com/install` contains
   `npx @golden-frijoles/cli init` and the kill-switch story, under *Or drive it from a terminal*;
   the stale "not a CLI wizard" sentence is gone.
2. **The connector has the flag READ tools and not the WRITE tools.** Using the public demo connector
   URL from `/install`, `tools/list` → includes `list_flags` and `get_flag`; **none** of
   `create_flag`, `set_flag`, `rollout_flag`, `kill_flag` (no CLI token was presented).
3. **`list_flags` answers.** `tools/call list_flags` → `ok: true`, project `golden-beans-demo`,
   `flags: 0` — the honest empty state for a project with no flags.
4. **The write tools open only for the right caller.** Proved by `mcp-flag-tools.spec.ts`: an owner's
   `gf_pat_…` gets them and `create_flag` actually lands; a member, an owner of a different project,
   an ingest key and a revoked token do not.
5. **The package, from a clean machine.** SDK 0.5.0 and CLI 0.1.0 installed from their tarballs into
   an empty directory with an empty npm cache: `gf --version` → `0.1.0`, and the installed SDK
   carries `diffFlagDefinitions`, `ON_VARIANT_KEY`, `OFF_VARIANT_KEY` — the exports 0.4.0 lacked.
