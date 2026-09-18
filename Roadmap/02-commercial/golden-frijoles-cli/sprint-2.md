# Golden Frijoles CLI — Sprint 2: the write path

**Status:** ⬜ not started

> This is the sprint the epic exists for, and the one everything else imports. A kill-switch story
> that an agent can complete end to end is a flag that can be **created in every environment**,
> **rolled out**, and **killed**, from a terminal, with no browser and no human click.

## Build contract (locked by the architect before the builder started)

- **D2** — `--all-envs` is idempotent per environment, reports per environment, and exits `5` if any
  environment failed. Never a silent partial; never a rollback attempt.
- **D3** — polarity derives *both* the default variant and the activation. **Both polarities
  activate in every environment** — "created disabled" means serving `false`, not absent from the
  snapshot. `--kill-switch --enablement` is a usage error (exit `1`).
- **D4** — every verb's decision logic is a pure planner in `packages/sdk/src/flag-commands.ts`.
- **D10** — writes land on the existing `create_flag_definition_version` / `set_flag_activation` /
  `deactivate_flag` RPCs, carrying `expected_snapshot_version`. A `409` is surfaced as exit `4` with
  the message that tells the caller to re-read, never as a permissions error.
- The rule/variant/clause caps come from the SDK's `MAX_FLAG_*` constants. **No literal 20 anywhere
  in `packages/cli`** — asserted by a test.

## Stories

### Story 2.1 — `gf flags create` with polarity and `--all-envs`
**Acceptance:**
- [ ] `gf flags create <key> --kill-switch --all-envs` creates the definition and activates it in
      development, preview and production, serving `true` in each.
- [ ] `--enablement` does the same, serving `false`.
- [ ] Re-running is idempotent: an identical definition creates no second version, and an
      environment already serving it is reported `unchanged`, not re-written.
- [ ] A partial failure prints which environments succeeded and exits `5` (**D2**); `--json` carries
      `environments: [{ environment, status, version, error? }]`.
- [ ] `--type string|number|json` with `--variants` / `--default`; the caps read from the SDK.
**Risk:** high

### Story 2.2 — `gf flags set` / `rollout` / `rules`
**Acceptance:**
- [ ] `gf flags set <key> --env <e> --value <v>` creates a new version with that default and
      activates it.
- [ ] `gf flags rollout <key> --env <e> --percent <0-100>` writes a single rollout rule in basis
      points; `--percent 0` and `--percent 100` are exactly expressible.
- [ ] `gf flags rules <key> --rules-file rules.json` replaces the rule list. **No DSL** — a DSL is
      the rabbit hole the shaping named.
- [ ] Every one of these refuses a definition the SDK parser rejects, printing the parser's own
      errors, and exits `1` **before** any network call.
**Risk:** high

### Story 2.3 — `gf flags kill`
**As an** on-call operator at 3am, **I want** one verb, **so that** I do not compose it from two.
**Acceptance:**
- [ ] `gf flags kill <key> --env production` sets the default to the `off` variant **and clears
      every rule**, so no rollout can still be serving `true` to a slice.
- [ ] `--all-envs` kills everywhere, under the **D2** contract.
- [ ] The audit row names the CLI as actor and carries the reason (`--reason`, defaulted).
- [ ] `kill` on a flag whose value type is not boolean exits `1` and says why, rather than guessing
      an "off" for a string flag.
**Risk:** high

### Story 2.4 — `gf flags diff` / `history`
**Acceptance:**
- [ ] `gf flags history <key>` lists versions with author, timestamp and reason, and marks which
      version each environment serves.
- [ ] `gf flags diff <key> --from <v> --to <v>` and `--env a --env b` both work; the diff is
      semantic (default variant, variants, rules), not a JSON text diff.
- [ ] Both are read-only: no version, no activation, no audit row. Asserted.
**Risk:** low

### Story 2.5 — `gf flags sync`
**Acceptance:**
- [ ] Wraps the shipped `createFlagDefinitionSyncClient` against `/api/v1/flags/sync` with a
      `flag_sync` key — **not** the PAT. The catalog bridge keeps its own credential.
- [ ] `--file flags.json`, `--dry-run` (parses and reports, sends nothing), and a `409` surfaced as
      exit `4` naming the drifting key.
- [ ] Never activates. The route does not, and the CLI must not paper over that.
**Risk:** high

### Story 2.6 — `gf keys ls/create/revoke`
**Acceptance:**
- [ ] `--type ingest|flag_read|flag_sync` is **required** on create; the three are not flattened
      into one "key" (`lib/credential-inventory.ts` models three blast radii).
- [ ] `flag_read` requires `--env`; `flag_sync` requires `--source`.
- [ ] Plaintext is printed exactly once and never written to the credentials file.
- [ ] `revoke` is owner-only at the server, idempotent, and a foreign key id is `3`, not `403`.
**Risk:** high

## Smoke walkthrough

_(filled in at sprint close, with real URLs)_
