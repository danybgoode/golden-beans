# @golden-frijoles/cli

Create a feature flag in every environment, roll it out, and kill it — from a terminal, or from an
agent. No browser, no human click.

```bash
npx @golden-frijoles/cli --version
```

## The one-minute version

```bash
npm i -g @golden-frijoles/cli          # or use npx for everything below

gf login                                # paste a token from /app/setup/cli
gf init                                 # project + key + .env.local + the snippet
gf flags create checkout.demo_enabled --kill-switch --all-envs
gf flags rollout checkout.demo_enabled --env production --percent 25
gf flags kill checkout.demo_enabled --env production
```

## Why this exists

Every high-risk change ships behind a flag, and a flag is invisible until it exists **in the
provider**. Before this, the one line of a release that most needs to be reliable — *create the flag
in every environment* — was the line that stopped and waited for someone to open a browser.

`gf flags create … --all-envs` is that line.

## Signing in

Mint a token at **`/app/setup/cli`** in the console, then:

```bash
gf login                # reads the token from stdin — never from argv, never from your history
gf whoami               # who you are, which credential, which projects
```

In CI, set `GOLDEN_FRIJOLES_TOKEN` and skip `gf login` entirely. Nothing is written to disk on that
path.

A token signs you in as **you**: it can do exactly what your console session can do, across every
project you are a member of, and nothing more. Revoke it at `/app/setup/cli`.

## Polarity — the thing to get right

A flag's polarity decides what it serves the day it is born, and the CLI derives everything else
from it, so the wrong combination is not expressible:

| You type | Default variant | Every environment serves | Reach for it when |
|---|---|---|---|
| `--kill-switch` | `on` | `true` | it is **on** until you kill it |
| `--enablement` | `off` | `false` | you will **open** it deliberately later |

Both polarities **activate in every environment you name.** "Created disabled" means *serving
`false`*, not *absent* — a flag that is not activated is missing from the snapshot, so your app falls
back to its own literal and the flag is invisible in the provider, which is the failure this tool
exists to end.

## `--all-envs`, and what happens when one fails

Three environments, three writes, no transaction. So:

- each environment is written **idempotently**,
- you get a **per-environment report**, and
- the exit code is **5** if any environment failed.

Never a silent partial.

## `--json` everywhere

Every command takes `--json`. Under it, **stdout carries exactly one JSON document and nothing
else** — no progress lines, no warnings. A failure is a JSON document too, on stdout, with a stable
`code`:

```json
{ "ok": false, "code": "not_found", "error": "No project `acme` is available to this account." }
```

`--help` output and these envelopes are pinned by golden-file tests. They do not change on a copy
edit.

## Exit codes

| Code | Name | Means |
|---|---|---|
| `0` | ok | it worked |
| `1` | usage | the command is wrong — nothing was sent |
| `2` | auth | the credential is not accepted — run `gf login` |
| `3` | not-found | no such thing, or not yours |
| `4` | conflict | someone else changed it — re-read and retry |
| `5` | partial | some environments changed and some did not |
| `6` | server | the server or the network is unwell — retry |

## When something is wrong

```bash
gf doctor
```

It runs without a credential — diagnosing a missing one is the point — and reports every check it
could run: the credentials file, the credential, its shape, whether the deployment answers, whether
it accepts you, whether your active project is reachable, and whether this CLI is current. It never
prints key material.

## Environment

| Variable | What it does |
|---|---|
| `GOLDEN_FRIJOLES_TOKEN` | a CLI token; wins over the saved credential. The CI path. |
| `GOLDEN_FRIJOLES_URL` | the deployment to talk to |
| `GOLDEN_FRIJOLES_PROJECT` | the active project |

`gf init` writes `GOLDEN_FRIJOLES_URL`, `GOLDEN_FRIJOLES_FLAG_READ_KEY` and
`GOLDEN_FRIJOLES_ENVIRONMENT` into `.env.local` (mode `0600`), adds that file to `.gitignore` — or
refuses — and prints the `@golden-frijoles/sdk` snippet that reads exactly those names.

## What it deliberately does not do

- **Send events.** That is the SDK's path (`@golden-frijoles/sdk`), and a second one would be a
  parallel pipeline.
- **Experiments, journeys, north star, scenarios, destinations, breakers.** Out of v1 on purpose.
- **A TUI.** Plain output and `--json`.
- **Plans and quotas.** Every account is unlimited today; `gf` will learn about plans when there is
  a plan to learn about.
