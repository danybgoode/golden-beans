# Golden Frijoles CLI v1 — Sprint 1: CLI skeleton, auth and init

**Status:** ⬜ not started

**Epic:** [Golden Frijoles CLI v1](README.md) · **Risk: MIXED (LOW + HIGH)** — 1.2 and 1.4 are HIGH (credentials on disk); the rest LOW

**Wave 1 of 3.** Ship something real: a `gf` that logs in, links a project, writes the env, and reads
flags. **Carved to stand alone** — if the appetite is exhausted after this sprint, a user can still
onboard and inspect their flags from the terminal, which is more than exists today.

## Stories

### Story 1.1 — `packages/cli` skeleton
**As an** agent, **I want** a CLI whose output I can parse and whose exit codes I can trust,
**so that** I never have to scrape prose from a help screen.
**Acceptance:** `packages/cli` publishes `@golden-frijoles/cli` with `bin: gf`. Every command accepts
`--json`. Exit codes are stable and documented (0 ok · 1 usage · 2 auth · 3 not-found · 4 conflict ·
5 network). `gf --help` and every `--json` shape are covered by **golden-file tests** (D5) — an
agent-facing contract that can change on a copy edit is a contract with no teeth. Zero runtime deps
beyond the SDK; Node 18+.
**Risk:** low

### Story 1.2 — `gf login` / `gf whoami`
**As an** agent running headless, **I want** to authenticate without completing a browser redirect,
**so that** auth isn't the thing that makes the CLI unusable by the caller it was built for.
**Acceptance:** per **D1**, `gf login` accepts a console-minted PAT (pasted once, or via
`GOLDEN_FRIJOLES_TOKEN`) and stores it at `~/.config/golden-frijoles/credentials.json` with mode
**0600**. `gf whoami` names the account and the active project. `gf logout` removes it. Credentials
are never echoed, never logged, and never written into the repo.
**Risk:** high

### Story 1.3 — `gf projects ls/create/use`
**As an** operator with several projects, **I want** an active-project concept in the CLI,
**so that** every later command has an unambiguous tenant without a flag on every call.
**Acceptance:** lists the caller's projects, creates one, and sets the active project (persisted
beside the credentials, overridable with `--project`). Reuses `lib/active-project.ts`'s semantics
rather than inventing a second notion of "active".
**Risk:** low

### Story 1.4 — `gf init` — the whole onboarding in one verb
**As a** developer or agent starting a project, **I want** one command that gets me from nothing to
a working flag client, **so that** onboarding is a command, not a documentation page.
**Acceptance:** `gf init` creates or links a project, mints a **`flag_read`** key (and only that —
`flag_sync` is an operator/deploy credential and belongs in CI secrets, never `.env.local`), writes
`.env.local`, **adds it to `.gitignore` or refuses to continue**, and prints the SDK snippet plus the
next command. **Re-running it is idempotent** — it does not mint a second key or duplicate env lines.
**Risk:** high

### Story 1.5 — `gf flags ls/get` + `gf doctor`
**As an** agent, **I want** to read the flag state and to be told precisely why I can't,
**so that** a failure costs one command rather than a session of guessing.
**Acceptance:** `gf flags ls` lists key, type, polarity and per-env state; `gf flags get <key>` shows
the definition, variants, rules and current rollout, reading `MAX_FLAG_*` from the SDK rather than
hardcoding limits. `gf doctor` correctly diagnoses **five** states: no credentials, expired
credentials, wrong/unset project, unreachable API, and an out-of-date CLI — each with the exact fix.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/cli-onboarding.spec.ts` (api project) drives `gf login → projects use → init →
  flags ls` against a disposable test project. Golden-file tests for `--help` and every `--json`
  shape live in `packages/cli/src/*.test.ts`.
- **browser smoke owed:** **yes, to the product owner** — minting the PAT in the console is a
  session-gated step an automated smoke can't cover.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` + the golden-file tests green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://golden-beans-gamma.vercel.app · a machine with only Node installed

1. Run `npx @golden-frijoles/cli@latest --version` (or `node packages/cli/dist/index.js --version` pre-publish).
   → A version prints. No install errors.
2. Go to https://golden-beans-gamma.vercel.app/app/keys/<your-project> and mint a CLI token.
   *(auth path — **owed to the product owner by name**; a browser session is required here.)*
   → A token is shown once.
3. Run `gf login` and paste it.
   → "Logged in as <account>". Then `ls -l ~/.config/golden-frijoles/credentials.json` shows `-rw-------`.
4. Run `gf whoami`.
   → Your account and active project.
5. In an empty directory, run `gf init`.
   → A project is linked, `.env.local` is written with a `flag_read` key, `.gitignore` contains
     `.env.local`, and the SDK snippet prints.
6. Run `gf init` again in the same directory.
   → It reports "already initialized" and changes nothing. No second key is minted.
7. Run `gf flags ls` and compare against https://golden-beans-gamma.vercel.app/app/flags/<your-project>.
   → Same flags, same per-env state.
8. Run `gf flags ls --json | python3 -m json.tool`.
   → Valid JSON, stable shape.
9. Move the credentials file aside and run `gf doctor`.
   → It says credentials are missing and names `gf login` as the fix. *(Then move it back.)*
10. Point `GOLDEN_FRIJOLES_URL` at a dead host and run `gf doctor`.
   → It reports the API as unreachable — not as an auth failure.

If any step fails, note the step number + what you saw — that's the bug report.
