# Golden Frijoles CLI — Sprint 3: distribution, CI, and MCP parity

**Status:** ⬜ not started

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
- [ ] `npx @golden-frijoles/cli@latest --version` works on a machine that has never seen the
      package — verified on a clean `npm_config_cache`, not assumed.
- [ ] `npm i -g @golden-frijoles/cli` puts `gf` on `PATH`.
- [ ] The package ships `dist/` + `README.md` only, with `bin` pointing at a shebanged entry that
      runs on Node 20+.
**Risk:** low

### Story 3.2 — CI mode
**Acceptance:**
- [ ] `GOLDEN_FRIJOLES_TOKEN` authenticates with no credentials file present and no prompt.
- [ ] Nothing reads a TTY when `--json` is set or stdin is not a TTY; `gf init --yes` never prompts.
- [ ] Exit codes are stable and documented in `--help`; a non-zero exit always writes a
      machine-readable error to **stdout** under `--json` (stderr stays human).
**Risk:** low

### Story 3.3 — the MCP parity **audit** (a table, no code)
**Acceptance:**
- [ ] A table in the epic README: every CLI verb → its MCP tool, or a stated reason there is not one.
- [ ] Every "no tool" row names *why* — rule #2, rule #3, credential shape, or "Sprint 3.4".
- [ ] The table is derived from the registered tool names in the connector route, not from memory.
**Risk:** low

### Story 3.4 — MCP write tools behind the shared command core
**Acceptance:**
- [ ] The gaps 3.3 identifies as closeable are closed: flag create / set / rollout / kill as MCP
      tools, each calling the **same planner** the CLI calls.
- [ ] They require the connector token **and** an `agent_write` key resolving to the same project
      (`authorizeAgentWrite`), plus **D8**'s gate.
- [ ] A spec asserts plan equality between the CLI verb and the MCP tool for the same input.
**Risk:** high

### Story 3.5 — `/install` and the docs teach the CLI
**Acceptance:**
- [ ] `/install` leads with `npx @golden-frijoles/cli init`, and the connector becomes the second
      section rather than the only one.
- [ ] The page and `gf init`'s printed next-steps say the **same** thing — one surface, checked by a
      test that compares the page's command strings against the CLI's own constants.
- [ ] `packages/sdk/README.md` names `GOLDEN_FRIJOLES_*` as what `gf init` emits (**D6**).
- [ ] `packages/cli/README.md` is the published front door: install, login, the kill-switch story.
**Risk:** low

## Smoke walkthrough

_(filled in at sprint close, with real URLs)_
