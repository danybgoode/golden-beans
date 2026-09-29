---
epic: distribute-what-we-use
sprint: 3
title: "Jev and notify, set up rather than documented"
risk: high
phase: Building
stories_total: 3
stories:
  - id: S3.1
    title: "Bug: unanswered egress asks with no `jev.config.json`"
    as_a: "a stranger with no Jev config"
    i_want: "the first guarded run to ask whether my text may go to TypeSafe"
    so_that: "the D12 promise (\"ask, never silently off\") holds for the user it was written for"
    risk: high
    status: planned
  - id: S3.2
    title: "Jev setup route"
    as_a: "a stranger who said yes to egress"
    i_want: "a guided route: what leaves the machine (one sentence), the TypeSafe signup link, the key into `.env.local`, a 10-fixture `jev-eval --live` as proof, then the `jev` config section"
    so_that: "I end with a working key, proven on real fixtures"
    risk: low
    status: planned
  - id: S3.3
    title: "Notify setup route"
    as_a: "a stranger who wants the merge report"
    i_want: "guided Telegram setup (BotFather, chat id via `getUpdates`, a test send) and a working Slack webhook sender"
    so_that: "\"Operate\" is configured, not documented"
    risk: low
    status: planned
---
# Distribute what we use — one review rail, Jev and notify setup, schedulers, build view — Sprint 3: Jev and notify, set up rather than documented

**Status:** 🟦 In review

## Stories

### Story 3.1 — Bug: unanswered egress asks with no `jev.config.json`
**As** a stranger with no Jev config, **I want** the first guarded run to ask whether my text may go to TypeSafe, **so that** the D12 promise ("ask, never silently off") holds for the user it was written for.
**Acceptance:** **Reproduction:** in a repo with no `jev.config.json`, run a guarded rail → `effectiveMode()` returns `configured off` at `lib/jev.mjs:186` before the `egress === null` branch, so `needSetting('jev.egress')` never fires. **Fix:** an unanswered egress surfaces the ask regardless of the default mode; nothing is sent before `egress: true`. A regression spec was observed failing on today's code first.
**Risk:** high

### Story 3.2 — Jev setup route
**As** a stranger who said yes to egress, **I want** a guided route: what leaves the machine (one sentence), the TypeSafe signup link, the key into `.env.local`, a 10-fixture `jev-eval --live` as proof, then the `jev` config section, **so that** I end with a working key, proven on real fixtures.
**Acceptance:** The umbrella skill carries the route. `jev-eval --live` on 10 fixtures passes with a real key and fails clearly without one. `gf doctor` shows `jev.egress` configured afterwards.
**Risk:** low

### Story 3.3 — Notify setup route
**As** a stranger who wants the merge report, **I want** guided Telegram setup (BotFather, chat id via `getUpdates`, a test send) and a working Slack webhook sender, **so that** "Operate" is configured, not documented.
**Acceptance:** `reporting.config.example.json` is in the kit. The route says `getUpdates` is empty while a webhook is set, and names group privacy mode. `slack-notify.mjs` + `lib/slack-text.mjs` move into the template with their tests (or setup stops offering Slack). A test send reaches a fresh bot. *(Slack half: cut line, third to go.)*
**Risk:** low

## Build contract (locked by the architect before the builder started)
Builds **D7, D8** and deviation 5 (README → *Architecture lock*).
- **3.1 (Claude):** the loader-level fix (D7). Specs cover four cases: no config → the ask fires, `mode:'off'`,
  nothing sent; `egress:null` + rail `off` → the ask fires; `egress:false` → no ask, nothing sent; `egress:true`
  + key + `jev` → sends. The fetch is spied, so "nothing sent" is asserted, not assumed. Each spec is observed
  failing on today's code first. `jev.mjs` stays byte-equal in both trees.
- **3.2 (Codex):** a `## Jev setup` route in the umbrella skill (`golden-frijoles/SKILL.md`, within its line
  budget; a linked reference file if it would overflow). The route runs in order: one sentence on what leaves
  the machine, the TypeSafe signup link, the key into `.env.local`, `jev-eval --live --limit 10` as proof, then
  `config set jev.egress true` and the rail modes. `jev-eval --live` without a key exits non-zero with one clear
  line. A `--limit` flag is added if it is missing.
- **3.3 (Codex):** a `## Notify setup` route: BotFather, a first message to the bot, the chat id via
  `getUpdates` (empty while a webhook is set, `deleteWebhook` names the fix), group privacy mode, then a test
  send through the kit (`telegram-notify` or the report sender's `--test`). `reporting.config.example.json` goes
  into the kit closure. `slack-notify.mjs` + `lib/slack-text.mjs` + tests move to the template byte-equal. The
  registry question for `reporting.destination` is reworded so it offers only what a sender exists for
  (deviation 5).
- **Release:** one plugin/kit bump (D9).

## Build notes

- **3.1 (Claude).** Two bugs, as the lock found (D7): no config at all loaded as `egress: true`, and `effectiveMode`
  returned `configured off` before looking at egress. The fix is at the loader and in the ordering. The four specs
  were observed failing on the old code (3 red; the `egress:false` guard green as it should be). Both consumers set
  `egress: true` explicitly, so neither changes.
- **3.2 / 3.3 (Claude subagent, Sonnet).** Two facts reshaped the route:
  - `jev-eval --live` refuses until egress is `true`, so the route records the yes first.
  - `--live` re-records the committed fixtures, so the proof is `--live --limit 10`, which writes nothing.
  `notify-setup.mjs` makes the chat-id step executable and tells a set webhook from an unmessaged bot. The kit cannot
  carry `reporting.config.example.json` (it copies only `requires_scripts` and the Roadmap skeleton), so the route
  gives the one-line config instead. Every new spec was observed red by mutation.
- **Release 0.8.0.**

## Sprint QA
- 3.1: regression spec in `skills/template/scripts/lib/jev.test.mjs` (or alongside), observed failing on `main` first.
- 3.2/3.3: `node --test` for the routes' helpers; `slack-text` tests move with the sender.
- Owed to Daniel: a Telegram test send from his own bot (a third party we can't automate).
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

1. In a fresh repo with the plugin and no `jev.config.json`, run the prose guard the way the kickoff does.
   → it asks whether text may be sent to TypeSafe, instead of saying nothing.
2. Answer yes, follow the Jev route, and sign up at https://docs.typesafe.ai.
   → the 10-fixture live eval prints a pass.
3. Create a bot with https://t.me/BotFather, message it once, and follow the notify route.
   → the test message arrives in your Telegram.
4. Run `gf doctor`.
   → the Operate line no longer lists `reporting.destination` as missing (README deviation 5).

If any step fails, note the step number + what you saw — that's the bug report.
