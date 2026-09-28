---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Verifying      # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: golden-frijoles-plugin
title: "One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 5
stories_total: 23   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 34       # integer position in the ONE global build sequence
---

# Epic: One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/golden-frijoles-plugin.md`](../../00-ideas/seeds/golden-frijoles-plugin.md)
> **Appetite:** L, two waves (S1–S3 = wave 1 "install", S4–S5 = wave 2 "configure"), **re-bet at the boundary**.
> **Origin:** Seed 1 + Seed 4 of golden-beans `Roadmap/00-ideas/audits/golden-frijoles-unification-2026-09-23.md` (audit decisions D1–D8, approved 2026-09-23).
> **Repos touched:** this repo (renamed `golden-frijoles/skills` in S1.2, formerly `danybgoode/dobby-foundation`), golden-beans (S1.4, S2.5, S3.3, S5.2), medusa-bonsai (S1.4 only).

> **Wave 1 ("install") shipped 2026-09-23; its closing verification (S3.5) is owed**: releases `v0.1.0`–`v0.3.0`, `@golden-frijoles/kit@0.3.0` on npm with
> verified provenance, and the install prompt live on goldenfrijoles.com and proven by running it. See
> [`WAVE-1-RETROSPECTIVE.md`](WAVE-1-RETROSPECTIVE.md). **Wave 2 ("configure", S4–S5) was bet 2026-09-24** and is locked below (D9–D14). Still owed to Daniel: the stranger walkthroughs (S3.5) and the signed-in onboarding
> smoke. The medusa-bonsai session check passed on 2026-09-24.

## Why

The landing is about to hand strangers a prompt that installs Golden Frijoles into their own agent. Today that prompt would
install ten skills that stop, because every skill runs scripts a stranger's repo doesn't have. It also installs under a name
that isn't the product's, from a public repo with no license, and with no releases to pin. After this epic, a stranger pastes
one prompt into an empty repo, in Claude Code or any agent `npx skills` supports, and plans their first idea. After wave 2 they
answer at most five questions to configure it and can change anything later with `gf config`.

## Platform-first note

Most of the rails exist. The public marketplace works today (`npx skills add danybgoode/dobby-foundation --list` lists all ten
skills). The skill list is generated, the script contract and its closure walk are checked in CI, the leak guard has fixtures,
the onboarding text is already one parity-checked surface with an isolated `--exec`, and `.skill` archives are reproducible.
**What's new is a package boundary:** the scripts leave the consuming repo for `@golden-frijoles/kit`. That's why the first
architecture decision is about roots, not about packaging.

## What already exists (reuse, don't rebuild)

- `.claude-plugin/marketplace.json`, `plugins/ways-of-work/` (to be renamed), `claude plugin validate` in CI
- `scripts/render-skill-adverts.mjs` (+ `--check`), which also stamps the kit version (S2.4)
- `scripts/check-skill-scripts.mjs`: the `requires_scripts` closure walk, retargeted at the built kit (S2.2)
- `scripts/check-plugin-leaks.mjs` + fixtures, extended for the rename (S1.3)
- `scripts/check-onboarding-parity.mjs` + `template/scripts/lib/golden-onboarding.mjs`: parity with an isolated `--exec` (S3.4)
- `scripts/pack-skills.mjs`: `.skill` archives for Cowork and the Claude app (unchanged, rebuilt at release)
- `template/Roadmap/`: the skeleton `gf-kit init` writes (S3.2)
- golden-beans: `lib/cli-install.ts` and `lib/landing-prompts.ts` (the one-module pattern), `CopyPromptCard`, `/install`, `/app/onboarding/[projectSlug]`, `packages/cli` (`doctor`, `init`, exit codes, golden help tests)
- LEARNINGS rules this epic leans on: *presence is not execution*, *construct the harmless state and assert it*, *could not look is its own exit code*, *run the consumer's OLD tests against the NEW code*, *rewrite, don't allowlist*

## Architecture lock: D1–D8, verified 2026-09-23 against live code and live state

*(Numbered for this epic. Not the same as the audit's D1–D8.)* **Builders cite these. They never re-derive or
paraphrase them.** Everything below was checked against `origin/main` `12fcc06`, golden-beans `4db2b73`,
medusa-bonsai `ccd5c3f`, GitHub, npm and the Claude Code and npm docs on the lock date. Each decision says where its
evidence came from. **Wave 1 only:** D9 and D10 stay as drafted under *Wave 2* below and are locked when wave 2 is bet.

### Live state the lock was taken against

| Fact | Value on 2026-09-23 | How it was checked |
|---|---|---|
| GitHub org `golden-frijoles` | **does not exist** (`gh api users/golden-frijoles` → 404); `golden-frijoles/skills` → 404 | `gh api` |
| `@golden-frijoles/kit` on npm | **never published** (E404) | `npm view` |
| npm scope `@golden-frijoles` | owned by `danybgoode`. `cli@0.1.0` and `sdk@0.5.0` were **published by hand**: no publish workflow exists in any repo | `npm view … maintainers`, golden-beans `.github/workflows/` |
| This machine's npm login | none (`npm whoami` → E401). No agent can publish from here | `npm whoami` |
| The kit's closure | **45 files** (the union of all ten skills' `requires_scripts`) | `parseRequiresScripts` over every SKILL.md |
| `npx skills` | `skills@1.7.0` lists all ten skills from `danybgoode/dobby-foundation` today | ran `npx -y skills add … --list` |
| Claude Code | `2.1.280` local, `2.1.278` pinned in CI | `claude --version`, `ci.yml` |
| golden-beans vs template (the 45 files) | 41 byte-identical, 4 differ: `roadmap-extract.mjs` (delegates to its Notion sync), `cross-panel.mjs` + `lib/cross-agent-cli.mjs` (the documented review-rail fork), `prose-lessons.md` (its own lessons) | `cmp` loop |
| medusa-bonsai vs template | 35 identical, 10 differ | `cmp` loop (medusa doesn't adopt the kit, so this is for the record only) |

### The decisions

- **D1: The kit is built, not committed.** *Confirmed.* `template/scripts/` stays the one source. `scripts/build-kit.mjs`
  copies the 45-file closure (plus `lib/project-root.mjs`, which D2 adds to every converted file's closure, and the S3.2
  skeleton) into `kit/dist/`. `kit/dist/` is **already gitignored** by the existing `dist/` line, so nothing new goes in
  `.gitignore`. Committed under `kit/`: `package.json`, `bin.mjs`, `README.md`, and nothing that is a copy.
- **D2: Three path classes, one module, and copied mode is byte-for-byte unchanged.** *Corrected: the draft had two
  roots and "14 sites".* The live count in the closure is **18 files that derive a root from their own location, plus
  5 hidden subprocess sites that a `__dirname` grep never finds**: `build-order-sync.mjs:68,73`, `pmo-report.mjs:66`,
  `standup.mjs:176,184`. Each spawns `node scripts/<x>.mjs` with `cwd` set to the project, so in installed mode it would
  run the *project's* copy, or fail. The closure also holds **four project-owned assets** that the draft counted as kit
  assets: `cross-panel.prompt.md` and `prose/cpo-persona.md` are `TEMPLATE FILL-IN`s, `prose-lessons.md` grows per
  project, and `doc-format.enforced.json` is per-project policy. So `template/scripts/lib/project-root.mjs` exports:
  - `kitRoot()`: the directory holding the script set. It's `dirname(this file)/..`, which is the project's `scripts/`
    in copied mode and `kit/dist/` when installed. **Kit assets** (`pmo/*`, `standup/templates/*`, `prose/*.task.md`,
    prompts that aren't fill-ins) and **sibling scripts a script spawns** resolve here. Spawns become
    `spawnSync(process.execPath, [join(kitRoot(), '<x>.mjs'), …], { cwd: projectRoot() })`.
  - `projectRoot()`: `GF_PROJECT_ROOT` if set; otherwise, **in copied mode, exactly today's `dirname(kitRoot())`**;
    otherwise (installed) walk up from `process.cwd()` to the nearest dir holding `Roadmap/` or `.git`, falling back to
    `cwd`. "Installed" = `join(kitRoot(), '..', 'package.json')` names `@golden-frijoles/kit`. **Why copied mode doesn't
    walk:** this repo's CI runs `node template/scripts/…` from the repo root, and consumers' tests pass explicit roots.
    Walking up from `cwd` would silently retarget both. One function, one branch on a detected fact. That's the "same
    code in both modes" D2 asked for.
  - `projectAsset(rel)`: `<projectRoot>/scripts/<rel>` if the file exists, else `<kitRoot>/<rel>`. Used for exactly the
    four project-owned assets above. In copied mode both paths are the same file.
  - `--root <dir>` is parsed **only by `kit/bin.mjs`**, which exports it as `GF_PROJECT_ROOT` and strips it. The
    scripts' own arg parsers never see a new flag.
- **D3: Local wins, per skill, and a run never mixes the two sets.** *Sharpened.* A skill runs `node scripts/<entry>.mjs`
  when the project has `scripts/<entry>.mjs`. Otherwise it runs `npx -y @golden-frijoles/kit@<stamped> <entry>`. The
  kit is self-contained: it **never** loads a `.mjs` from the project, only the four project-owned *assets* through
  `projectAsset()`. The consequence is that a deliberate fork only survives through its entry script. This decides S2.5
  (see its contract): a project deletes a copy only when that copy is byte-identical to the kit *and* nothing it keeps
  locally still reaches it.
- **D4: One version, in lockstep, and the version bump is the release.** *Confirmed, and its consequence locked.* The
  Claude Code docs say: *"Setting [`version`] pins the plugin to that version string, so users only receive updates
  when you bump it."* `plugin.json` wins over a marketplace-entry `version`. So from S1.5 on, **a change to anything a
  user receives that doesn't bump the version never reaches them.** "Anything a user receives" means `plugins/**`,
  `kit/**` and the 45 closure files, which is exactly what `check-release.mjs` guards. `plugin.json` `version` =
  `kit/package.json` `version` = newest `CHANGELOG.md` heading = the tag. The kit version stamped in each SKILL.md is
  rendered from `plugin.json` by `render-skill-adverts.mjs` and is never hand-typed. Users pin a release with the
  marketplace ref: `claude plugin marketplace add golden-frijoles/skills@v0.1.0` (docs: *"Git-based marketplace sources
  support `ref` (branch/tag)"*).
- **D5: A version bump merged to `main` publishes, and CI creates the tag.** *Deviation from the draft's "a pushed tag
  publishes".* Consumers and strangers track `main` (no ref). With D4, the version on `main` is live the moment it
  merges, and a tag pushed before a squash-merge can't point at the commit that ships. So `.github/workflows/release.yml`
  runs on push to `main`. If `v<version>` has no tag yet, it builds the kit, publishes it (OIDC trusted publishing,
  provenance, no token), checks `npm view @golden-frijoles/kit@<version>`, **then** creates the tag and GitHub Release
  from the CHANGELOG section. The tag is the record of a release. Nobody pushes it by hand. **npm facts (docs, checked
  on the lock date):** a trusted publisher can only be attached to a package that **already exists** (`npm trust` too:
  *"Package must exist"*). It needs npm ≥ 11.5.1 and Node ≥ 22.14 (CI runs Node 20, so the publish job pins 22). It
  needs `id-token: write`, and `repository.url` must **exactly** match the GitHub repo. So the attach can only happen
  after S1.2. **The bootstrap owed to Daniel is a `0.0.0` placeholder, not a real `0.1.0`** (a README-only package,
  then `npm deprecate`d). That way every real kit version carries provenance, and the lockstep numbering isn't broken
  by a hand-published release. Versions: S1 merge → `v0.1.0` (plugin only, since there's no kit yet), S2 → `v0.2.0`
  (first kit), S3 → `v0.3.0`. *(The draft said "release v0.2.0" after S3. One release per merged sprint is what D4
  makes true.)* **Window, stated:** between a merge and its publish (~1–2 min) a SKILL.md pins a kit version that isn't
  on npm yet. The D3 instruction reports that as *could not look* and names the local-copy escape hatch.
- **D6: Names.** *Confirmed, and one rename scope-limited.* Marketplace `golden-frijoles`; plugin dir
  `plugins/golden-frijoles/`; umbrella skill `golden-frijoles`; bin `gf-kit`; repo `golden-frijoles/skills`. **No
  alias** for `ways-of-work@dobby-foundation` (this overrides the audit's one-release alias, as the epic already
  decided). **"ways-of-work" is also the name of the process and of a past epic** (`ways-of-work-lean-pass`,
  `render-ways-of-working`). The rename touches **identifiers only**: `ways-of-work@…`, `plugins/ways-of-work`, "the
  `ways-of-work` plugin", "dobby-foundation marketplace", `danybgoode/dobby-foundation`. It doesn't touch epic slugs
  in provenance comments, and it doesn't touch the process name.
- **D7: The repo root stays zero-install.** *Confirmed.* No root `package.json`. `kit/package.json` has zero
  dependencies, and that's possible: **the closure has no bare-package import** (grepped). `live-smoke` already spawns
  `npx playwright` inside the project's own app dir, so it resolves the *user's* Playwright. The second-family CLIs
  (`codex`, `agy`, `vibe`) are spawned with a presence check that prints their install line
  (`lib/cross-agent-cli.mjs` `ensureCmd`). **The draft's rabbit hole "runtime deps the kit can't carry" doesn't exist
  for the kit.** Disproved, with nothing to build.
- **D8: Executing checks run in a constructed harmless state, and assert it.** *Confirmed and extended to Claude Code.*
  Same shape as `check-onboarding-parity.mjs --exec` (a blank `GOLDEN_FRIJOLES_TOKEN`, `HOME` and `XDG_CONFIG_HOME` at
  an empty temp dir, `unauthorized` *required*). The `claude plugin …` probe adds `CLAUDE_CONFIG_DIR` at the same temp
  dir. Its **negative control** hashes the real `~/.claude/plugins/installed_plugins.json` before and after and fails
  if it changed. A missing binary skips with a `::warning::` and never fails. Pinned: `skills@1.7.0`, Claude Code
  `2.1.278` (the CI pin).

### Deviations from the scaffolded docs, decided here

| # | The doc said | The live system says | Decided |
|---|---|---|---|
| X1 | "14 `__dirname` sites" (D2, S2.1) | 18 self-rooted files + 5 hidden subprocess sites + 4 project-owned assets | D2's three classes; the S2.1 contract lists every site |
| X2 | `projectRoot()` walks up from `cwd` | Walking up retargets this repo's CI and consumers' tests in copied mode | walk only when installed (D2) |
| X3 | "a pushed `v*` tag publishes" (D5, S2.3) | `version` gates updates; users track `main`; a pre-merge tag can't name the shipped commit | a bump merged to `main` publishes; CI tags (D5) |
| X4 | "first manual `0.1.0` publish" | Trusted publishing *requires* an existing package | the bootstrap is a deprecated `0.0.0` placeholder (D5) |
| X5 | "release `v0.2.0`" after S3 | One release per merged sprint (D4) | S1 `0.1.0`, S2 `0.2.0`, S3 `0.3.0` |
| X6 | S2.5: "`build-order-sync` and `standup` run through the kit" | golden-beans forks `roadmap-extract.mjs` and `cross-agent-cli.mjs`, and CI + `.githooks/pre-push` call `build-order.mjs` | the S2.5 deletion rule decides mechanically; the PR lists what moved and why the rest didn't |
| X7 | "runtime deps the kit can't carry (`@playwright/test` …)" | No bare import in the closure | disproved, nothing to build (D7) |
| X8 | S1.3 renames every `ways-of-work` | It's also the process name and a past epic's slug | identifiers only (D6) |
| X9 | S3.3: "state contract … updated, not bypassed" | `/install` is approved state `public-install`, hash-pinned in `APPROVED.md`; an onboarding state isn't among the 33 | measure `public-install`'s signature first; if it changes, the prototype edit needs a new approval line **owed to Daniel** |
| X10 | S3.4: "the plugin README" | There's no plugin README, only the repo README | the repo `README.md` is the surface |
| X11 | S1.4: medusa-bonsai + golden-beans, "the old entries removed" | Both consumers carry byte-shared rails that name the old identity (`doc-format.mjs`, `doc-hygiene.mjs`, the vendored `WAYS-OF-WORKING.template.md`) | the S1.4 PRs carry those byte copies too (shared-rails rule), plus `scripts/epic-dod.exemptions.json` |
| X12 | The audit's prompt: `npx skills add golden-frijoles/skills --skill golden-frijoles` | Measured with `skills@1.7.0`: that installs **only** the umbrella skill, so its first hand-off to `groom` dead-ends | the prompt says `--skill '*'` (every skill; the agent is still chosen interactively), on every surface, and parity proves it |
| X13 | S3.1: "detect the `npx skills` channel via `${CLAUDE_PLUGIN_ROOT}` unset" | Measured 2026-09-23: `$CLAUDE_PLUGIN_ROOT` is **not set** in a skill's shell at all, in either channel — it names nothing to branch on | detect the channel from where the skill was loaded from (its own base directory) instead: a plugin cache / `--plugin-dir` → Claude Code; `.agents/skills/`, `~/.claude/skills/` or a project's `./.claude/skills/` → `npx skills`; a URL → a raw read |
| X14 | S3.4: "`--exec` proves the install prompt against the published repo" | A required check that only goes green after the PR merges can never gate that same PR — checking `golden-frijoles/skills` pre-merge just fails the umbrella skill's own introduction, every time | `--exec` runs the prompt's commands against **this checkout** by default (the tree the PR actually ships), so the gate can go green pre-merge; `--live` switches the same probes to the published repo, for the post-merge verification the sprint walkthrough records |

### Model routing (auditable)

| Work | Model | Why |
|---|---|---|
| The lock, **S2** (roots, kit build, release/publish, the local-wins seam, the dogfood) | **Opus 5.5 (the orchestrator), built directly** | S2 defines the contract every later sprint imports: a package boundary, a publish rail and a cross-repo deletion |
| **S1** (license, rename, consumer switch, release check) | Sonnet 5 builder, in its own worktree | mechanical over D4/D6 |
| **S3** (umbrella skill, `gf-kit init`, the prompt module, parity `--exec`) | Sonnet 5 builder, in its own worktree | mechanical over D2/D3/D8 |
| Fresh reviewer on each PR | a fresh Opus 5.5 agent given `plugins/*/agents/pr-reviewer.md` | the plugin isn't loaded in this session (its cache is empty, see team memory), so its subagent type isn't available. Same prompt, fresh context |
| External general pass + security lens | `review-route.mjs` from `~/dobby/medusa-bonsai` with `--repo`, per team memory | this repo carries no review rail of its own |

Findings route back to the builder that wrote the code. The orchestrator verifies every builder's report by
re-deriving repo state (`git diff`, the gate) before trusting it.

### Owed to Daniel in wave 1, in the order they're reached

1. **S1.2**: create the `golden-frijoles` org and transfer + rename the repo. **Blocks the S1 merge** (S1.4's settings
   point at `golden-frijoles/skills`) and the S2.3 attach (`repository.url` must match).
2. **S2.3**: the `0.0.0` bootstrap publish, `npm deprecate` it, attach the trusted publisher. Before the S2 merge.
3. **S1.4**: the medusa-bonsai session check, after the rename merges.
4. **S3.3**: the signed-in onboarding smoke, and the `public-install` approval line **if** X9's measurement shows a
   structural change.
5. **S3.5**: both stranger walkthroughs.

## Build contracts (locked by the architect before the builder started)

The full per-sprint contract lives in each sprint file under **"Build contract (locked by the architect before the
builder started)"**. It cites D1–D8 above and restates none of them.

## Wave 2 lock: D9–D14, verified 2026-09-24 against live code

Bet on 2026-09-24 ([`bets/wave-2026-09-24.md`](../../bets/wave-2026-09-24.md)). Checked against golden-frijoles/skills
`e129433`, golden-beans `d32fde9`, medusa-bonsai `5394a96`, and `@golden-frijoles/cli@0.1.0` / kit `0.3.0` on npm.
**Builders cite these, and never restate them.**

### Live state the lock was taken against

| Fact | Value on 2026-09-24 |
|---|---|
| Legacy config files | `jev.config.json` (template, gb, medusa) · `reporting.config.json` (gb, medusa) · `live-smoke.config.json` (gb) · `smoke-triage.config.json` (medusa) · `perf-probe.config.json` (medusa) · `scripts/review-config.json` (all three) · `Roadmap/fill-ins.yml` (all three) |
| Their parsers | Each rail already validates its own shape and throws its own error: `parseJevConfig` / `JevConfigError`, `loadReportingConfig` / `ReportingConfigError`, live-smoke `validateConfig`, `loadPolicy`, `loadProbeConfig`, `parseReviewConfig`, `parseFillIns` |
| Consumer forks | medusa forks `lib/reporting-config.mjs`, `live-smoke.mjs`, `roadmap-extract.mjs` and the review rail; golden-beans forks the review rail and `roadmap-extract.mjs` (wave-1 `cmp`) |
| The kit | 15 entry scripts. The review rails (`review-route`, `cross-review`), `smoke-triage-scope`, `perf-probe` and `render-ways-of-working` are **not** in it; they're project-local |
| The CLI | `packages/cli` in golden-beans: TypeScript compiled to **CommonJS**, depends on `@golden-frijoles/sdk`, `EXIT` codes 0–6, `doctor` reports every check and exits non-zero on the first failing one, golden help files in `src/__golden__/`. **Published by hand** (0.1.0); no publish workflow |
| Template Jev | `egress: true`, both rails `mode: jev`: a spawned project that gains a `TYPESAFE_API_KEY` starts sending text to TypeSafe without ever being asked |

### The decisions

- **D9: Config precedence, with validation left where it lives.** `golden-frijoles.config.json` sits at `projectRoot()`
  (D2). `template/scripts/lib/config.mjs` resolves **where each section comes from**, and nothing else:
  - The new file's section wins **per top-level key**. The legacy file fills the keys the new file doesn't set.
  - A key set in both is reported as a *duplicate* (a warning, never a failure).
  - The merged raw object goes to **the rail's existing parser**, which stays the one place its shape is validated
    ("import the shipped rule, never restate it").
  - A present but malformed file is a **configuration** failure: it throws a `ConfigError` naming the file. An
    absent file is a silent fallback. A section whose rail forbids secrets (all of them) rejects any key whose
    *value* looks like a secret: only env var **names** are allowed.
- **D10: One config core, two front ends.**
  - The kit's `gf-kit config list|get|set|migrate` (`template/scripts/config.mjs`) and the CLI's
    `gf setup` / `gf config` both call `lib/config.mjs`. Neither re-implements precedence.
  - The kit gains `"exports": { "./config": "./dist/lib/config.mjs", "./package.json": "./package.json" }` and a
    hand-written `lib/config.d.mts`.
  - The CLI (CommonJS) loads it with **`await import('@golden-frijoles/kit/config')`** and depends on
    `@golden-frijoles/kit` at the exact wave-2 release version.
- **D11: "Ask once" is a protocol between a script and an agent, not a prompt inside a script.** Scripts never read
  stdin.
  - A script that needs an unset registered setting prints one line to stderr,
    `GF-NEEDS-SETTING {"key":…,"question":…,"default":…}`, and exits **7** (new; it doesn't clash with the CLI's
    0–6).
  - The generated run rule (render-skill-adverts) tells the agent to ask that question once, write the answer with
    `gf-kit config set <key> <value>`, say *"change this later with `gf config set <key>`"*, and re-run.
  - The registry is `lib/config-registry.mjs`: `{ key, section, askWhen, default, question, secret? }`, the audit
    §4.3 table in code. `doctor` (D13) reads it too.
- **D12: Jev egress is a tri-state, and "unanswered" behaves as no.**
  - `jev.egress` ∈ `true | false | null`. The template ships `null`. `null` and `false` never send. `null`
    additionally emits the D11 ask on the first run that would have used Jev.
  - The fallback reason names it: `jev could not look (egress not answered)`.
  - Consumers keep their committed `egress: true`, and `jev-eval` (recorded replays) is unaffected.
- **D13: Doctor's module lines are information, not failure.**
  - `gf doctor` gains one line per module (Plan, Build, Ship, Measure, Spend, Operate), each **configured / not
    configured / could not look**, with the fix command beside anything not configured. The states are derived
    from the registry plus a presence check.
  - Doctor's exit code stays governed by its existing checks only: an unconfigured module is not a broken tool.
- **D14: A CLI release is a hand publish, owed.** S5.2 ships only when `@golden-frijoles/cli` is republished. It has no
  workflow, and adding trusted publishing to golden-beans is a new external setup: the owner's call, asked when S5
  reaches it. Until then S5.2 is merged, not shipped.

### Deviations from the scaffolded docs, decided here

| # | The doc said | The live system says | Decided |
|---|---|---|---|
| X15 | S4.1: `ways` section replaces `Roadmap/fill-ins.yml` | The fill-ins are pages of Markdown prose; as JSON strings they'd make the one file *less* readable, and `render-ways-of-working` is a byte-shared rail | `ways.fillIns` is a **path** (default `Roadmap/fill-ins.yml`). The file stays the prose's home |
| X16 | S4.2: "no rail parses a config file itself", in every repo | Consumers run **forked** review, reporting and live-smoke rails, which will keep reading their legacy files | The guard and conversion apply to the **template/kit**. Consumers keep legacy files: that's D9's fallback working as designed, and it's stated in each consumer's `scripts/README.md` |
| X17 | S5.5: `gf config set review.scope every-pr` changes the next PR's routing | The review rails aren't in the kit, so a kit-only stranger has no routing to change | The walkthrough adjusts a setting a stranger's kit **reads** (`jev.egress`) and checks the next run honours it; the review-scope version runs in a template-spawned repo |
| X18 | S5.1: five questions, Q3 board sink + Q5 proof depth | Board sinks and the Verify module are epic **no-gos**, so nothing would read those answers | Setup asks **Q1 mode, Q2 start point, Q4 account** (still "at most five, only Q1 required"). Q3/Q5 stay in the registry as `askWhen: 'never-yet'` so the schema is ready |
| X19 | S4.3: "a skill asks one question" | Scripts run non-interactively under an agent | D11's `GF-NEEDS-SETTING` + exit 7 protocol |
| X20 | (not in the docs) | Review of medusa#195: `projectAsset()` follows a symlink out of the project; `loadPersonaAndTask(scriptsDir)` ignores an explicit `scriptsDir` | Fixed in S4.1 (same seam), shipped in the wave-2 kit release, copied into both consumers |

### Model routing, wave 2

| Work | Model | Why |
|---|---|---|
| **S4** (the config core, precedence, the ask protocol, the rail conversions, X20) | **Opus 5.5, the orchestrator, built directly** | It defines the contract S5's CLI imports, and it touches every rail |
| **S5** (setup, `gf config`/`gf setup`/doctor in the CLI, the Jev egress default) | Sonnet 5 builder in its own worktrees | mechanical over D9–D14 |
| Fresh reviewer, each PR | a fresh Opus agent + `pr-reviewer.md` | as in wave 1 |

### Owed to Daniel in wave 2

1. **S5.2/D14**: republishing `@golden-frijoles/cli` (asked when S5 reaches it).
2. **S5.5**: stranger walkthrough #2 on a clean machine.
3. Still from wave 1: **S3.5**, both stranger walkthroughs.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 · Identity, license, releases | S1.1 License the public repo | low |
| 1 · Identity, license, releases | S1.2 Create the org and transfer the repo (owed to Daniel) | high |
| 1 · Identity, license, releases | S1.3 Rename the marketplace and plugin to golden-frijoles | high |
| 1 · Identity, license, releases | S1.4 Switch both consumers in the same sprint | high |
| 1 · Identity, license, releases | S1.5 Tagged releases a user can pin | low |
| 2 · The kit | S2.1 Two roots: the project and the kit | high |
| 2 · The kit | S2.2 Build the kit from the skills' closure | high |
| 2 · The kit | S2.3 Tag publishes the kit with provenance | high |
| 2 · The kit | S2.4 Skills run the kit unless the project has its own copy | high |
| 2 · The kit | S2.5 golden-beans runs on the kit (the dogfood) | high |
| 3 · The front door | S3.1 The golden-frijoles umbrella skill | low |
| 3 · The front door | S3.2 Adopt any repo: `gf-kit init` | low |
| 3 · The front door | S3.3 The install prompt as one module on three surfaces | low |
| 3 · The front door | S3.4 The prompt is checked by running it | low |
| 3 · The front door | S3.5 The two stranger walkthroughs | low |
| 4 · One config file | S4.1 One config file and one loader | high |
| 4 · One config file | S4.2 Every rail reads through the loader | high |
| 4 · One config file | S4.3 Ask once, just in time | low |
| 5 · Setup and adjust | S5.1 Five skippable setup questions | low |
| 5 · Setup and adjust | S5.2 `gf setup` and `gf config` | high |
| 5 · Setup and adjust | S5.3 Doctor names every module's state | low |
| 5 · Setup and adjust | S5.4 Jev egress is the user's explicit choice | high |
| 5 · Setup and adjust | S5.5 Stranger walkthrough #2: set up, then adjust | low |

**No-gos:** Think skills (Seed 5), board sinks, FinOps and Verify are out. There's no alias for the old plugin id. medusa-bonsai
doesn't adopt the kit (only its settings change). CI-guard scripts stay copy-once. The kit sends no telemetry. The engine is
unchanged beyond the install-prompt module/pages and the CLI's `setup` / `config` / `doctor`.

## Deploy order

1. **S1.2** org + transfer (Daniel) must be done first. Then the S1 PR (S1.1, S1.3, S1.5) merges, and the release workflow creates `v0.1.0` (D5). **Within minutes, the two S1.4 consumer PRs merge.** Between those merges, a consumer that still names `ways-of-work@dobby-foundation` resolves nothing, so the gap stays short on purpose.
2. **S2.3's bootstrap** (Daniel: a `0.0.0` placeholder, deprecated, plus the trusted-publisher attach) → the S2 PR merges → the release workflow publishes kit `0.2.0` with provenance and tags `v0.2.0` → **S2.5** golden-beans PR (it may only pin a published version).
3. **S3.1–S3.4** in any order → the S3 PR merges → `v0.3.0` → the golden-beans S3.3 PR → **S3.5** walkthroughs (Daniel) → **wave boundary: re-bet wave 2.**
4. **S4.1 → S4.2 → S4.3**, then **S5.1–S5.4**, then **S5.5** → release.

Rollback at every step comes from the release rails: `git revert` plus a version bump (a revert that doesn't bump
never reaches anyone, per D4), pin a previous release with the marketplace ref (`golden-frijoles/skills@v0.1.0`),
deprecate a bad npm version, `git revert` the landing card. The repo transfer is reversible.

## Kill-switch (Stage 6b)

**Carve-out: no runtime seam.** This is distribution, not a code path in a running app. Rollback is the pinned previous release
(D4), and the build-view kill-switch (`hooks.json`) is untouched. The landing card is copy, removed by `git revert`.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated; `node scripts/owed-ledger.mjs` counts what's still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] The kit is published with provenance, the plugin is tagged, and the CHANGELOG is current
- [ ] Both stranger walkthroughs passed (S3.5, S5.5), run by Daniel on a clean machine
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated, including the new name, license and install line
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] Kill-switch: carve-out recorded above (none planned)
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (then run `node scripts/build-order.mjs`)
