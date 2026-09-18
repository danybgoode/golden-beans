# Golden Frijoles CLI — Sprint 2: the write path

**Status:** ✅ Shipped — PR #150, `6aecdb0` (2026-09-18)

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
- [x] `gf flags create <key> --kill-switch --all-envs` creates the definition and activates it in
      development, preview and production, serving `true` in each.
- [x] `--enablement` does the same, serving `false`.
- [x] ⚠️ **Partly, and the difference is stated rather than glossed.** An environment already
      serving the version is reported `unchanged` — `set_flag_activation` returns `changed: false`
      and writes no row and no audit entry. But `create_flag_definition_version` DOES create a new
      immutable version each time, by design: versions are the control plane's history. So a repeated
      `gf flags create` is idempotent in what it SERVES and additive in what it RECORDS.
      `gf flags sync` is the verb with true create-once semantics (`created: false` on a no-op).
- [x] A partial failure prints which environments succeeded and exits `5` (**D2**); `--json` carries
      `environments: [{ environment, status, version, error? }]`.
- [x] `--type string|number|json` with `--variants` / `--default`; the caps read from the SDK.
**Risk:** high

### Story 2.2 — `gf flags set` / `rollout` / `rules`
**Acceptance:**
- [x] `gf flags set <key> --env <e> --value <v>` creates a new version with that default and
      activates it.
- [x] `gf flags rollout <key> --env <e> --percent <0-100>` writes a single rollout rule in basis
      points; `--percent 0` and `--percent 100` are exactly expressible.
- [x] `gf flags rules <key> --rules-file rules.json` replaces the rule list. **No DSL** — a DSL is
      the rabbit hole the shaping named.
- [x] Every one of these refuses a definition the SDK parser rejects, printing the parser's own
      errors, and exits `1` **before** any network call.
**Risk:** high

### Story 2.3 — `gf flags kill`
**As an** on-call operator at 3am, **I want** one verb, **so that** I do not compose it from two.
**Acceptance:**
- [x] `gf flags kill <key> --env production` sets the default to the `off` variant **and clears
      every rule**, so no rollout can still be serving `true` to a slice.
- [x] `--all-envs` kills everywhere, under the **D2** contract.
- [x] ⚠️ **Precisely:** the audit row names the acting **account** (`flag_lifecycle_audit
      .actor_user_id`, resolved from the CLI token) and carries the reason. It does not say "the
      CLI", because the control plane records WHO, not which client — and a row that named the tool
      instead of the person would be the audit-label-chosen-by-endpoint defect `lib/audit.ts` names.
- [x] `kill` on a flag whose value type is not boolean exits `1` and says why, rather than guessing
      an "off" for a string flag.
**Risk:** high

### Story 2.4 — `gf flags diff` / `history`
**Acceptance:**
- [x] `gf flags history <key>` lists versions with author, timestamp and reason, and marks which
      version each environment serves.
- [x] `gf flags diff <key> --from <v> --to <v>` and `--env a --env b` both work; the diff is
      semantic (default variant, variants, rules), not a JSON text diff.
- [x] Both are read-only: no version, no activation, no audit row. Asserted.
**Risk:** low

### Story 2.5 — `gf flags sync`
**Acceptance:**
- [x] Wraps the shipped `createFlagDefinitionSyncClient` against `/api/v1/flags/sync` with a
      `flag_sync` key — **not** the PAT. The catalog bridge keeps its own credential.
- [x] `--file flags.json`, `--dry-run` (parses and reports, sends nothing), and a `409` surfaced as
      exit `4` naming the drifting key.
- [x] Never activates. The route does not, and the CLI must not paper over that.
**Risk:** high

### Story 2.6 — `gf keys ls/create/revoke`
**Acceptance:**
- [x] `--type ingest|flag_read|flag_sync` is **required** on create; the three are not flattened
      into one "key" (`lib/credential-inventory.ts` models three blast radii).
- [x] `flag_read` requires `--env`; `flag_sync` requires `--source`.
- [x] Plaintext is printed exactly once and never written to the credentials file.
- [x] `revoke` is owner-only at the server, idempotent, and a foreign key id is `3`, not `403`.
**Risk:** high

## Smoke walkthrough

Run against **production** after `6aecdb0` deployed.

1. **The write route is live.** `curl -X POST https://goldenfrijoles.com/api/v1/cli/flags/write -d '{}'`
   → **401** `{"code":"unauthorized"}` (the gate's JSON, not a 404).
2. **An ingest key cannot write.** Same request with `Authorization: Bearer gb_key_…` → **401**.
3. **The write semantics, against the real control plane.** `cli-flag-write.spec.ts` (8 specs, local
   stack, the same RPCs production runs): `create --kill-switch --all-envs` serves `true` in all
   three environments; an identical re-run writes **no** new version and reports `unchanged`;
   `set` back to an old definition writes **v3**, never resurrecting v1; a change is computed from the
   **served** version, never an unactivated draft; `kill` clears every rule; environments on different
   versions are refused; a member gets 404; the audit row names the acting account and the reason.

**Owed to the product owner, by name:** `gf flags create <key> --kill-switch --all-envs` then
`gf flags kill <key> --env production` on a real project, and the console at
`/app/flags/<project>` showing it — the epic's acceptance sentence, by hand, with your token.
