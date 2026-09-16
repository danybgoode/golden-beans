# Golden Frijoles CLI v1 — Sprint 3: Distribution and MCP parity

**Status:** ⬜ not started

**Epic:** [Golden Frijoles CLI v1](README.md) · **Risk: MIXED (LOW + HIGH)** — 3.4 is HIGH (new write surface on the connector); the rest LOW

**Wave 3 of 3.** The sprint that makes the one-line command in the dobby-foundation onboarding true,
and the sprint that stops MCP and the CLI drifting apart.

**Audit before you widen.** 3.3 produces a written parity table and **no code**. 3.4 only closes the
gaps that table names, and only behind the shared command core. Widening MCP blind is how AGENTS
rules #2 and #3 get eroded by accident.

## Stories

### Story 3.1 — The one-line installer + `npx` path
**As a** new user on a fresh machine, **I want** one command to install the CLI,
**so that** the plugin's onboarding prints exactly one line and that line works.
**Acceptance:** `@golden-frijoles/cli` is published to npm; `npx @golden-frijoles/cli init` works with
nothing pre-installed; a `curl … | sh` installer places `gf` on `PATH` for macOS and Linux. The
installer is idempotent and prints the version it installed. **Verified on a machine that has never
seen the package** — not on the build machine.
**Risk:** low

### Story 3.2 — CI mode
**As a** deploy pipeline, **I want** the CLI to run non-interactively with a token from the
environment, **so that** `gf flags sync` can be a real deploy step.
**Acceptance:** `GOLDEN_FRIJOLES_TOKEN` authenticates with no interactive prompt; every command that
would prompt either takes `--yes` or fails with a usage error rather than hanging. Exit codes are
stable enough to branch on. **A command that blocks waiting for input in CI is the bug this story
prevents** — tested by running the suite with stdin closed.
**Risk:** low

### Story 3.3 — The MCP parity audit (a table, not code)
**As the** maintainer, **I want** the gap between the CLI and the MCP connector written down,
**so that** parity is a decision rather than an assumption.
**Acceptance:** a table lands in the **epic README**: every CLI verb, its corresponding MCP tool, or a
**stated reason there isn't one**. The baseline is the shipped connector
(`/api/v1/public/mcp/c/[token]/route.ts`, 524 lines). The table explicitly marks which gaps are
deliberate under AGENTS rule #2 (public paths serve the demo project only) and rule #3 (the connector
is enablement-gated) — **those are not gaps to close.** No code ships in this story.
**Risk:** low

### Story 3.4 — MCP write tools behind the shared command core
**As an** agent using the connector rather than the CLI, **I want** the same flag operations,
**so that** the two surfaces don't teach two different products.
**Acceptance:** each gap the audit marked closable is implemented as an MCP tool that calls the
**same pure command-core function the CLI calls** (**D4**) — parity is structural, not a checklist.
The tools sit behind `cli.write_api_enabled` and the connector's existing enablement gate: **both
gates, neither bypassed.** AGENTS rules #2 and #3 are unchanged; no public path gains a write.
**Risk:** high

### Story 3.5 — `/install` and the docs teach the CLI
**As a** visitor, **I want** the install page to show me the CLI as the primary path,
**so that** the product's front door matches what it actually offers an agent.
**Acceptance:** `/install` presents `npx @golden-frijoles/cli init` alongside the connector URL, in
the approved single-card block shape (`design-system-rails` Sprint 6 / `mockups-as-built` 4.5 — the
page is **one** `.listcard` with labelled sections, not three cards). The SDK block is **kept**;
deleting it would silently undo `landing-readability-pass`. `packages/sdk/README.md` links to the CLI
for catalog sync. **The install page and the CLI's printed next-steps are one surface and must say
the same thing.**
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/cli-ci-mode.spec.ts` runs the suite with stdin closed and asserts nothing
  hangs; `e2e/mcp-parity.spec.ts` asserts each new MCP write tool and its CLI twin produce **identical
  state** from identical input (the structural parity claim, tested rather than asserted); a
  `browser` spec asserts `/install` renders one card with the CLI section present.
- **browser smoke owed:** **yes, to the product owner** — adding the connector to Claude and driving a
  write tool through it is a real-session step.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` + `check-design-drift` +
  `design-coverage` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · https://golden-beans-gamma.vercel.app · **a machine that has never installed this CLI**

1. On that clean machine, run `npx @golden-frijoles/cli --version`.
   → A version prints.
2. Run the `curl … | sh` installer, then `gf --version` in a new shell.
   → Same version; `gf` is on `PATH`.
3. Run the installer again.
   → Idempotent: it reports the existing install and changes nothing.
4. Export `GOLDEN_FRIJOLES_TOKEN` and run `gf flags ls --json < /dev/null`.
   → Output, no prompt, exit 0. **Nothing hangs.**
5. Run `gf flags kill <key> --env staging` **without** `--yes` and with stdin closed.
   → A usage error, not a hang.
6. Open the epic README's parity table.
   → Every CLI verb has an MCP tool or a written reason. Rule-#2 and rule-#3 exclusions are marked as
     deliberate.
7. Go to https://golden-beans-gamma.vercel.app/install.
   → **One** card. The CLI command, the demo connector URL and the SDK block are labelled sections
     inside it — not three separate cards.
8. Copy the CLI command from `/install` and compare it to what `gf init` prints as its next step.
   → Identical.
9. (auth path — **owed to the product owner by name**) Add the connector to Claude at
   https://claude.ai/customize/connectors?modal=add-custom-connector and ask it to set a flag.
   → The write tool works, and the resulting state is **byte-identical** to running the same
     operation through `gf`.
10. Disable `cli.write_api_enabled` and retry step 9.
   → The write is refused — **fail closed** — and the read paths still work.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 10 is the one that proves the inversion was implemented.** A flag-read failure that granted
write access would be the worst possible bug in a flag product.
