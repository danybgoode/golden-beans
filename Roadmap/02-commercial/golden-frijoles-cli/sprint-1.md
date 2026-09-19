---
epic: golden-frijoles-cli
sprint: 1
title: something real, installed and authenticated
risk: high
phase: Shipped
stories_total: 5
stories:
  - id: S1.1
    title: packages/cli skeleton
    as_a: an agent
    i_want: "`gf` to be a real binary with a stable contract"
    so_that: I can drive it without scraping prose
    risk: low
    status: done
  - id: S1.2
    title: gf login / gf whoami
    as_a: an agent with no browser
    i_want: to authenticate headlessly
    so_that: the session does not stop for a human click
    risk: high
    status: done
  - id: S1.3
    title: gf projects ls / create / use
    as_a: null
    i_want: null
    so_that: null
    risk: low
    status: done
  - id: S1.4
    title: gf init
    as_a: a product owner
    i_want: one verb to do the whole onboarding
    so_that: a fresh agent gets from nothing to a working SDK call without a browser
    risk: high
    status: done
  - id: S1.5
    title: gf flags ls / gf flags get / gf doctor
    as_a: null
    i_want: null
    so_that: null
    risk: low
    status: done
---
# Golden Frijoles CLI — Sprint 1: something real, installed and authenticated

**Status:** ✅ Shipped — PR #149, `43c5ca6` (2026-09-18)

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
- [x] `packages/cli` publishes as `@golden-frijoles/cli` with `bin: { gf }`, built by `tsc` to
      `dist/`, matching `packages/sdk`'s publishing shape.
- [x] `gf --version` prints the package version; `gf --help` lists every verb.
- [x] `--json` on every command; human output on a TTY, never both.
- [x] Exit codes are a named enum, not literals: `0` ok · `1` usage · `2` auth · `3` not-found ·
      `4` conflict · `5` partial (D2) · `6` network/server.
- [x] Golden-file test on `gf --help` and each subcommand's help (**D5**).
**Risk:** low

### Story 1.2 — `gf login` / `gf whoami`
**As an** agent with no browser, **I want** to authenticate headlessly, **so that** the session does
not stop for a human click.
**Acceptance:**
- [x] Migration `cli_tokens` (+ `active_cli_tokens` view with revocation and expiry welded in,
      service-role only) **applied to production before #149 merged** — by Daniel via
      `supabase db push` (2026-09-18), confirmed on the remote with `supabase migration list
      --linked`, then proved live by step 2 of the smoke walkthrough.
- [x] `/app/setup/cli/<project>` mints a PAT from a signed-in session, shows the plaintext once,
      lists and revokes. Setup’s third destination, member-readable — a CLI token is administered
      against an ACCOUNT, so gating it to owners would bar a member from reading in a terminal what
      they already read in a browser.
- [x] `gf login --token <pat>` writes `~/.config/golden-frijoles/credentials.json` at `0600`;
      `gf login` with no flag reads stdin so a token is never in `argv` (or shell history).
- [x] `GOLDEN_FRIJOLES_TOKEN` overrides the file; `gf whoami` names the account and its projects.
- [x] A revoked or expired token exits `2` with a machine-readable error, indistinguishable from an
      unknown one.
**Risk:** high

### Story 1.3 — `gf projects ls` / `create` / `use`
**Acceptance:**
- [x] `gf projects ls` lists the caller's memberships with role; `--json` is a stable array.
- [x] `gf projects use <slug>` records the active project in the credentials file; a slug the caller
      is not a member of exits `3`, indistinguishable from one that does not exist.
- [x] `gf projects create` is idempotent per **D9** and reports `{ created: false, slug }` when the
      account already has its project.
**Risk:** low

### Story 1.4 — `gf init`
**As a** product owner, **I want** one verb to do the whole onboarding, **so that** a fresh agent
gets from nothing to a working SDK call without a browser.
**Acceptance:**
- [x] Ensures a project, mints a `flag_read` key for the chosen environment, writes `.env.local`
      with `GOLDEN_FRIJOLES_*` names (**D6**), and **refuses** if it cannot add `.env.local` to
      `.gitignore`.
- [x] Prints the SDK snippet that reads exactly the names it just wrote.
- [x] **Re-running is idempotent**: it does not mint a second key when the existing file already
      carries a live one, and says so.
- [x] `.env.local` is written `0600`; the key is never echoed to stdout when `--json` is off.
**Risk:** high

### Story 1.5 — `gf flags ls` / `gf flags get` / `gf doctor`
**Acceptance:**
- [x] `gf flags ls` shows key, value type, and per-environment served state + version.
- [x] `gf flags get <key>` adds the definition, its version history and the activation per env.
- [x] `gf doctor` diagnoses, each with its own exit code and message: no credentials · expired or
      revoked credentials · no active project · a project the caller cannot see · unreachable API ·
      an out-of-date CLI (compares against the registry's `latest`).
- [x] `gf doctor` **never prints key material** — asserted by a test that greps its output.
**Risk:** low

## Mutation checks — observed red, then restored

> **Why this table exists.** `cli-api.spec.ts` says "both mutation-checked (see sprint-1.md)", and
> the first version of this document did not record them — prose reading as evidence, which is the
> failure the repo keeps finding. Every row below was run: the mutation applied, the named test
> observed failing, the tree restored and re-verified byte-identical.

| # | Mutation | Went red on |
|---|---|---|
| 1 | `planFlagKill` stops clearing the rule list | *kill flips the default to the false variant AND CLEARS EVERY RULE* |
| 2 | `percentToBasisPoints` clamps instead of rejecting | *an out-of-range percent is REJECTED, never clamped* (both copies) |
| 3 | the `--help` header text changes | the `help.txt` golden file |
| 4 | a golden file is **deleted** | that contract's test — it does not self-heal |
| 5 | `resolveCliToken` reads `cli_tokens` instead of `active_cli_tokens` | the REVOKED and EXPIRED specs |
| 6 | `requireCliOwner` stops reading the caller's real role | *minting a credential is OWNER-only* |
| 7 | a foreign project answers `400` instead of `404` | *a project this account is not a member of is 404, never 403* |
| 8 | `GRANT INSERT ON active_cli_tokens TO service_role` | *service_role CANNOT insert a forged credential* |
| 9 | `GRANT DELETE ON cli_tokens TO service_role` | *service_role CANNOT delete a cli_token* |

⚠️ **Row 8 found a defect in its own test.** The first version of that spec inserted a
`randomUUID()` as `user_id`, which violates the foreign key to `auth.users` — so the write failed on
the FK whether or not the grant existed, and restoring `GRANT INSERT` left the test **green**. It
now seeds a real account and a well-formed hash, so the REVOKE is the only thing that can refuse it.
A guard gets the same suspicion as the code (CODE-QUALITY #5b), and this one needed it.

## Smoke walkthrough

Run against **production** after `43c5ca6` deployed. Each step says what was observed, not what was expected.

1. **The API is live, not dark (D8).** `curl https://goldenfrijoles.com/api/v1/cli/whoami` →
   **401** with `{"ok":false,"code":"unauthorized",…}`. A `404` would mean the gate is closed; the
   JSON body (not Next's HTML 404) is what proves the route exists. Observed on `whoami`,
   `projects`, `flags` and `keys`.
2. **The production lookup reached the migration.** A well-formed but unknown `gf_pat_…` →
   `unauthorized`, **not** `server_error`. A missing `active_cli_tokens.token_hash` column would
   have been a 500 — which is exactly the defect the local e2e suite found before merge.
3. **Other credentials are refused.** An ingest-shaped `gb_key_…` → **401**, the same answer.
4. **The console surface is behind sign-in.** `https://goldenfrijoles.com/app/setup/cli/<project>`
   anonymously → **307 → /login**.
5. **Mint → use → revoke, through the real page.** Proved by `cli-access.authed.spec.ts`: a signed-in
   user mints at *Setup › CLI access*, the plaintext appears once, `/api/v1/cli/whoami` accepts it,
   revoking it in the page makes the API refuse it. Run locally against the full stack.

**Owed to the product owner, by name:** the same mint → `gf login` → `gf whoami` walk **by hand on
production** with a real account. It needs your session; no automated step here holds one.
