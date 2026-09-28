---
epic: golden-frijoles-plugin
sprint: 3
title: "The front door"
risk: high
phase: Verifying
stories_total: 5
stories:
  - id: S3.1
    title: "The golden-frijoles umbrella skill"
    as_a: "a stranger's agent"
    i_want: "one `golden-frijoles` skill that knows where to start"
    so_that: "I don't need to know ten skill names before I'm useful"
    risk: low
    status: done
  - id: S3.2
    title: "Adopt any repo: `gf-kit init`"
    as_a: "a stranger with an existing repo"
    i_want: "`gf-kit init` to add the Roadmap skeleton"
    so_that: "groom has somewhere to write on day one"
    risk: low
    status: done
  - id: S3.3
    title: "The install prompt as one module on three surfaces"
    as_a: "a visitor or a new signup"
    i_want: "the install prompt in a copy box on the landing's closing CTA, `/install` and my onboarding page"
    so_that: "I can paste it into my agent from wherever I am"
    risk: low
    status: done
  - id: S3.4
    title: "The prompt is checked by running it"
    as_a: "Daniel"
    i_want: "every surface's install prompt to agree and to execute"
    so_that: "no surface advertises a command that doesn't exist"
    risk: low
    status: done
  - id: S3.5
    title: "The two stranger walkthroughs"
    as_a: "a stranger"
    i_want: "to paste one prompt into an empty repo and plan my first idea"
    so_that: "the landing's promise is true"
    risk: low
    status: in-progress
---
# One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo — Sprint 3: The front door

**Status:** 🟦 in review: S3.1–S3.4 are merged and deployed (golden-frijoles/skills#47 `3a06aa0`, release `v0.3.0` + kit 0.3.0 with provenance; danybgoode/golden-beans#163 `d32fde9`, Vercel production). S3.5, both stranger walkthroughs, is owed to Daniel, so the sprint isn't closed · **Wave:** 1

One name to start from, a way to adopt any repo, and the install prompt, from one module and checked by running it, on the landing's closing CTA, `/install` and signed-in onboarding. It ends with the two stranger walkthroughs.

## Build contract (locked by the architect before the builder started)

Cites the epic README's D2, D3, D4, D6, D8 and deviations X9, X10. **Branch:** `feat/golden-frijoles-plugin-s3`, cut
from `-s2`. One PR here (S3.1, S3.2, S3.4, and S3.5's written walkthrough) plus one golden-beans PR (S3.3). The S3
merge bumps to `0.3.0` (X5).

**The install prompt: its text lives once.** The string is the audit's §3.1 prompt, verbatim. golden-beans
`apps/web/lib/install-prompt.ts` is the **source** (`export const INSTALL_PROMPT`). It's a constant: it names only
`github.com` / `raw.githubusercontent.com` URLs and no site URL, so AGENTS rule #5 (`getSiteUrl()`) doesn't apply. Say
so in its header. This repo **transcribes** it into `template/scripts/lib/golden-onboarding.mjs` as
`INSTALL_PROMPT`, naming the source file, the same way that module already transcribes `cli-install.ts`. The
transcription is never edited by hand without the source changing first.

**S3.1: The umbrella skill.**
- `plugins/golden-frijoles/skills/golden-frijoles/SKILL.md`, ≤ 150 lines, with a `summary:` for the adverts.
  `requires_scripts: [init.mjs, lib/project-root.mjs]` (its closure).
- **Detect** (each detection is a command, never a guess):
  - Is `Roadmap/` present?
  - Is `gf` linked? Use `node scripts/preflight.mjs` through the D3 rule.
  - Is the kit reachable? Use `npx -y @golden-frijoles/kit@<v> --version`.
  - Which channel is this? *(Corrected during the build: `${CLAUDE_PLUGIN_ROOT}` is measured **not**
    set in a skill's shell — epic README X13.)* Resolve it from where the skill was loaded from
    instead: a Claude Code plugin cache or `--plugin-dir` → the Claude Code plugin; `.agents/skills/`,
    `~/.claude/skills/` or a project's own `./.claude/skills/` → `npx skills`; a URL → a raw read.
- **Route by job:** plan → `groom`; build → `live-smoke` (+ the review rails, with their project-local caveat);
  operate → `standup-post` / `weekly-recap` / `pmo-report` / `babysit-pr` / `doc-hygiene` / `vercel-prune`;
  ship → `gf`.
- **State what the `npx skills` channel lacks:** no build-view hook, no `pr-reviewer` agent.
- **Setup in wave 1** = `gf-kit init` (S3.2), then offer `groom`. Wave 2's interview isn't referenced.
- It carries `INSTALL_PROMPT` verbatim in a fenced block, which makes it a parity surface.

**S3.2: `gf-kit init` = `template/scripts/init.mjs`.**
- It exports `SKELETON`: `Roadmap/README.md`, `Roadmap/WAYS-OF-WORKING.md`, `Roadmap/LEARNINGS.md`,
  `Roadmap/00-ideas/README.md`, `Roadmap/00-ideas/seeds/.gitkeep`, `Roadmap/00-ideas/audits/.gitkeep`.
- Where the skeleton comes from: `kitRoot()/skeleton/` when installed, `kitRoot()/../` in copied mode (that's
  `template/`). `build-kit.mjs` copies `template/<each SKELETON path>` into `kit/dist/skeleton/`, reading the list
  from `init.mjs`'s export. That's one list.
- It writes into `projectRoot()` and **never overwrites** an existing file: it prints `skipped <path> (exists)`. It's
  idempotent, and it writes nothing outside `Roadmap/`. Its exit is 0 whether it wrote anything or not.
- `init.test.mjs` covers a fresh temp repo, one that's partially present, and one that's fully present, plus a byte
  check that it never wrote over a pre-existing file. Watch it fail once by mutation.
- The tarball spec from S2.1 gains `gf-kit init` in an empty temp repo.

**S3.3: golden-beans (X9).**
- `INSTALL_PROMPT` goes through `CopyPromptCard` in three places:
  - `MakerClosingCta` (it replaces that card's current prompt; the **hero keeps** `handoffPrompt`);
  - `/install` (`app/install/page.tsx`);
  - `/app/onboarding/[projectSlug]`.
- **First, measure** `public-install`'s structural signature before and after
  (`node apps/web/design-system/state-contract.mjs --check` + `console-visual`). If the signature changes, stop at
  that point. The `console-prototype.html` edit + `APPROVED.md` line are a design approval **owed to Daniel in one
  focused question**. Never edit the prototype and leave the hash alone.
- An api spec asserts each of the three routes serves the exact string. The onboarding one is authed: use the
  existing authed fixture pattern, and if none can reach it, say so and mark it owed.
- A browser smoke on `/` and `/install`. The signed-in onboarding smoke is owed to Daniel.
- The gate is golden-beans' own.

**S3.4: Parity that runs (D8, X10).** Carried in from S1 review (#44): the repo `README.md` is the
stranger's front door on `golden-frijoles/skills`, and S1 retitled it without rewriting it. The intro and the *Consume the
marketplace* section are rewritten here for a stranger, around `INSTALL_PROMPT`. The `## Origin` provenance stays.
`check-onboarding-parity.mjs`:
- `INSTALL_PROMPT` must appear verbatim in the repo `README.md`, the umbrella SKILL.md, and the golden-onboarding
  transcription. Fixtures fire on a one-word drift.
- `--exec` adds three probes:
  - `npx -y skills@1.7.0 add golden-frijoles/skills --list` must list `golden-frijoles`.
  - `claude plugin marketplace add golden-frijoles/skills` then `claude plugin install golden-frijoles@golden-frijoles`
    run with `HOME`, `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR` at an empty temp dir. Assert the temp config now lists
    `golden-frijoles`.
  - **The negative control:** the sha256 of the real `~/.claude/plugins/installed_plugins.json` is unchanged
    (absent-before = absent-after).
- A missing `claude` or `npx`, or no network, skips with a `::warning::`. It never fails for that.
- CI: the existing `--exec` step installs the pinned `@anthropic-ai/claude-code@2.1.278` first. `--exec` runs against
  the **live repo**, so it goes green only after the S1 transfer and the S3 merge. The PR states that, and the check
  is re-run post-merge and pasted.

**S3.5: Walkthroughs.**
- Rewrite this sprint's smoke walkthrough with real, runnable steps for (a) Claude Code and (b) Codex through
  `npx skills`.
- Pass = a seed in `Roadmap/00-ideas/seeds/` **and** no `scripts/` dir. In (b) the umbrella skill says what's
  missing.
- The builder dry-runs (a) itself in a scrubbed `HOME` with a temp repo, as far as a headless session allows, and
  reports exactly where it stopped. The runs on a clean machine are owed to Daniel.

**Stop and escalate** on any trigger in WAYS-OF-WORKING → *Escalate, don't guess*, and on any design-approval change
(X9).

## Stories

### Story 3.1 — The golden-frijoles umbrella skill ✅
**As** a stranger's agent, **I want** one `golden-frijoles` skill that knows where to start, **so that** I don't need to know ten skill names before I'm useful.
**Acceptance:** `plugins/golden-frijoles/skills/golden-frijoles/SKILL.md`: detects state (Roadmap present? `gf` linked? kit reachable? which channel?), routes by job (plan → groom; build → live-smoke; operate → reports; ship → `gf`), **says what the `npx skills` channel lacks** (no build-view hook, no `pr-reviewer` agent), and offers setup (S3.2 in wave 1, the interview in wave 2). It's listed by `npx skills add golden-frijoles/skills --list`.
**QA:** `claude plugin validate`; the `--list` check in S3.4
**Risk:** low

### Story 3.2 — Adopt any repo: `gf-kit init` ✅
**As** a stranger with an existing repo, **I want** `gf-kit init` to add the Roadmap skeleton, **so that** groom has somewhere to write on day one.
**Acceptance:** Writes `Roadmap/` (README, WAYS-OF-WORKING, LEARNINGS, `00-ideas/` with seeds/audits) from the template. **Never overwrites** an existing file (it says which it skipped). Idempotent. Adds nothing else to the repo.
**QA:** unit test on a temp repo: fresh, partially present, and fully present
**Risk:** low

### Story 3.3 — The install prompt as one module on three surfaces ✅
**As** a visitor or a new signup, **I want** the install prompt in a copy box on the landing's closing CTA, `/install` and my onboarding page, **so that** I can paste it into my agent from wherever I am.
**Acceptance:** golden-beans `apps/web/lib/install-prompt.ts` holds the prompt (audit §3.1 text, using `golden-frijoles/skills` and `golden-frijoles@golden-frijoles`). Rendered through `CopyPromptCard` in the **closing CTA** (the hero keeps its workshop prompt), on `/install` and on `/app/onboarding/[projectSlug]`. The design-system state contract for those routes is **updated, not bypassed**.
**QA:** api spec that each route serves the exact string; **browser smoke** on `/` and `/install`; the signed-in onboarding smoke **owed to Daniel**
**Risk:** low

### Story 3.4 — The prompt is checked by running it ✅
**As** Daniel, **I want** every surface's install prompt to agree and to execute, **so that** no surface advertises a command that doesn't exist.
**Acceptance:** `check-onboarding-parity.mjs` asserts the identical string in the repo `README.md` (*lock X10: there's no plugin README*), the umbrella SKILL.md and a transcription of golden-beans' module (with the source file named, as `golden-onboarding.mjs` does). `--exec`: runs `npx skills add golden-frijoles/skills --list` and asserts `golden-frijoles` is listed; runs `claude plugin marketplace add golden-frijoles/skills` + `claude plugin install golden-frijoles@golden-frijoles` in a **scrubbed `HOME` / `XDG_CONFIG_HOME` / `CLAUDE_CONFIG_DIR`**, asserting the isolation with a negative control (D8). It skips loudly when a binary is missing and never fails for that.
**QA:** parity fixtures that fire on a one-word drift; the exec mode in CI
**Risk:** low

### Story 3.5 — The two stranger walkthroughs
**As** a stranger, **I want** to paste one prompt into an empty repo and plan my first idea, **so that** the landing's promise is true.
**Acceptance:** Written as this sprint's walkthrough and run on a machine that has never seen these repos: (a) Claude Code, (b) Codex via `npx skills`. Pass = a seed lands in `Roadmap/00-ideas/seeds/` and **there is no `scripts/` folder in the repo**. In (b) the umbrella skill says hooks and agents aren't available.
**QA:** **owed to Daniel**: running both walkthroughs
**Risk:** low

## Sprint QA
- **specs:** named per story above. This repo's gate is `node --test` + the CI checks in `.github/workflows/ci.yml`; golden-beans stories use its own gate (`tsc` + build + Playwright `api`).
- **owed to Daniel:** Story 3.3, Story 3.5
- **deterministic gate:** every CI check green before merge; high-risk stories → Daniel merges

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production (GitHub, npm and https://goldenfrijoles.com). Use the preview URL for golden-beans changes while
pre-merge. **Pass, for both stranger walkthroughs below: a seed lands in `Roadmap/00-ideas/seeds/` AND `ls` shows
no `scripts/` folder in the repo** — the whole point of the kit (D1–D3) is that a stranger never receives scripts.

1. Open https://goldenfrijoles.com and scroll to the closing section
   → A box with the install prompt and a **Copy** button. The hero still offers the workshop prompt.
2. Open https://goldenfrijoles.com/install
   → The same prompt, character for character, with a Copy button.
3. Sign in and open https://goldenfrijoles.com/app/onboarding/<your-project-slug> (owed to Daniel: signed-in)
   → The same prompt appears on the onboarding page.

### Stranger walkthrough A — Claude Code (owed to Daniel: the real, interactive run)

On a machine that has never run either repo, in an empty folder:

```
mkdir demo && cd demo && git init -q && claude
```

Paste the install prompt (word for word — it's the fenced block in the umbrella skill, above, and in the repo
README's opening section):

```
Install the golden-frijoles plugin. If you're in Claude Code, run `claude plugin marketplace add golden-frijoles/skills`, then `claude plugin install golden-frijoles@golden-frijoles`. If you're in another agent, run `npx skills add golden-frijoles/skills --skill '*'` and select your agent. Use one installation method. You can read the skill directly at https://github.com/golden-frijoles/skills/blob/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md (raw: https://raw.githubusercontent.com/golden-frijoles/skills/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md). Then use the golden-frijoles skill when working on this project, and start with its setup.
```

→ Claude runs `claude plugin marketplace add golden-frijoles/skills` then `claude plugin install
golden-frijoles@golden-frijoles`, loads the `golden-frijoles` skill, detects no `Roadmap/`, and offers `gf-kit
init`.

Then say: **"set it up, then groom this idea: a dark mode toggle"**

→ `Roadmap/` appears (via `gf-kit init` — `npx -y @golden-frijoles/kit@<version> init` under the hood, since a
fresh `demo/` has no local `scripts/`), then `groom` runs and a seed lands in `Roadmap/00-ideas/seeds/`. `ls`
shows **no `scripts/` folder** — everything the skills ran came from `npx`, nothing was copied into the repo.

**Builder's own dry run (S3.5, this sprint — as far as a headless session allows):** attempted non-interactively
(`claude -p "<the prompt>"`) in a scrubbed `HOME`/`XDG_CONFIG_HOME`/`CLAUDE_CONFIG_DIR` empty temp dir, inside an
empty `git init` repo, no timeout hit. **It stopped immediately, at authentication**: `claude -p` returned
`{"is_error":true,"result":"Not logged in · Please run /login", ...}` before any tool call, because a scrubbed
`HOME` has no OAuth credential and no keychain entry — by construction, since the same isolation this sprint's
`--exec` probes rely on (D8) also isolates away a real login. This is as far as a headless dry run can go: the
interactive login step, and everything after it (the plugin install, the skill load, `groom`), needs a real
device session and is owed to Daniel below. It does confirm the negative property that matters most for a dry
run of an untrusted prompt: nothing in the scrubbed sandbox touched the operator's real Claude Code config.

### Stranger walkthrough B — Codex via `npx skills` (owed to Daniel: the real, interactive run)

Same empty folder, a different agent:

```
mkdir demo-codex && cd demo-codex && git init -q
npx skills add golden-frijoles/skills --skill '*'
```

(Or paste the install prompt into Codex — it reads "If you're in another agent, run `npx skills add
golden-frijoles/skills --skill '*'` and select your agent" and runs the equivalent command itself.)

→ `npx skills` installs every skill: the `golden-frijoles` umbrella **and** the skills it routes to (`--skill '*'`; with `--skill golden-frijoles` alone, measured, only the umbrella lands, and its first hand-off to `groom` dead-ends) with **no hooks and no
agents directory** — confirmed live this sprint (`npx -y skills@1.7.0 add golden-frijoles/skills --list`; see
S3.4's report for the exact pre-merge output). The umbrella skill's own text says so: "No build-view hook … No
`pr-reviewer` agent" — that's what makes this channel not a silent, worse Claude Code.

Then, in Codex: **"set it up, then groom this idea: a dark mode toggle"**

→ Same as walkthrough A: `gf-kit init` (via `npx`) writes `Roadmap/`, `groom` runs, a seed lands in
`Roadmap/00-ideas/seeds/`, and `ls` shows no `scripts/` folder. The umbrella skill states plainly, before doing
anything else, that this channel lacks the build-view hook and the `pr-reviewer` agent.

**Run by the orchestrator after the merges, 2026-09-23:**
- Steps 1–2 ✅: `https://goldenfrijoles.com/` and `/install` serve the EXACT `INSTALL_PROMPT`, checked against the
  loaded constant, not by eye.
- `check-onboarding-parity --exec --live` against the published repo is all ✅:
  - `npx skills add golden-frijoles/skills --list` lists `golden-frijoles`;
  - the isolated `claude plugin marketplace add` + `install` succeeds;
  - `--skill '*' -a codex -y` installs all 11 skills.
- **Owed to Daniel:** step 3 (signed-in onboarding) and stranger walkthroughs A and B on a clean machine.

If any step fails, note the step number + what you saw — that's the bug report.
