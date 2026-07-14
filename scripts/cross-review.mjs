#!/usr/bin/env node
// cross-review.mjs — an ADVISORY cross-agent second opinion on a pull-request diff.
//
// Pipes `gh pr diff <PR#>` into a DIFFERENT model family's CLI (Codex or Antigravity) with the shared prompt
// (scripts/cross-review.prompt.md = the five AGENTS rules + WAYS single-pass discipline) and prints the
// findings. It is dev tooling, not app code, and it is deliberately:
//   • SINGLE-PASS — one read, no debate / iterate-to-convergence loop (our #1 token sink, out of scope).
//   • ADVISORY ONLY — never gates, blocks, or merges. CI + the Claude reviewer + the risk-tier rule decide.
//
// Usage:
//   node scripts/cross-review.mjs [PR#] --agent codex|antigravity [--repo owner/repo] [--force] [--dry-run]
//     [--skip-trivial] [--min-lines N]
//
// --skip-trivial is the CI cost guard: skip (exit 0, no comment) when the PR is docs-only or under
// --min-lines (default 10) changed lines, so "every PR" doesn't pay for a review on a typo. Off by default
// so the manual command always reviews.
//
// <PR#> is OPTIONAL: with none, the command resolves the open PR for the CURRENT branch (so the FIRST run
// reviews the right diff, no rerun) and refuses a stale local HEAD unless --force. An explicit <PR#> still
// overrides (and bypasses the stale guard — the deliberate escape hatch).
//
// Default posts the findings as a labeled, clearly-advisory PR comment; --dry-run prints instead.
// `gh` resolves the repo from the current directory; pass --repo to target another (e.g. the app repo).
// Zero npm deps — Node 18+. CLI plumbing is shared with cross-panel.mjs via scripts/lib/cross-agent-cli.mjs.
//
// The diff is passed through stripGeneratedFileDiffs() before it reaches the reviewer CLI — a large
// auto-generated file (a committed package-lock.json, ~12–19K lines) blew Codex's context window live
// (deploy-pipeline-tuning epic, 2026-07-11); the reviewer still sees THAT the file changed, just not its
// (huge, low-signal) content. See that function's header comment in cross-agent-cli.mjs for the full story.
// --include-lockfiles opts back into the raw, unstripped diff for the rare case of reviewing a hand-edited
// lockfile itself.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AGENTS,
  die,
  need,
  ensureCmd,
  ensureGh,
  checkAgyVersion,
  loadPromptBody,
  runAntigravity,
  runWithCodexFallback,
  resolveCurrentPr,
  currentHeadSha,
  decideHeadGuard,
  decideTrivialSkip,
  stripGeneratedFileDiffs,
  shortSha,
} from './lib/cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, 'cross-review.prompt.md');

const BANNER =
  '> **Advisory only — not a gate, does not authorize merge.** ' +
  'CI + the Claude reviewer + the risk-tier rule remain authoritative. ' +
  'This is a single-pass second opinion from a different model family.';

const HELP = `cross-review.mjs — advisory cross-agent second opinion on a PR diff.

Usage:
  node scripts/cross-review.mjs [PR#] --agent codex|antigravity [--repo owner/repo] [--force] [--dry-run]

[PR#] is optional — omit it to review the open PR for the CURRENT branch.

Flags:
  --agent <name>       reviewer CLI: ${Object.keys(AGENTS).join('|')} (default: codex)
  --repo  owner/repo   target a specific repo (default: the repo of the current directory)
  --force              proceed even when local HEAD differs from the resolved PR head (auto-resolve only)
  --skip-trivial       skip (exit 0, no comment) when the PR is docs-only or under --min-lines changed lines
  --min-lines N        trivial-diff threshold for --skip-trivial (default: 10)
  --include-lockfiles  send the RAW diff, including generated files (package-lock.json, yarn.lock, etc.) —
                       normally stripped to a placeholder to avoid blowing the reviewer's context window
  --dry-run            print the comment instead of posting it (alias: --no-comment)
  -h, --help           show this help

With no [PR#], resolves the branch's PR via \`gh pr view\` and refuses a stale local HEAD unless --force.
An explicit [PR#] overrides resolution and bypasses the stale guard.

Advisory only — the output never gates, blocks, or authorizes a merge.`;

function parseArgs(argv) {
  const out = {
    pr: null,
    agent: 'codex',
    repo: null,
    force: false,
    dryRun: false,
    skipTrivial: false,
    minLines: 10,
    includeLockfiles: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run' || a === '--no-comment') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--skip-trivial') out.skipTrivial = true;
    else if (a === '--include-lockfiles') out.includeLockfiles = true;
    else if (a === '--min-lines') out.minLines = parseMinLines(need(argv[++i], '--min-lines'));
    else if (a.startsWith('--min-lines=')) out.minLines = parseMinLines(a.slice('--min-lines='.length));
    else if (a === '--agent') out.agent = need(argv[++i], '--agent');
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else if (a === '--repo') out.repo = need(argv[++i], '--repo');
    else if (a.startsWith('--repo=')) out.repo = a.slice('--repo='.length);
    else if (!a.startsWith('-') && out.pr === null) out.pr = a;
    else die(`unknown argument '${a}' (try --help)`);
  }
  return out;
}

function parseMinLines(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) die(`--min-lines must be a non-negative integer, got '${v}'.`);
  return n;
}

function ghDiff(pr, repo) {
  const args = ['pr', 'diff', String(pr)];
  if (repo) args.push('--repo', repo);
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const first = (r.stderr || '').trim().split('\n')[0] || 'unknown error';
    die(`gh pr diff failed for #${pr}: ${first}`);
  }
  if (!r.stdout || !r.stdout.trim()) die(`PR #${pr} has an empty diff (wrong number or repo?).`);
  return r.stdout;
}

// Changed-file stats for the cost guard: [{ path, additions, deletions }, …]. Returns [] on any failure so
// the guard degrades to "not trivial" (review runs) rather than silently skipping on a transient gh hiccup.
function ghFiles(pr, repo) {
  const args = ['pr', 'view', String(pr), '--json', 'files'];
  if (repo) args.push('--repo', repo);
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout || '{}').files || [];
  } catch {
    return [];
  }
}

// agy 1.0.7 has no stdin, so the diff rides embedded in the argv string (same framing codex gets on stdin).
function agyArgv(prompt, diff) {
  return `${prompt}\n\n## PR diff to review\n\n\`\`\`diff\n${diff}\n\`\`\`\n`;
}

// Returns { findings, fellBack[, from, to] }. The codex path auto-falls-back to Antigravity on a dead token.
function runReview(agent, prompt, diff) {
  if (agent === 'codex') {
    return runWithCodexFallback({ prompt, stdin: diff, antigravityArgv: agyArgv(prompt, diff) });
  }
  if (agent === 'antigravity') {
    return { findings: runAntigravity(agyArgv(prompt, diff)), fellBack: false };
  }
  die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);
}

function buildComment(agentLabel, findings, fellBack) {
  // When codex fell back, make it unmistakable so nobody reads an Antigravity review as a Codex one.
  const header = fellBack ? `${AGENTS.antigravity} — Codex unavailable` : agentLabel;
  return `### 🔎 Cross-agent review (${header})\n\n${BANNER}\n\n---\n\n${findings}\n`;
}

function postComment(pr, repo, body) {
  const args = ['pr', 'comment', String(pr)];
  if (repo) args.push('--repo', repo);
  args.push('--body-file', '-'); // pipe the body on stdin → no shell-escaping pitfalls
  const r = spawnSync('gh', args, { input: body, encoding: 'utf8' });
  if (r.status !== 0) {
    const first = (r.stderr || '').trim().split('\n')[0] || 'unknown error';
    die(`gh pr comment failed for #${pr}: ${first}`);
  }
  return (r.stdout || '').trim(); // gh prints the comment URL
}

function main() {
  let { pr, agent, repo, force, dryRun, skipTrivial, minLines, includeLockfiles, help } = parseArgs(
    process.argv.slice(2)
  );
  if (help) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }
  if (pr !== null && !/^\d+$/.test(String(pr))) die(`PR number must be numeric, got '${pr}'.`);
  if (!AGENTS[agent]) die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);

  ensureGh();

  // No <PR#> → resolve the open PR for the current branch and guard against a stale local HEAD, so the
  // FIRST run reviews the right diff. An explicit <PR#> skips both (the deliberate escape hatch).
  if (pr === null) {
    const resolved = resolveCurrentPr({ repo });
    pr = String(resolved.number);
    process.stderr.write(`Resolved PR #${pr} from branch \`${resolved.headRefName}\`.\n`);

    const localHead = currentHeadSha();
    const action = decideHeadGuard({ localHead, prHeadOid: resolved.headRefOid, force });
    if (action === 'mismatch-block') {
      die(
        `local HEAD (${shortSha(localHead)}) differs from PR #${pr} head (${shortSha(resolved.headRefOid)}) ` +
          `— push first, or pass --force (or an explicit <PR#>) to review anyway.`
      );
    }
    if (action === 'mismatch-force') {
      process.stderr.write(
        `⚠ local HEAD (${shortSha(localHead)}) differs from PR #${pr} head ` +
          `(${shortSha(resolved.headRefOid)}) — proceeding due to --force.\n`
      );
    }
  }
  // Cost guard (CI): bail before installing/running the reviewer when the diff is trivial/docs-only.
  if (skipTrivial) {
    const { skip, reason } = decideTrivialSkip({ files: ghFiles(pr, repo), minLines });
    if (skip) {
      process.stderr.write(`cross-review skipped (${reason}) — PR #${pr}.\n`);
      process.exit(0);
    }
  }

  if (agent === 'codex') {
    ensureCmd('codex', 'codex not found — install Codex CLI (https://github.com/openai/codex) and `codex login`.');
  } else if (agent === 'antigravity') {
    ensureCmd('agy', 'agy not found — install the Antigravity CLI and authenticate it, then retry.');
    checkAgyVersion();
  }

  const prompt = loadPromptBody(PROMPT_PATH);
  const rawDiff = ghDiff(pr, repo);
  let diff = rawDiff;
  if (!includeLockfiles) {
    const stripped = stripGeneratedFileDiffs(rawDiff);
    diff = stripped.diff;
    if (stripped.strippedFiles.length) {
      process.stderr.write(
        `Omitted ${stripped.strippedFiles.length} generated file diff(s) to fit the reviewer's context ` +
          `window: ${stripped.strippedFiles.join(', ')} (pass --include-lockfiles to send the raw diff).\n`
      );
    }
  }
  const { findings, fellBack } = runReview(agent, prompt, diff);
  if (!findings) die(`${fellBack ? AGENTS.antigravity : AGENTS[agent]} returned no output.`);

  const body = buildComment(AGENTS[agent], findings, fellBack);
  if (dryRun) {
    process.stdout.write(body);
    process.stderr.write('\n(dry-run — no comment posted)\n');
  } else {
    const url = postComment(pr, repo, body);
    process.stderr.write(`✓ Advisory comment posted${url ? `: ${url}` : ''}\n`);
  }
}

main();
