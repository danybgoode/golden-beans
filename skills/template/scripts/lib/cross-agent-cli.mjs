// cross-agent-cli.mjs — the shared CLI plumbing for the cross-agent second-opinion tools.
//
// One source of truth for driving a DIFFERENT model family's CLI, reused by both:
//   • scripts/cross-review.mjs  — advisory second opinion on a PR diff
//   • scripts/cross-panel.mjs   — advisory second opinion on a proposed plan (a scope/seed doc)
//
// It holds only the family-agnostic mechanics: presence/version checks, the per-CLI context-passing quirks
// (each CLI takes its context differently — see the table below), and the shared-prompt loader. The
// *framing* of the context (a PR diff vs a plan doc) and the output handling (post a PR comment vs print a
// panel) stay in each consuming script. Zero npm deps — Node 18+.
//
// ── The reviewer roster, and how each one takes its context ──────────────────────────────────────────────
// FOUR families are wired here. They are all different from each other, which is the entire point: a
// second family re-derives the diff and catches what the builder's context-bias hides.
//
//   | --agent       | CLI      | Family            | Context passing                      | Read-only by     |
//   |---------------|----------|-------------------|--------------------------------------|------------------|
//   | codex         | `codex`  | GPT (OpenAI)      | stdin (`codex exec <prompt>`)        | no repo writes   |
//   | antigravity   | `agy`    | Gemini → GPT-OSS  | argv `-p` (256 KB cap; stdin at EOF) | print mode       |
//   | vibe          | `vibe`   | Mistral           | argv `--prompt` (256 KB cap)         | `--agent plan`   |
//   | claude        | `claude` | Anthropic         | stdin (`claude -p <prompt>`)         | `--tools ""`     |
//
// **`claude` is here so that a NON-Claude orchestrator can use it.** When Codex or Antigravity is driving
// a build, "run a cross-family review" previously meant reaching for a Claude *subagent*, which only a
// Claude host can spawn. Exposing Claude Code as a plain CLI reviewer on this table makes the review layer
// symmetric: any orchestrator, from any family, can route to any other family through one script. The
// routing policy itself (who reviews whom, and how many) lives in `scripts/review-route.mjs`, not here —
// this module only knows how to *drive* each CLI.
//
// ── Codex → Antigravity auto-fallback ───────────────────────────────────────────────────────────────────
//
// When the local Codex token has lapsed, `codex exec` exits non-zero with an AUTH error on stderr (e.g.
// "Your session has ended. Please log in again." / "refresh token was revoked" / 401). `runWithCodexFallback`
// detects that specific auth signal (NOT every error — a non-auth break or an empty diff still fails clearly)
// and retries once with Antigravity, returning `{ fellBack: true, from: 'codex', to: 'antigravity' }` so the
// caller can label the output. The trigger lives in the pure, testable `decideCodexFallback`; restoring Codex
// is `codex login` (see scripts/README.md → "Restoring a lapsed Codex token").

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// label per agent. Drives both the CLI dispatch and the human-readable header.
export const AGENTS = {
  codex: 'Codex',
  antigravity: 'Antigravity',
  vibe: 'Mistral Vibe',
  claude: 'Claude Code',
};

// The binary each --agent value dispatches to. Kept beside AGENTS so a presence check
// (`hasCmd(AGENT_BIN[agent])`) never has to re-derive the mapping — `antigravity` → `agy` is the one
// place where the flag value and the executable name genuinely differ.
export const AGENT_BIN = { codex: 'codex', antigravity: 'agy', vibe: 'vibe', claude: 'claude' };

// Antigravity's headless CLI is new and its print contract shifts between releases — pin the known-good
// version and FAIL LOUD on a mismatch (checkAgyVersion). 1.0.7→1.0.10 silently changed `--print` so it
// emits NOTHING without an explicit --model, which a soft warn let ship as empty reviews; a hard fail forces
// a human to re-verify the invocation below and bump this deliberately. Bumping = re-test runAntigravity().
//
// Re-verified 2026-07-03 against 1.0.16 (jump from 1.0.10; changelogs 1.0.11-1.0.16 show no print/--model
// changes): `agy -p "<prompt>" --model "<valid model>"` still exits 0 with real stdout — the exact call
// runAntigravity makes. One thing DID get more lenient: omitting --model, or passing an unrecognized model
// name, no longer prints nothing — agy now silently substitutes a default model and still returns output.
// Harmless here since AGY_MODEL/AGY_FALLBACK_MODEL below are always valid, listed model names (checked via
// `agy models`), but it means a future typo in either constant would silently review with the WRONG model
// instead of failing loud — watch for that if either constant is ever edited.
// agy-doctor: last verified 2026-09-17 against 1.2.5.
//   ^ machine-managed marker — `node scripts/agy-doctor.mjs --fix` rewrites it (with the constant
//   below) after a green live contract probe. Don't hand-edit the marker's shape.
export const AGY_PINNED = '1.2.5';

// agy's `--print` mode prints NOTHING unless `--model` names a model — and, crucially, it ALSO prints
// nothing (exit 0, empty stdout — the error lands only in agy's log, see --log-file) when the model is
// quota-exhausted or unreachable. Gemini is the ideal reviewer (a different family from BOTH the Claude host
// and the GPT-family codex), so it's the default — but its per-subscription quota is tight and exhausts
// ("RESOURCE_EXHAUSTED 429: Individual quota reached"), so runAntigravity AUTO-FALLS-BACK to
// AGY_FALLBACK_MODEL (GPT-OSS, a separate quota pool that worked on the dev machine) when the primary yields
// empty. Override either via env.
// Roster note (probed, never assumed — `agy models`): 1.2.x takes SLUGS, not display names, and generation
// and TIER are independent. 3.6 is the newest generation but ships FLASH-only (`gemini-3.6-pro-high` does
// not exist); the previous `gemini-3.1-pro-high` was the only PRO-tier Gemini, so this is a generation
// upgrade and a tier downgrade at once — kept under review against real diffs, not settled by the number.
export const AGY_MODEL = process.env.AGY_MODEL || 'gemini-3.6-flash-high';
// Deliberately a DIFFERENT PROVIDER POOL, not merely a different model: the fallback exists so a spent
// Google quota still leaves a cross-family pass alive. A second `gemini-*` here would share the pool it is
// supposed to survive.
export const AGY_FALLBACK_MODEL = process.env.AGY_FALLBACK_MODEL || 'gpt-oss-120b-medium';

// agy takes the prompt+context as a single `-p` argv string (stdin is not the prompt). Guard well under the
// OS limit (macOS ARG_MAX is 1 MB incl. env) so a huge input fails clearly instead of an opaque E2BIG.
export const AGY_ARG_LIMIT = 256 * 1024;

// ── Mistral Vibe (`vibe`) ────────────────────────────────────────────────────────────────────────────────
// Vibe's non-interactive path is `--prompt` ("programmatic mode"): it skips the Textual chat UI, disables
// interactive tools, and exits when done. Three flags matter for a reviewer and each is deliberate:
//
//   --agent plan   Vibe ships several approval agents (default · plan · accept-edits · auto-approve) and
//                  programmatic mode DEFAULTS TO `auto-approve` — i.e. a reviewer that could silently edit
//                  the working tree. `plan` is the read-only one. This is not a nicety: an advisory review
//                  that mutates the repo it is reviewing is the exact failure the "advisory only" contract
//                  exists to prevent, so the flag is passed unconditionally and is not overridable by env.
//   --max-turns    Vibe's own docs recommend bounding run length. A single-pass review needs very few.
//   --output text  json/streaming are for structured consumers; we want the prose findings on stdout.
//   --trust        Programmatic mode still ENFORCES folder trust but cannot show the confirmation prompt,
//                  so an untrusted directory would otherwise stall or refuse. `--trust` grants trust for
//                  this invocation only (it does not write ~/.vibe/trusted_folders.toml).
//
// ⚠ CONTRACT NOT YET PROBED AGAINST A LIVE BINARY. Everything above comes from Mistral's published CLI
// docs, not from a run on this machine — and this repo's own rule is that a roster is PROBED, never
// assumed (a CLI that self-reports a capability it does not have has burned us before; see the agy
// version pin above, where a silent `--print` contract change shipped empty reviews for weeks). Before
// relying on vibe in a real review, run the probe once and record the result here:
//
//   node scripts/cross-review.mjs <PR#> --agent vibe --dry-run
//
// A green probe prints real findings. An EMPTY result is a FAILURE, not a pass — see runVibe below, which
// treats empty stdout as an error exactly like the agy path does, for the same reason (a quota-capped or
// misconfigured CLI can exit 0 with nothing).
// vibe-probe: NOT YET VERIFIED — replace this line with `vibe-probe: verified <date> against <version>`.
//
// `vibe-acp` is the WRONG entry point for this use case and is deliberately not wired: it starts a
// JSON-RPC server that speaks the Agent Client Protocol over stdio for IDE extensions (Zed et al.). It
// expects a long-lived client session, not a one-shot prompt, so a script would have to implement an ACP
// client to get a single review out of it. `vibe --prompt` is the scripting/CI path, and it is the one
// Mistral documents for exactly this.
export const VIBE_ARG_LIMIT = 256 * 1024;
// Four turns was a truncation generator once denied reads consumed the budget; the origin project's live
// probes settled on 24 as the bounded floor. VIBE_MAX_TURNS stays an explicit operator override.
export const VIBE_MAX_TURNS = process.env.VIBE_MAX_TURNS || '24';
// Optional: pin a model with `VIBE_MODEL`. Left unset by default so vibe uses the account's configured
// default — unlike agy, an unset model here is not known to blank the output.
export const VIBE_MODEL = process.env.VIBE_MODEL || null;

// ── Claude Code (`claude`) as a plain CLI reviewer ───────────────────────────────────────────────────────
// Sonnet by default: review is a single read of a bounded diff, and the routing policy reserves the
// strongest model for the *fresh subagent* pass on high-risk work (see review-route.mjs). Override with
// CLAUDE_REVIEW_MODEL.
//
// The invocation is deliberately tool-less. `--tools ""` removes every built-in tool and
// `--strict-mcp-config` (with no `--mcp-config`) loads no MCP servers, so the reviewer can do exactly one
// thing: read the diff piped to it on stdin and write findings to stdout. It cannot edit the tree it is
// reviewing, cannot shell out, and cannot wander into unrelated files — the same "single pass, advisory,
// no writes" contract the other three CLIs get, enforced by flags rather than by hope.
// `--bare` skips hook/skill/plugin/MCP/CLAUDE.md auto-discovery so a scripted call starts fast and, more
// importantly, so the review is not silently reshaped by whatever config the host repo happens to carry.
export const CLAUDE_REVIEW_MODEL = process.env.CLAUDE_REVIEW_MODEL || 'sonnet';

export function die(msg) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(1);
}

export function need(val, flag) {
  if (val === undefined || val.startsWith('-')) die(`${flag} requires a value`);
  return val;
}

// `cmd --version` exits non-zero only when the binary is missing (spawn .error) — a clean presence check.
export function ensureCmd(cmd, fix) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  if (r.error) die(fix);
}

// Non-fatal sibling of ensureCmd: true if the binary is on PATH, false otherwise. Used by the fallback to
// decide whether Antigravity is even available before retrying — no die().
export function hasCmd(cmd) {
  return !spawnSync(cmd, ['--version'], { encoding: 'utf8' }).error;
}

export function ensureGh() {
  ensureCmd('gh', 'gh not found — install GitHub CLI (https://cli.github.com), then `gh auth login`.');
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (r.status !== 0) die('gh is not authenticated — run `gh auth login`.');
}

// ── Branch → PR resolution + stale-HEAD guard (the "wrong-branch tax" fix) ───────────────────────────────
// cross-review takes an explicit <PR#> but never ties it to the current branch or checks the head SHA, so
// the FIRST run regularly reviews the wrong or a stale diff and gets rerun. These helpers let the command
// resolve the PR from the branch and refuse a stale local HEAD. They live here (the shared rail) so the
// resolver is a single source of truth alongside the Codex-fallback plumbing both scripts already import.

// Module-local git I/O: returns trimmed stdout, or null on any non-zero/spawn error (a clean "couldn't").
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

// Module-local gh I/O returning the structured result (so callers/tests can read stderr to classify failure).
function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// First 8 chars of a SHA, for human-readable guard messages. Null-safe → 'unknown' (never empty parens
// like `local HEAD ()` when `git rev-parse` couldn't read a SHA).
export function shortSha(sha) {
  return sha ? sha.slice(0, 8) : 'unknown';
}

// Pure stale-HEAD decision — the unit under test (no I/O, like decideCodexFallback). Given the local HEAD
// SHA, the PR's head SHA, and whether --force was passed, decide whether to proceed:
//   'match'          — SHAs equal → proceed silently.
//   'mismatch-force' — differ but --force → proceed with a warning.
//   'mismatch-block' — differ, no --force → refuse (review would be stale).
export function decideHeadGuard({ localHead, prHeadOid, force }) {
  if (localHead && prHeadOid && localHead === prHeadOid) return 'match';
  return force ? 'mismatch-force' : 'mismatch-block';
}

// ── Cost guard: skip the review on a trivial diff ────────────────────────────────────────────────────────
// "Every PR" must not mean paying for a Codex pass on a typo or a docs-only change. This is the pure,
// testable decision (the unit under test, like decideHeadGuard) — the script fetches the changed-file stats
// (`gh pr view --json files`) and passes them here. Returns { skip, reason }.
//
// A file counts as docs/text (cheap to skip wholesale) when it matches DOC_FILE_RE. Otherwise we sum the
// changed lines (additions+deletions) and skip only below `minLines`. So a docs-only PR of any size skips,
// a tiny code tweak skips, but a real code change of any size is reviewed.
const DOC_FILE_RE = /(\.(md|mdx|txt|rst)$)|(^|\/)(LICENSE|CODEOWNERS|\.gitignore)$/i;

export function isDocFile(path) {
  return DOC_FILE_RE.test(path || '') || /(^|\/)docs\//i.test(path || '');
}

export function decideTrivialSkip({ files, minLines = 10 } = {}) {
  if (!Array.isArray(files) || files.length === 0) return { skip: true, reason: 'empty diff' };
  if (files.every((f) => isDocFile(f.path))) return { skip: true, reason: 'docs-only diff' };
  const lines = files.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  if (lines < minLines)
    return { skip: true, reason: `trivial diff (${lines} changed line${lines === 1 ? '' : 's'} < ${minLines})` };
  return { skip: false };
}

// ── Diff-size guard: strip generated files before they blow a reviewer's context window ────────────────────
// Found live (deploy-pipeline-tuning epic, 2026-07-11): a PR whose diff includes a large auto-generated file
// (a first-time-committed package-lock.json, ~12–19K lines) blew Codex's context window —
// `ERROR: Codex ran out of room in the model's context window` — and the failure surfaced as an opaque
// `codex exec failed (non-auth): 0` (the "0" is codex's own trailing token-count line, picked up by
// `lastLine()`, not a real exit code the caller can act on). Worked around by hand that day
// (`git diff origin/main...HEAD -- . ':(exclude)package-lock.json'` piped directly into `codex exec -`,
// bypassing this script); fixed here so the NEXT PR that touches a lockfile doesn't need the same manual
// detour. This repo committing per-app lockfiles is now Sprint 1's established convention, so this is a
// recurring case, not a one-off.
//
// Strips whole per-file diff hunks (each starts with `diff --git a/X b/Y`) for known generated-file
// basenames, replacing each with a one-line placeholder so the reviewer still sees THAT the file changed —
// just not its (often huge, low-signal) content. Pure string logic, no git/gh dependency, so it's directly
// unit-testable against a hand-built diff fixture.
// `jev-eval.fixtures.json` (jev-semantic-guards): recorded Jev answers that `jev-eval --live` rewrites — ~100 KB of
// machine-written JSON that alone pushed a 20-file PR past agy's/vibe's 256 KB argv limit.
const GENERATED_FILE_RE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|reports-data\.json|jev-eval\.fixtures\.json)$/;

export function stripGeneratedFileDiffs(diffText, { extraPatterns = [] } = {}) {
  if (!diffText) return { diff: diffText, strippedFiles: [] };
  const isGenerated = (path) =>
    GENERATED_FILE_RE.test(path || '') || extraPatterns.some((re) => re.test(path || ''));

  // Split on the `diff --git a/X b/Y` boundary, keeping the delimiter with each chunk (lookahead split).
  const chunks = diffText.split(/(?=^diff --git )/m);
  const strippedFiles = [];
  const kept = chunks.map((chunk) => {
    const header = chunk.match(/^diff --git a\/(\S+) b\/(\S+)/);
    if (!header) return chunk; // preamble before the first `diff --git` (rare, but don't drop it)
    const path = header[2] || header[1];
    if (!isGenerated(path)) return chunk;
    strippedFiles.push(path);
    return `diff --git a/${path} b/${path}\n(generated file — diff omitted to fit the reviewer's context window; see the real file in the PR)\n`;
  });
  return { diff: kept.join(''), strippedFiles };
}

// True when a codex/agy response signals it ran out of context-window room — a DIFFERENT failure class from
// an auth lapse (retrying with a fallback model would likely hit the exact same overflow, since the input
// size is the problem, not the model). Checked against both stdout and stderr since codex's own trailing
// diagnostics ("tokens used\n0") can land on either depending on the failure path, which is what made this
// failure mode read as an opaque `(non-auth): 0` before this check existed. Kept as a named, tested export so
// the message stays actionable instead of falling through to the generic non-auth failure text.
export function isContextWindowOverflow(output) {
  // ['’] covers both a straight and a "smart"/curly apostrophe — CLIs are inconsistent about which they emit.
  return /ran out of room in the model['’]?s context window/i.test(output || '');
}

// gh stderr signalling "this branch has no associated PR" — kept TIGHT to gh's actual no-PR message so a
// repo/remote/auth misconfig (e.g. a bad --repo) falls through to the generic error instead of being masked
// as "no open PR" and sending the operator chasing the wrong fix.
function isNoPrError(stderr) {
  return /no (?:open )?pull requests? found/i.test(stderr || '');
}

// Resolve the open PR for the CURRENT branch via `gh pr view --json …`. Injectable (`deps`) so a pure
// node:test can mock gh + git with no network. Returns { number, headRefName, headRefOid }, or fail()s with a
// clear, actionable message (detached HEAD / no open PR / gh error) — never a stack trace.
export function resolveCurrentPr({ repo } = {}, deps = {}) {
  const { runGit = git, runGh = ghJson, fail = die } = deps;

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD')
    return fail('detached HEAD / not on a branch — checkout the PR branch or pass <PR#> explicitly.');

  const args = ['pr', 'view', '--json', 'number,state,headRefName,headRefOid'];
  if (repo) args.push('--repo', repo);
  const res = runGh(args);
  if (!res.ok) {
    if (isNoPrError(res.stderr))
      return fail(`no open PR for branch \`${branch}\` — push/open one or pass <PR#>.`);
    return fail(`gh pr view failed for branch \`${branch}\`: ${lastLine(res.stderr)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return fail(`could not parse \`gh pr view\` output for branch \`${branch}\`.`);
  }
  if (!parsed || typeof parsed.number !== 'number')
    return fail(`\`gh pr view\` returned no PR number for branch \`${branch}\`.`);
  // gh resolves a MERGED/CLOSED PR too (e.g. a reused branch name) — only an OPEN PR is a valid review target.
  if (parsed.state && parsed.state !== 'OPEN')
    return fail(
      `no open PR for branch \`${branch}\` (found #${parsed.number}, state ${parsed.state}) — ` +
        `push/open one or pass <PR#>.`
    );
  return { number: parsed.number, headRefName: parsed.headRefName, headRefOid: parsed.headRefOid };
}

// The local HEAD SHA (`git rev-parse HEAD`), or null if it can't be read. Injectable for tests.
export function currentHeadSha(deps = {}) {
  const { runGit = git } = deps;
  return runGit(['rev-parse', 'HEAD']);
}

// FAIL LOUD on an unknown/mismatched agy version. The print contract enforced by runAntigravity (the --model
// requirement + the argv framing) is version-specific, so a silent warn is what let 1.0.10 ship empty reviews
// for weeks. A match is silent; an unparseable or mismatched version die()s with a fix-naming message. Deps
// are injectable (spawn/fail/pinned) so a node:test can exercise both outcomes without a real agy or exiting.
// NOTE: cross-review.mjs calls this only on the explicit `--agent antigravity` path; the codex→agy fallback
// runs agy directly (kept intact) — the runAntigravity --model fix already restores its output regardless.
export function checkAgyVersion(deps = {}) {
  const { spawn = spawnSync, fail: failFn = die, pinned = AGY_PINNED } = deps;
  const r = spawn('agy', ['--version'], { encoding: 'utf8' });
  const m = ((r.stdout || '') + (r.stderr || '')).trim().match(/\d+\.\d+\.\d+/);
  if (!m)
    return failFn(`could not determine agy version (expected ${pinned}) — is the Antigravity CLI installed?`);
  if (m[0] !== pinned)
    return failFn(
      `agy ${m[0]} != pinned ${pinned} — the print/--model contract may have shifted. ` +
        `Run \`node scripts/agy-doctor.mjs --fix\` (authorized for agents: it re-verifies the live ` +
        `contract and bumps the pin only on a green probe), then commit the bump. ` +
        `Manual path: re-verify runAntigravity() against \`agy --help\`, then bump AGY_PINNED to ${m[0]}.`
    );
}

// Load a shared `*.prompt.md`. The doc opens with an HTML-comment header; the prompt is everything below
// the first `---` line. Returns the trimmed body, or dies with a clear message.
export function loadPromptBody(path) {
  if (!existsSync(path)) die(`shared prompt missing at ${path}`);
  const raw = readFileSync(path, 'utf8');
  const marker = raw.indexOf('\n---');
  const body = (marker === -1 ? raw : raw.slice(marker + '\n---'.length)).trim();
  if (!body) die(`shared prompt at ${path} is empty.`);
  return body;
}

// `opts.soft` makes a runner return null (with a stderr warning) instead of die()-ing on failure — used
// for non-essential passes (e.g. cross-panel's contradiction synthesis) that should degrade, not abort.
function fail(soft, msg) {
  if (soft) {
    process.stderr.write(`⚠ ${msg}\n`);
    return null;
  }
  die(msg);
}

// Last non-empty line of a stderr blob — the human-readable tail used in failure messages.
function lastLine(stderr) {
  return (stderr || '').trim().split('\n').filter(Boolean).pop() || 'unknown error';
}

// Low-level codex exec: prompt rides as an argv string, context is piped on stdin (codex appends it as a
// <stdin> block). Returns the raw spawn result — callers decide how to interpret status/stdout/stderr.
function execCodex(prompt, stdin) {
  return spawnSync('codex', ['exec', prompt], {
    input: stdin,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

// codex exec wrapper preserving the original contract: returns trimmed stdout, or fail()s (die unless soft).
export function runCodex(prompt, stdin, opts = {}) {
  const r = execCodex(prompt, stdin);
  if (r.status !== 0) return fail(opts.soft, `codex exec failed: ${lastLine(r.stderr)}`);
  return (r.stdout || '').trim();
}

// Soft, STRUCTURED codex run — never dies. Exposes stderr so the caller can tell an auth failure (token
// lapsed → fall back) from a non-auth failure (real break → surface it). This is the "degrade, don't die"
// soft mode made structured; runCodex stays the string-returning variant for its existing direct callers.
export function tryCodex(prompt, stdin) {
  const r = execCodex(prompt, stdin);
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  return {
    ok: r.status === 0,
    text: stdout.trim(),
    authFailed: r.status !== 0 && isCodexAuthError(stderr),
    // See stripGeneratedFileDiffs' header comment: checked on both streams because codex's own trailing
    // diagnostics can land on either, depending on the exact failure path.
    contextOverflow: r.status !== 0 && (isContextWindowOverflow(stdout) || isContextWindowOverflow(stderr)),
    stderr,
  };
}

// True when codex's stderr carries an AUTHENTICATION failure (lapsed/revoked/expired token) — the only
// signal that should trigger the Antigravity fallback. Confirmed against a live revoked token (2026-06-21):
// "Failed to refresh token: 401 Unauthorized … refresh_token_invalidated", "Your session has ended. Please
// log in again.", "your refresh token was revoked. Please log out and sign in again." Kept tight to auth so
// a genuine non-auth error (empty diff, internal break) falls through and fails clearly instead.
export function isCodexAuthError(stderr) {
  return /refresh[_ ]?token|session has ended|log ?in again|sign in again|401 unauthorized|token (?:was|is|could not be) (?:revoked|refreshed|expired|invalid)|not authenticated|unauthorized/i.test(
    stderr || ''
  );
}

// Pure fallback decision — the unit under test. Given the outcome of a codex attempt and whether agy is
// available, return the action to take. No I/O, no exit.
export function decideCodexFallback({ codexOk, authFailed, contextOverflow, agyAvailable }) {
  if (codexOk) return 'use-codex';
  // Checked BEFORE authFailed: an overflow is a distinct failure class from auth (retrying with a fallback
  // model wouldn't help — the input itself is too big, not the credential), so it gets its own clear
  // message rather than falling through to the generic "(non-auth): <cryptic tail line>" text.
  if (contextOverflow) return 'fail-context-overflow';
  if (!authFailed) return 'fail-non-auth'; // codex broke for a non-auth reason — don't mask it behind a fallback
  if (!agyAvailable) return 'fail-both-dead';
  return 'fallback';
}

// Orchestrate codex with a one-shot Antigravity fallback on an auth failure. `deps` is injectable so a
// pure node:test can mock both runners (no network). Returns { findings, fellBack[, from, to] }.
export function runWithCodexFallback(
  { prompt, stdin, antigravityArgv },
  deps = {}
) {
  const {
    tryCodex: tryCodexFn = tryCodex,
    runAntigravity: runAntigravityFn = runAntigravity,
    hasCmd: hasCmdFn = hasCmd,
    fail: failFn = die,
    warn = (m) => process.stderr.write(`${m}\n`),
  } = deps;

  const codex = tryCodexFn(prompt, stdin);
  const action = decideCodexFallback({
    codexOk: codex.ok,
    authFailed: codex.authFailed,
    contextOverflow: codex.contextOverflow,
    agyAvailable: hasCmdFn('agy'),
  });

  switch (action) {
    case 'use-codex':
      return { findings: codex.text, fellBack: false };
    case 'fail-context-overflow':
      return failFn(
        "codex exec failed: the diff is too large for Codex's context window. " +
          'This is usually a large auto-generated file (a lockfile, a minified bundle, a snapshot) — ' +
          'stripGeneratedFileDiffs() already excludes the known lockfile patterns by default, so if you\'re ' +
          'seeing this, either that allowlist needs a new pattern for this file, or the PR has a genuinely ' +
          'large hand-written diff that needs splitting.'
      );
    case 'fail-non-auth':
      return failFn(`codex exec failed (non-auth): ${lastLine(codex.stderr)}`);
    case 'fail-both-dead':
      return failFn(
        'Codex token revoked AND Antigravity unavailable — restore Codex with `codex login`, ' +
          'or install + authenticate the Antigravity CLI (agy).'
      );
    case 'fallback':
    default:
      warn('⚠ Codex unavailable (token revoked) → falling back to Antigravity. Restore: `codex login`.');
      return {
        findings: runAntigravityFn(antigravityArgv),
        fellBack: true,
        from: 'codex',
        to: 'antigravity',
      };
  }
}

// One `agy -p "<prompt>" --model "<MODEL>"` invocation. The prompt+framed context ride in `fullArgv` (stdin is
// NOT the prompt and must be at EOF — input:'' gives an immediate EOF or print mode blocks forever). Returns
// the raw spawn result; the caller classifies status/stdout.
function execAgy(fullArgv, model, spawn) {
  return spawn('agy', ['-p', fullArgv, '--model', model], {
    input: '',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

// agy 1.0.10 print mode: --model is REQUIRED (or `--print` exits 0 with NO output), and a quota-exhausted /
// unreachable model ALSO exits 0 with empty stdout (the 429 lands only in agy's log). So an empty result is a
// real failure, not success — we try AGY_MODEL first and, on empty, retry once with AGY_FALLBACK_MODEL (a
// separate quota pool) so a Gemini quota exhaustion degrades to GPT-OSS instead of silently blanking the review.
// We enforce the argv size cap up front (clear message, not an opaque E2BIG). `deps.spawn` is injectable for tests.
export function runAntigravity(fullArgv, opts = {}, deps = {}) {
  const { spawn = spawnSync, warn = (m) => process.stderr.write(`${m}\n`) } = deps;
  if (Buffer.byteLength(fullArgv, 'utf8') > AGY_ARG_LIMIT) {
    return fail(
      opts.soft,
      `input too large for antigravity (${Math.round(Buffer.byteLength(fullArgv) / 1024)} KB > ` +
        `${AGY_ARG_LIMIT / 1024} KB; agy takes the prompt in argv, not stdin) — use --agent codex instead.`
    );
  }

  // opts.models lets a caller pick its own primary→fallback pair (e.g. prose-draft
  // runs a cheaper Flash model) without forking the retry/empty-output plumbing.
  // Default: the review pair above — existing callers are byte-identical in behavior.
  const modelPair = opts.models?.length
    ? [...new Set(opts.models)]
    : AGY_MODEL === AGY_FALLBACK_MODEL ? [AGY_MODEL] : [AGY_MODEL, AGY_FALLBACK_MODEL];
  const tried = [];
  for (const model of modelPair) {
    const r = execAgy(fullArgv, model, spawn);
    if (r.status !== 0) {
      // A non-zero exit is a real agy error (bad flags, crash) — NOT the quota signal — so don't burn the
      // fallback on it; surface it directly.
      const last = (r.stderr || '').trim().split('\n').filter(Boolean).pop() || 'unknown error';
      return fail(opts.soft, `agy -p failed (model "${model}"): ${last}`);
    }
    const out = (r.stdout || '').trim();
    if (out) {
      if (model !== modelPair[0]) warn(`⚠ agy "${modelPair[0]}" returned no output (quota/unavailable?) → used "${model}".`);
      return out;
    }
    tried.push(model);
  }
  return fail(
    opts.soft,
    `agy returned no output for ${tried.map((m) => `"${m}"`).join(' and ')} — likely a quota cap ` +
      `("RESOURCE_EXHAUSTED 429") or an unavailable model. Set AGY_MODEL / AGY_FALLBACK_MODEL to a model ` +
      `\`agy models\` lists with remaining quota, or use --agent codex.`
  );
}

// One `vibe --prompt "<prompt+context>" --agent plan --output text` invocation. Like agy, vibe takes the
// whole thing as an argv string, so the same size cap applies (and for the same reason: a clear message
// beats an opaque E2BIG). `--agent plan` is NOT optional. `--disabled-tools '*'` is equally non-optional:
// plan mode describes intended behavior, while the tool filter enforces that an injected diff cannot read
// host files, shell out or mutate anything. All review context is already embedded in `fullArgv`.
//
// Empty stdout is treated as a FAILURE, not as "no findings". Every CLI on this roster can exit 0 having
// produced nothing when it is quota-capped or misconfigured, and a review that silently becomes empty is
// worse than one that errors — it reads as a clean pass. `deps.spawn` is injectable for tests.
export function runVibe(fullArgv, opts = {}, deps = {}) {
  const { spawn = spawnSync } = deps;
  if (Buffer.byteLength(fullArgv, 'utf8') > VIBE_ARG_LIMIT) {
    return fail(
      opts.soft,
      `input too large for vibe (${Math.round(Buffer.byteLength(fullArgv) / 1024)} KB > ` +
        `${VIBE_ARG_LIMIT / 1024} KB; vibe takes the prompt in argv, not stdin) — use --agent codex instead.`
    );
  }

  const args = [
    '--prompt',
    fullArgv,
    '--agent',
    'plan',
    '--output',
    'text',
    '--max-turns',
    String(VIBE_MAX_TURNS),
    '--trust',
    '--disabled-tools',
    '*',
  ];
  if (VIBE_MODEL) args.push('--model', VIBE_MODEL);

  const r = spawn('vibe', args, { input: '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error)
    return fail(
      opts.soft,
      `vibe not found or failed to spawn (${r.error.message}) — install the Mistral Vibe CLI ` +
        `(\`uv tool install mistral-vibe\`) and authenticate it, or use --agent codex/antigravity.`
    );
  if (r.status !== 0) {
    const detail = lastLine(r.stderr) || lastLine(r.stdout);
    const hint = /turn limit/i.test(`${r.stderr || ''}${r.stdout || ''}`)
      ? ` — the agent ran out of turns, not quota. Raise VIBE_MAX_TURNS (currently ${VIBE_MAX_TURNS}) and re-run.`
      : '';
    return fail(opts.soft, `vibe --prompt failed: ${detail}${hint}`);
  }

  const out = (r.stdout || '').trim();
  if (!out)
    return fail(
      opts.soft,
      `vibe returned no output — likely a quota cap, an auth lapse, or an untrusted folder. Verify with ` +
        `\`vibe --prompt "say OK" --output text --trust\`; if that is empty too, re-authenticate. ` +
        `(An empty result is a failure, never "no findings" — see runVibe's header.)`
    );
  // With tools disabled, Vibe can still emit a literal tool request as its
  // final text. That is an unfinished attempt, not review findings; accepting
  // and posting it would turn a failed pass into a confident green-looking one.
  if (/^(?:read_file|grep|list_directory|shell|run_command|edit_file|write_file|apply_patch)\s*\{[\s\S]*\}$/.test(out)) {
    return fail(
      opts.soft,
      'vibe requested a disabled tool and no review was produced — re-run the bounded diff; never count this output as a pass.'
    );
  }
  return out;
}

// One `claude -p "<prompt>"` invocation with the context piped on stdin (same shape as codex, which is why
// cross-review can hand both runners the identical prompt/stdin pair). Tool-less and MCP-less by
// construction — see CLAUDE_REVIEW_MODEL's header for why each flag is there.
//
// NOTE ON SAME-FAMILY REVIEW: nothing in this function knows or cares who built the diff. Routing a
// Claude-built diff to a Claude reviewer would be a same-family pass wearing a cross-family label, and
// preventing that is `review-route.mjs`'s job (rule 1: a family never reviews its own diff). Calling this
// directly with `--agent claude` on a Claude-authored PR is a deliberate act, and the caller owns it.
export function runClaudeCode(prompt, stdin, opts = {}, deps = {}) {
  const { spawn = spawnSync } = deps;
  const args = [
    '-p', prompt,
    '--model', CLAUDE_REVIEW_MODEL,
    '--tools', '',
    '--strict-mcp-config',
    '--output-format', 'text',
    '--no-session-persistence',
    '--bare',
  ];

  const r = spawn('claude', args, { input: stdin, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error)
    return fail(
      opts.soft,
      `claude not found or failed to spawn (${r.error.message}) — install Claude Code ` +
        `(https://claude.com/claude-code) and run \`claude auth login\`, or use --agent codex/antigravity.`
    );
  if (r.status !== 0) return fail(opts.soft, `claude -p failed: ${lastLine(r.stderr)}`);

  const out = (r.stdout || '').trim();
  if (!out)
    return fail(
      opts.soft,
      `claude returned no output — likely a usage cap or an expired session. Check \`claude auth status\`, ` +
        `or use --agent codex/antigravity/vibe. (An empty result is a failure, never "no findings".)`
    );
  return out;
}

// ── Devin — a PROSE WRITER here, not a reviewer (independent quota pool) ─────────────────────────────────
// Ported with the reporting family (plugin-audit-and-extraction S1): lib/prose-writer.mjs drafts with
// Devin first. It is deliberately NOT in AGENTS/AGENT_BIN — the reviewer roster is review-route.mjs's
// decision, and this port adds a writer, not a reviewer.
// `devin -p --prompt-file <file>` runs non-interactively and prints the response. The prompt (framing +
// diff) rides in a FILE, not argv, so there is NO size cap to guard — the whole reason to prefer prompt-file
// over agy's argv path for large diffs. Empty stdout is a failure (a quota-capped devin, like agy, exits 0
// with nothing). Uses the account default model. `deps` is injectable so a node:test drives it without a
// real devin binary or touching the real filesystem.
export function runDevin(prompt, opts = {}, deps = {}) {
  const {
    spawn = spawnSync,
    writeFile = writeFileSync,
    mkdtemp = mkdtempSync,
    rm = rmSync,
  } = deps;
  let dir;
  try {
    dir = mkdtemp(join(tmpdir(), 'xrev-devin-'));
  } catch (e) {
    return fail(opts.soft, `could not create a temp dir for devin's prompt file: ${e.message}`);
  }
  const file = join(dir, 'prompt.md');
  try {
    writeFile(file, prompt, 'utf8');
    const r = spawn('devin', ['-p', '--prompt-file', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) return fail(opts.soft, `devin not found or failed to spawn (${r.error.message}) — install the Devin CLI or use --agent codex/antigravity.`);
    if (r.status !== 0) {
      const last = (r.stderr || '').trim().split('\n').filter(Boolean).pop() || 'unknown error';
      return fail(opts.soft, `devin -p failed: ${last}`);
    }
    const out = (r.stdout || '').trim();
    if (!out) {
      return fail(opts.soft, `devin returned no output — likely a quota cap or auth lapse (run \`devin auth\`), or use --agent codex/antigravity.`);
    }
    return out;
  } finally {
    // Best-effort cleanup — a leaked temp prompt file must never fail the review.
    try { rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
