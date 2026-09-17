# Golden Frijoles CLI — Sprint 1: something real, installed and authenticated

**Status:** 🟨 building

> Sprint 1 ships a CLI that a person can install, log in with, and read their flags with. It does
> not write a flag — that is Sprint 2. What it *does* build is every seam Sprint 2 writes through:
> the credential, the transport, the `--json` envelope, the exit codes and the golden-file gate.

## Build contract (locked by the architect before the builder started)

Cited by number, never paraphrased. Full text in [`README.md`](./README.md) → *Architecture
decisions — LOCKED*.

- **D1** — auth is a console-minted, **account-scoped** PAT in its own `cli_tokens` table.
  `api_keys.project_id` is `NOT NULL`, so no row there can answer "which projects does this caller
  have?" before a project is known.
- **D4** — the pure command core lives in `packages/sdk/src/flag-commands.ts`, so `apps/web` and
  `packages/cli` import the *same* module.
- **D5** — `--help` and every `--json` envelope are golden files under
  `packages/cli/src/__golden__/`, diffed by `npm run test:unit`.
- **D6** — `gf init` writes `GOLDEN_FRIJOLES_*` names and prints the snippet that reads them.
- **D8** — `isCliWriteApiEnabled()` gates every CLI route, **born ON**.
- **D9** — `gf projects create` is an idempotent ensure; the database allows one self-serve project
  per creator.
- **D10** — the routes call the *existing* `lib/flag-registry.ts` RPCs. No new SQL touches flag state.

## Stories

### Story 1.1 — `packages/cli` skeleton
**As an** agent, **I want** `gf` to be a real binary with a stable contract, **so that** I can drive
it without scraping prose.
**Acceptance:**
- [ ] `packages/cli` publishes as `@golden-frijoles/cli` with `bin: { gf }`, built by `tsc` to
      `dist/`, matching `packages/sdk`'s publishing shape.
- [ ] `gf --version` prints the package version; `gf --help` lists every verb.
- [ ] `--json` on every command; human output on a TTY, never both.
- [ ] Exit codes are a named enum, not literals: `0` ok · `1` usage · `2` auth · `3` not-found ·
      `4` conflict · `5` partial (D2) · `6` network/server.
- [ ] Golden-file test on `gf --help` and each subcommand's help (**D5**).
**Risk:** low

### Story 1.2 — `gf login` / `gf whoami`
**As an** agent with no browser, **I want** to authenticate headlessly, **so that** the session does
not stop for a human click.
**Acceptance:**
- [ ] Migration `cli_tokens` (+ `active_cli_tokens` view with revocation and expiry welded in,
      service-role only) applied to production **before** the PR merges.
- [ ] `/app/cli` mints a PAT from a signed-in session, shows the plaintext once, lists and revokes.
- [ ] `gf login --token <pat>` writes `~/.config/golden-frijoles/credentials.json` at `0600`;
      `gf login` with no flag reads stdin so a token is never in `argv` (or shell history).
- [ ] `GOLDEN_FRIJOLES_TOKEN` overrides the file; `gf whoami` names the account and its projects.
- [ ] A revoked or expired token exits `2` with a machine-readable error, indistinguishable from an
      unknown one.
**Risk:** high

### Story 1.3 — `gf projects ls` / `create` / `use`
**Acceptance:**
- [ ] `gf projects ls` lists the caller's memberships with role; `--json` is a stable array.
- [ ] `gf projects use <slug>` records the active project in the credentials file; a slug the caller
      is not a member of exits `3`, indistinguishable from one that does not exist.
- [ ] `gf projects create` is idempotent per **D9** and reports `{ created: false, slug }` when the
      account already has its project.
**Risk:** low

### Story 1.4 — `gf init`
**As a** product owner, **I want** one verb to do the whole onboarding, **so that** a fresh agent
gets from nothing to a working SDK call without a browser.
**Acceptance:**
- [ ] Ensures a project, mints a `flag_read` key for the chosen environment, writes `.env.local`
      with `GOLDEN_FRIJOLES_*` names (**D6**), and **refuses** if it cannot add `.env.local` to
      `.gitignore`.
- [ ] Prints the SDK snippet that reads exactly the names it just wrote.
- [ ] **Re-running is idempotent**: it does not mint a second key when the existing file already
      carries a live one, and says so.
- [ ] `.env.local` is written `0600`; the key is never echoed to stdout when `--json` is off.
**Risk:** high

### Story 1.5 — `gf flags ls` / `gf flags get` / `gf doctor`
**Acceptance:**
- [ ] `gf flags ls` shows key, value type, and per-environment served state + version.
- [ ] `gf flags get <key>` adds the definition, its version history and the activation per env.
- [ ] `gf doctor` diagnoses, each with its own exit code and message: no credentials · expired or
      revoked credentials · no active project · a project the caller cannot see · unreachable API ·
      an out-of-date CLI (compares against the registry's `latest`).
- [ ] `gf doctor` **never prints key material** — asserted by a test that greps its output.
**Risk:** low

## Smoke walkthrough

_(filled in at sprint close, with real URLs)_
