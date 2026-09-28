#!/usr/bin/env node
// cross-review.mjs — an ADVISORY cross-agent second opinion on a pull-request diff.
//
// Pipes `gh pr diff <PR#>` into a DIFFERENT model family's CLI (Codex or Antigravity) with the shared prompt
// (scripts/cross-review.prompt.md = the five AGENTS rules + WAYS single-pass discipline) and prints the
// findings. It is dev tooling, not app code, and it is deliberately:
//   • SINGLE-PASS — one read, no debate / iterate-to-convergence loop (our #1 token sink, out of scope).
//   • NOT A MERGE AUTHORITY — it never approves or merges; CI + the risk-tier rule do that. But its
//     findings ARE resolved or answered before merge, and a run that produces no review FAILS the PR's
//     cross-review/<lens> status (ways-of-work-lean-pass D9).
//
// Usage:
//   node scripts/cross-review.mjs [PR#] --agent codex|antigravity|vibe|claude [--repo owner/repo]
//     [--force] [--dry-run] [--skip-trivial] [--min-lines N]
//
// Four families are wired (see cross-agent-cli.mjs's roster table). Don't pick one by hand on a real PR —
// `node scripts/review-route.mjs --builder <who> --tier <low|high> <PR#>` chooses the two that did NOT
// build it and prints the exact commands. Passing --agent yourself is the escape hatch, and it is how you
// can accidentally have a family review its own diff.
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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  AGENTS,
  die,
  need,
  ensureCmd,
  ensureGh,
  checkAgyVersion,
  loadPromptBody,
  runAntigravity,
  runVibe,
  runClaudeCode,
  runWithCodexFallback,
  AGENT_BIN,
  resolveCurrentPr,
  currentHeadSha,
  decideHeadGuard,
  decideTrivialSkip,
  stripGeneratedFileDiffs,
  shortSha,
} from './lib/cross-agent-cli.mjs';
import {
  changedFileCount,
  cliVersionNote,
  decideSecurityPass,
  isReReview,
  jevMarker,
  judgeReviewOutput,
  parseReviewConfig,
  postReviewStatus,
  reviewMarker,
  RE_REVIEW_NOTE,
} from './lib/review-guard.mjs';
import { jevContext } from './lib/jev.mjs';
import { readSection } from './lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, 'cross-review.prompt.md');
// `--lens security` swaps the prompt ONLY. Agent selection, the codex→agy fallback, --skip-trivial and
// the output guard are untouched, so the lens cannot regress the rail that reviews every other PR.
const SECURITY_PROMPT_PATH = join(__dirname, 'cross-review.security.prompt.md');
const REVIEW_CONFIG_PATH = join(__dirname, 'review-config.json');
export const LENSES = ['security'];

// THROWS rather than die()s: a pure function that exits the process cannot be unit-tested, and silently
// falling back to the general prompt is the worst failure available here — the operator would believe a
// security pass ran while a general review actually did.
export function promptPathFor(lens) {
  if (!lens) return PROMPT_PATH;
  if (!LENSES.includes(lens)) throw new Error(`unknown lens '${lens}' (expected: ${LENSES.join(' | ')})`);
  return SECURITY_PROMPT_PATH;
}

const BANNER =
  '> **Cross-agent review — every finding is fixed, or answered on this PR, before merge. This does not authorize one.** ' +
  'CI and the risk-tier merge rule remain the only merge authority. A fresh `pr-reviewer` pass covers context independence; ' +
  'this is the family-independence pass: one single-pass read by a model family that did not build the diff.';

const HELP = `cross-review.mjs — advisory cross-agent second opinion on a PR diff.

Usage:
  node scripts/cross-review.mjs [PR#] --agent codex|antigravity|vibe|claude [--repo owner/repo]
                                      [--force] [--dry-run]

[PR#] is optional — omit it to review the open PR for the CURRENT branch.
Prefer \`node scripts/review-route.mjs --builder <who> --tier <low|high> <PR#>\` — it picks the two
families that did not build the diff and prints the exact commands to run.

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

Not a merge authority — it never approves or merges. Its findings are resolved or answered before merge,
and a run that produces no review fails the PR's cross-review/<lens> status.`;

function parseArgs(argv) {
  const out = {
    pr: null,
    agent: 'codex',
    repo: null,
    force: false,
    dryRun: false,
    skipTrivial: false,
    minLines: 10,
    lens: null,
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
    else if (a === '--lens') out.lens = need(argv[++i], '--lens');
    else if (a.startsWith('--lens=')) out.lens = a.slice('--lens='.length);
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

// agy and vibe have no usable stdin for the prompt, so the diff rides embedded in the argv string (the same
// framing codex and claude get on stdin). One helper, because the framing must be IDENTICAL across families
// — a reviewer that sees the diff differently isn't giving a comparable second opinion.
function embeddedArgv(prompt, diff) {
  return `${prompt}\n\n## PR diff to review\n\n\`\`\`diff\n${diff}\n\`\`\`\n`;
}

// Returns { findings, fellBack[, from, to] }. The codex path auto-falls-back to Antigravity on a dead token.
function runReview(agent, prompt, diff) {
  if (agent === 'codex') {
    return runWithCodexFallback({ prompt, stdin: diff, antigravityArgv: embeddedArgv(prompt, diff) });
  }
  if (agent === 'antigravity') {
    return { findings: runAntigravity(embeddedArgv(prompt, diff)), fellBack: false };
  }
  if (agent === 'vibe') {
    return { findings: runVibe(embeddedArgv(prompt, diff)), fellBack: false };
  }
  if (agent === 'claude') {
    // stdin, like codex — see runClaudeCode. Same prompt body, so the pass is comparable.
    return { findings: runClaudeCode(prompt, diff), fellBack: false };
  }
  die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);
}

export function buildComment(
  agentLabel,
  findings,
  fellBack,
  { lens = null, version = null, reReview = false, securityOwed = null } = {}
) {
  // When codex fell back, make it unmistakable so nobody reads an Antigravity review as a Codex one.
  const header = fellBack ? `${AGENTS.antigravity} — Codex unavailable` : agentLabel;
  const title = lens
    ? `### 🔐 Cross-agent review — ${lens} lens (${header})`
    : `### 🔎 Cross-agent review (${header})`;
  // The reviewer CLI's version is machine-local state no artifact used to capture: if it drifts, review
  // strength changes and nothing notices. Recorded, not enforced — see lib/review-guard.mjs.
  const attribution = version ? `\n\n_${version}._` : '';
  const limit =
    lens === 'security'
      ? `\n\n> **Scope of this pass:** one advisory, single-pass read by a different model family, triggered by the changed paths. It is **not** static analysis, not exhaustive, and not a required check. A clean result here is not a security guarantee.`
      : '';
  // A general pass on a security-path PR must not read as the whole review.
  const owed = securityOwed
    ? `\n\n> ⚠ **The security lens is OWED on this PR** (${securityOwed}) and has not run here. This general pass is not a substitute for it.`
    : '';
  const convergence = reReview
    ? `\n\n> **Re-review:** Blocking/Should-fix findings only — earlier nits are deliberately not repeated.`
    : '';
  return `${title}\n\n${BANNER}${attribution}${limit}${owed}${convergence}\n\n---\n\n${findings}\n`;
}

/** Comment bodies already on the PR, for re-review convergence. [] on any failure (degrade to first pass). */
function ghComments(pr, repo) {
  const args = ['pr', 'view', String(pr), '--json', 'comments'];
  if (repo) args.push('--repo', repo);
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return [];
  try {
    return (JSON.parse(r.stdout || '{}').comments || []).map((c) => c.body || '');
  } catch {
    return [];
  }
}

/** The PR head sha, pinned before the review runs. null when gh cannot say — never a guess. */
function ghHeadSha(pr, repo) {
  const args = ['pr', 'view', String(pr), '--json', 'headRefOid'];
  if (repo) args.push('--repo', repo);
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout || '{}').headRefOid || null;
  } catch {
    return null;
  }
}

/** The PR body, for the `risk: high` half of the security trigger. '' on any failure. */
function ghBody(pr, repo) {
  const args = ['pr', 'view', String(pr), '--json', 'body'];
  if (repo) args.push('--repo', repo);
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return '';
  try {
    return JSON.parse(r.stdout || '{}').body || '';
  } catch {
    return '';
  }
}

/** The project's review config. A missing/invalid file is FATAL: defaulting it would silently mean "never run the security lens". */
export function loadReviewConfig(path = REVIEW_CONFIG_PATH) {
  try {
    // The `review` section of golden-frijoles.config.json over scripts/review-config.json (D9).
    const { raw, present } = readSection('review', { legacyPath: path, onLegacyError: (_p, e) => { throw e; } });
    if (!present) throw new Error(`${path} not found`);
    return parseReviewConfig(raw);
  } catch (e) {
    die(
      `scripts/review-config.json is missing or invalid (${e.message}). It decides which PRs get the security lens — a default would silently mean "never".`
    );
  }
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

async function main() {
  let { pr, agent, repo, force, dryRun, skipTrivial, minLines, includeLockfiles, lens, help } = parseArgs(
    process.argv.slice(2)
  );
  if (help) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }
  if (pr !== null && !/^\d+$/.test(String(pr))) die(`PR number must be numeric, got '${pr}'.`);
  if (!AGENTS[agent]) die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);
  if (lens && !LENSES.includes(lens)) die(`unknown --lens '${lens}'; use ${LENSES.join('|')}`);

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
  // The security lens is triggered by the CHANGED PATHS, not by judgement (D7). The router prints both
  // commands, but a hand-run general pass must not silently stand in for a missing security pass — so
  // this run says so, on stderr AND in the posted comment, where a reader of the PR can see it.
  let securityOwed = null;
  if (!lens) {
    const cfg = loadReviewConfig();
    const decision = decideSecurityPass({
      files: ghFiles(pr, repo),
      body: ghBody(pr, repo),
      securityPaths: cfg.securityPaths,
      totalFiles: changedFileCount({ pr, repo }),
    });
    if (decision.run) {
      securityOwed = decision.reason;
      process.stderr.write(
        `⚠ this PR triggers the security lens (${decision.reason}) — run: node scripts/cross-review.mjs ${pr}${repo ? ` --repo ${repo}` : ''} --agent <another-family> --lens security\n`
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

  // Resolve the Jev config BEFORE a review is paid for: a malformed jev.config.json throws, and throwing after
  // the reviewer ran would lose its reply and strand the status at `pending` (fresh review, PR #35).
  jevContext('review');

  // Pin the commit being reviewed BEFORE the reviewer runs: a push mid-review would otherwise move the
  // status onto a commit nobody read, and the re-review check needs to tell a new commit from a retry.
  const reviewedSha = ghHeadSha(pr, repo);

  // Post PENDING before the CLI is even checked. A version-pin mismatch or a dead token exits the
  // script BEFORE the guard runs (observed live on PR #177, where the agy pin refused the run), and an
  // ABSENT status is indistinguishable from "never ran". A stuck `pending` is visibly not-clean, which
  // is the whole point of D9.
  if (!dryRun)
    postReviewStatus({
      pr,
      repo,
      state: 'pending',
      lens,
      sha: reviewedSha,
      description: `${AGENTS[agent]} reviewing…`,
    });

  if (agent === 'codex') {
    ensureCmd(
      'codex',
      'codex not found — install Codex CLI (https://github.com/openai/codex) and `codex login`.'
    );
  } else if (agent === 'antigravity') {
    ensureCmd('agy', 'agy not found — install the Antigravity CLI and authenticate it, then retry.');
    checkAgyVersion();
  } else if (agent === 'vibe') {
    ensureCmd(
      AGENT_BIN.vibe,
      'vibe not found — install the Mistral Vibe CLI (`uv tool install mistral-vibe`) and authenticate it, then retry.'
    );
  } else if (agent === 'claude') {
    ensureCmd(
      AGENT_BIN.claude,
      'claude not found — install Claude Code (https://claude.com/claude-code) and run `claude auth login`, then retry.'
    );
  }

  // Re-review convergence (D8): a prior pass for THIS lens on a DIFFERENT commit means Important only.
  const reReview = isReReview(ghComments(pr, repo), lens, reviewedSha);
  const prompt = loadPromptBody(promptPathFor(lens)) + (reReview ? RE_REVIEW_NOTE : '');
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

  // THE GUARD (D9). With one external pass, a CLI that exits 0 with nothing to say reads exactly like a
  // clean review and nothing contradicts it. So a reply that is not a review FAILS the run loudly and fails
  // the PR's `cross-review/<lens>` status, rather than posting a comment that looks like a pass.
  // jev-semantic-guards D5: Jev decides "is this a real review?" by jev.config.json → rails.review.mode;
  // `assertReviewOutput` is the fallback when Jev cannot look or is unsure, and the whole of it when `off`.
  // The reason always names who decided.
  const verdict = await judgeReviewOutput(findings, { sha: reviewedSha });
  process.stderr.write(`review guard: ${verdict.reason}\n`);
  if (!verdict.ok) {
    const who = fellBack ? AGENTS.antigravity : AGENTS[agent];
    if (!dryRun) {
      const st = postReviewStatus({
        pr,
        repo,
        state: 'failure',
        lens,
        sha: reviewedSha,
        description: `${who}: ${verdict.reason}`,
      });
      process.stderr.write(
        st.posted
          ? `✗ marked cross-review/${lens || 'general'} FAILED on PR #${pr}.\n`
          : `✗ could not post the failing status (${st.detail}).\n`
      );
    }
    // NEVER destroy a reply the run paid for: a false reject would otherwise cost a full re-run, which is
    // exactly how a guard trains people to bypass it.
    process.stderr.write(
      `\n───── ${who}'s full reply, rejected by the output guard ─────\n${findings || '(empty)'}\n───── end of reply ─────\n`
    );
    die(`${who} did not return a review: ${verdict.reason}`);
  }

  const body =
    buildComment(AGENTS[agent], findings, fellBack, {
      lens,
      version: cliVersionNote(fellBack ? 'antigravity' : agent),
      reReview,
      securityOwed,
    }) +
    reviewMarker({ lens, sha: reviewedSha }) +
    jevMarker(verdict);
  if (dryRun) {
    process.stdout.write(body);
    process.stderr.write('\n(dry-run — no comment posted)\n');
  } else {
    const url = postComment(pr, repo, body);
    process.stderr.write(`✓ Review comment posted${url ? `: ${url}` : ''}\n`);
    const st = postReviewStatus({
      pr,
      repo,
      state: 'success',
      lens,
      sha: reviewedSha,
      description: `${AGENTS[agent]} — ${verdict.reason}`,
    });
    process.stderr.write(
      st.posted
        ? `✓ cross-review/${lens || 'general'} status: success.\n`
        : `⚠ review posted but its status did not (${st.detail}).\n`
    );
  }
}

// Guarded so importing this module for its pure helpers does not run a review.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((e) => {
    process.stderr.write(`cross-review: ${e?.message || e}\n`);
    process.exit(1);
  });
