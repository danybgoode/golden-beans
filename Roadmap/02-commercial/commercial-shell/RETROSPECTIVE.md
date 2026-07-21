# Commercial shell — Golden Beans landing, waitlist, connector install page — Retrospective

_Written: 2026-07-20. Epic status: **shipped** — all three sprints live in production; Story 3.3
(the launch) executed 2026-07-20 with Daniel's explicit authorization and live per-action approval.
The read-only MCP connector is now enabled in production. Domain stays on `golden-beans-gamma.vercel.app`
for v1._

## What shipped
- **Sprint 1** (PR #8, `d3b19ed`): the public landing shell + brand v1, a live-proof section
  reading a synthetic demo project, a rate-limited/honeypot waitlist, and the landing-sections.ts
  backfill registry.
- **Sprint 2** (PR #9, `b475a90`): a real, tokenized, read-only MCP connector
  (`@modelcontextprotocol/sdk`-based) shipped dark behind `CONNECTOR_ENABLED`, the `/install` page,
  and a design-direction polish pass.
- **Sprint 3, Stories 3.1–3.2** (PR #11, `7b24502`): the landing now dogfoods the engine as a THIRD
  tenant (`golden-beans`, separate from the demo and Miyagi) — a real visitor→waitlist funnel
  through the actual `@golden-beans/sdk`, with a `waitlist_conversion` Grower signal registered via
  the real feature-sync API. Real OG/Twitter cards (generated via `next/og`) and an `llms.txt`
  manifest at `GET /llms.txt` for agent-readable discovery.
- **Sprint 3, Story 3.3** (launch, 2026-07-20): executed with Daniel's explicit authorization and
  live per-action approval — self-tenant `golden-beans` project + `waitlist_conversion` Grower
  signal seeded in prod, demo `connector_tokens` row minted, `SELF_PROJECT_API_KEY` set in Vercel,
  and `CONNECTOR_ENABLED` flipped ON (activated by a push-to-`main` deploy, since env-var changes
  don't apply to already-running functions). Domain: staying on `golden-beans-gamma.vercel.app` for
  v1. Announce: owner-owned.

## What went well
- **The cross-agent review process change (this sprint's experiment) worked, and caught real bugs
  a same-family reviewer might have missed.** Running Codex + Agy (Antigravity) as the judgment-layer
  review — replacing a same-family Claude subagent reviewer — surfaced three genuine, non-trivial
  correctness issues in Story 3.1 across two rounds: a seed script that silently rotated a
  production API key hash on every bare re-run, two routes that inline-`await`ed a real network
  call (blocking the response and, for one route, delaying a Set-Cookie behind it), and a missing
  rate limit on an otherwise-unprotected public write route. All three were fixed pre-merge.
- **Actually running the fix, not just reading the diff, caught what review alone couldn't.** The
  round-2 fix (moving tracking to `next/server`'s `after()`) introduced a NEW, more subtle race
  (client cookie timing) that Codex caught on a second pass — and then CI's own `e2e` run caught a
  completely different bug neither review round found: a workflow-ordering bug where
  `SELF_PROJECT_API_KEY` was exported to `$GITHUB_ENV` one step too late for the already-running
  server process to see it, so the isolation spec failed with a genuine `0/2 events`, not a race.
  Static review (by any model) could not have found this — only executing the actual workflow did.
- **Complexity-based model routing worked as intended.** Story 3.1 (dogfood instrumentation — the
  one with real event-tracking correctness stakes, per `LEARNINGS.md`'s existing "Review quality"
  entry) went to Opus; Story 3.2 (SEO/OG + manifest — mechanical) went to Sonnet; the orchestrating
  session stayed on Sonnet throughout. Both builders worked in isolated git worktrees in parallel
  with no merge conflicts, including on two files both touched (`sprint-3.md`,
  `BUILD-ORDER.md`) — the isolated-worktree-per-agent pattern held up.
- **The pre-authorized-merge experiment worked cleanly for LOW-risk stories.** 3.1/3.2 merged on
  green CI + a clean cross-agent review with no per-story check-in — the intended experiment.
  Story 3.3 stayed correctly gated (its own epic docs hardcode "Daniel merges/flips") and, when the
  time came, executed cleanly *with* Daniel present — he authorized it explicitly and left auto
  mode so each prod write surfaced as a live approve-prompt.

## What we learned
*(Durable items promoted to `Roadmap/LEARNINGS.md` — see that file for the full text; one-liners
here for this epic's own record.)*
- Cross-agent review (two different non-Claude families, single-pass each) can replace a
  same-family fresh-reviewer pass, not just supplement it — see LEARNINGS "Review quality."
- `next/server`'s `after()` correctly decouples a route's response from a background task, but
  doing so can surface a LATENT identity/ordering race that inline-`await`ing had been
  accidentally masking — moving work off the response path needs its own race analysis, not just a
  "no longer blocks" check.
- A workflow's env var exported via `$GITHUB_ENV` only reaches steps AFTER that point — never an
  already-forked background process from an earlier step. Generate/export anything a
  long-running background process needs BEFORE starting it, not after.
- GitHub Actions minutes are a shared, cyclical, account-wide constraint (recurring monthly, not a
  one-time incident) — see the team-memory note saved this session.
- **The auto-mode-classifier trap (the session's biggest time-sink).** Closing this epic burned a
  lot of effort on a wrongly-diagnosed wall. Fact pattern: in **auto mode**, the classifier lets
  READS through and blocks production WRITES and shell CREDENTIAL-handling — that's the whole rule.
  It is NOT a hidden `hard_deny` rule, not `.env.local`, not a key-format issue, not per-project.
  We (and a spawned Opus planning agent) built an elaborate "credential-minting is an intent-proof
  hard security boundary" theory on top of a handful of blocks — then an `ls`-shaped and a
  read-`select` command passing, versus an `insert`/`node -e` keygen blocking, exposed the real
  read-vs-write split. The unlock was mundane: **leave auto mode** (prod writes then surface as
  normal approve-prompts) and **do all prod DB work through the already-logged-in `supabase db
  query --linked`** (no `service_role` key in the shell) with **credentials generated inside the SQL
  query** (pgcrypto `digest`, `gen_random_uuid`) so no key material ever touches a shell command.
  Lesson promoted to `LEARNINGS.md`. Don't theorize a security-philosophy wall from a few blocks —
  probe the read/write boundary empirically first.

## Gaps / follow-ups
- **Story 3.3 is done** (2026-07-20) — nothing owed here anymore. The one remaining *confirmation*
  is Daniel's own browser/session smoke of the live connector round-trip (deep-link → add → query →
  revoke → confirm dead) once the flip-activating deploy lands; an automated smoke can't drive
  Claude's own UI. Post-deploy the API-level "route is live, not 404" check is done by this session.
- **Cross-agent review's Agy path is currently pinned to a fallback model** (`GPT-OSS 120B
  (Medium)`) because the primary (`Gemini 3.1 Pro (High)`) hit an account-level quota exhausted
  for ~73h from this session's very first run. Re-verify `agy models`/quota before assuming the
  documented default model is what actually ran on a future PR.
- The live browser/session smokes owed to Daniel per Sprint 2/3's QA sections (the connector
  round-trip, the "paste into a chat app" unfurl check) are still outstanding — unchanged by this
  session, tracked in their respective sprint docs.
