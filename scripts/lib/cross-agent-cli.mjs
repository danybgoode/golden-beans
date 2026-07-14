// cross-agent-cli.mjs — the shared CLI plumbing for the cross-agent second-opinion tools.
//
// One source of truth for driving a DIFFERENT model family's CLI (Codex or Antigravity), reused by both:
//   • scripts/cross-review.mjs  — advisory second opinion on a PR diff
//   • scripts/cross-panel.mjs   — advisory second opinion on a proposed plan (a scope/seed doc)
//
// It holds only the family-agnostic mechanics: presence/version checks, the per-CLI context-passing quirks
// (codex takes context on stdin; agy takes the prompt as the `-p` argv value — stdin is NOT the prompt and
// must be at EOF — with a size cap), and the shared-prompt loader. The *framing* of the context (a PR diff
// vs a plan doc) and the output handling
// (post a PR comment vs print a panel) stay in each consuming script. Zero npm deps — Node 18+.
//
// ── Codex → Antigravity auto-fallback ───────────────────────────────────────────────────────────────────
// When the local Codex token has lapsed, `codex exec` exits non-zero with an AUTH error on stderr (e.g.
// "Your session has ended. Please log in again." / "refresh token was revoked" / 401). `runWithCodexFallback`
// detects that specific auth signal (NOT every error — a non-auth break or an empty diff still fails clearly)
// and retries once with Antigravity, returning `{ fellBack: true, from: 'codex', to: 'antigravity' }` so the
// caller can label the output. The trigger lives in the pure, testable `decideCodexFallback`; restoring Codex
// is `codex login` (see scripts/README.md → "Restoring a lapsed Codex token").

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// label per agent. Drives both the CLI dispatch and the human-readable header.
export const AGENTS = { codex: 'Codex', antigravity: 'Antigravity' };

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
// agy-doctor: last verified 2026-07-14 against 1.1.2.
//   ^ machine-managed marker — `node scripts/agy-doctor.mjs --fix` rewrites it (with the constant
//   below) after a green live contract probe. Don't hand-edit the marker's shape.
export const AGY_PINNED = '1.1.2';

// agy's `--print` mode prints NOTHING unless `--model` names a model — and, crucially, it ALSO prints
// nothing (exit 0, empty stdout — the error lands only in agy's log, see --log-file) when the model is
// quota-exhausted or unreachable. Gemini is the ideal reviewer (a different family from BOTH the Claude host
// and the GPT-family codex), so it's the default — but its per-subscription quota is tight and exhausts
// ("RESOURCE_EXHAUSTED 429: Individual quota reached"), so runAntigravity AUTO-FALLS-BACK to
// AGY_FALLBACK_MODEL (GPT-OSS, a separate quota pool that worked on the dev machine) when the primary yields
// empty. Override either via env.
export const AGY_MODEL = process.env.AGY_MODEL || 'Gemini 3.1 Pro (High)';
export const AGY_FALLBACK_MODEL = process.env.AGY_FALLBACK_MODEL || 'GPT-OSS 120B (Medium)';

// agy takes the prompt+context as a single `-p` argv string (stdin is not the prompt). Guard well under the
// OS limit (macOS ARG_MAX is 1 MB incl. env) so a huge input fails clearly instead of an opaque E2BIG.
export const AGY_ARG_LIMIT = 256 * 1024;

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
const GENERATED_FILE_RE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock)$/;

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

  const tried = [];
  for (const model of AGY_MODEL === AGY_FALLBACK_MODEL ? [AGY_MODEL] : [AGY_MODEL, AGY_FALLBACK_MODEL]) {
    const r = execAgy(fullArgv, model, spawn);
    if (r.status !== 0) {
      // A non-zero exit is a real agy error (bad flags, crash) — NOT the quota signal — so don't burn the
      // fallback on it; surface it directly.
      const last = (r.stderr || '').trim().split('\n').filter(Boolean).pop() || 'unknown error';
      return fail(opts.soft, `agy -p failed (model "${model}"): ${last}`);
    }
    const out = (r.stdout || '').trim();
    if (out) {
      if (model !== AGY_MODEL) warn(`⚠ agy "${AGY_MODEL}" returned no output (quota/unavailable?) → used "${model}".`);
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
