// review-guard.mjs — the three small decisions the one-external-pass review stack rests on.
//
// Byte-identical in dobby-foundation's template and every consuming project (ways-of-work-lean-pass
// D11). Project-specific values live in `scripts/review-config.json`, never in this file.
//
// ── 1. A silent reviewer is a FAILED run (D9) ──────────────────────────────────────────────────────
// With two external passes, a CLI that exited 0 and printed nothing was contradicted by the other one.
// With one, nothing contradicts it: an empty or structureless reply reads exactly like "looks clean".
// That has already happened here — agy 1.0.10 silently changed its print contract and shipped empty
// reviews for weeks. So a reply must carry STRUCTURE: a severity heading, or an explicit clean verdict.
// Anything else fails the run, fails the PR's `cross-review/<lens>` status, and exits non-zero.
// Kept deliberately permissive about wording — a guard that rejects a real review trains people to
// bypass it — and strict only about "is there a review in here at all". Widened 2026-09-16 after a
// sweep of 593 machine-posted reviews found it would have rejected genuine ones: a bulleted or bold
// severity marker (`- **Blocking**: …`), a `**Findings**` heading, a `**Correctness & architecture**`
// prose review, and a bare `**None**` all count. The caller ALSO prints the full rejected reply, so a
// false reject can never destroy a review that cost a real run.
//
// ── 2. The security pass is triggered by PATHS, not by the builder's judgement (D7) ────────────────
// A PR gets the lean security lens when a changed file matches the project's `securityPaths` globs, or
// its body declares `risk: high`. The builder can always add the lens by hand; it cannot skip it.
//
// ── 3. The CLI version is RECORDED, not a hard stop ────────────────────────────────────────────────
// The output guard above is what catches a CLI whose print contract changed. A hard version pin on top
// would take the only external pass offline on every routine CLI update — the "one busy model took a
// whole family offline" failure this repo already recorded for agy. So the version lands in the PR
// comment and status, with a loud note when it differs from the last version verified to produce real
// reviews. (agy keeps its own hard pin in cross-agent-cli.mjs: its print contract has broken twice.)
//
// Zero deps — Node 18+.

import { spawnSync } from 'node:child_process';

/** Codex CLI version last observed producing a real, structured review. Bump after a verified run. */
export const CODEX_VERIFIED = '0.154.0';

const SEVERITY_HEADING =
  /^\s{0,3}(?:[-*+]\s+|\d+\.\s+|>\s*|\|\s*)?(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:🔴|🟠|🟡|⚪)?\s*(?:blocking|should[- ]fix|nits?|important|critical|findings?|correctness(?:\s*(?:&|and)\s*architecture)?|security(?: review)? findings?)\b/im;
/^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:🔴|🟠|🟡|⚪)?\s*(?:blocking|should[- ]fix|nits?|important|critical)\b/im;
const CLEAN_VERDICT =
  /(?:^\s{0,3}(?:[-*+]\s+)?(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:clean|none)\b|\bassessment:\s*(?:\*\*)?\s*clean\b|\bno\s+(?:\*\*)?(?:blocking|security|should[- ]fix|nit)\b[^.\n]{0,80}\b(?:findings|issues|problems)\b|\bno (?:findings|issues|problems)\b|\bnothing (?:to report|found|blocking)\b|\blooks clean\b|\bdiff (?:is|looks) clean\b|\bno concerns\b)/im;
/(?:^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*clean\b|\bassessment:\s*(?:\*\*)?\s*clean\b|\bno (?:blocking |security )?(?:findings|issues|problems)\b|\bnothing (?:to report|found|blocking)\b|\blooks clean\b|\bdiff (?:is|looks) clean\b|\bno concerns\b)/im;
// A reviewer that emitted a raw tool call instead of a review — observed twice from vibe on real PRs
// (`read_file{"path": …}`, `write_file…{"file_path": …}`). Its JSON can CONTAIN review-shaped words, so
// this is checked first and wins.
const TOOL_TRANSCRIPT = /^\s*[a-z_]+\S*\s*\{\s*"/i;

/**
 * THE GUARD. Pure. Returns { ok, reason }.
 * ok when the reply has a severity heading or an explicit clean verdict; fails on empty, whitespace,
 * or prose with neither (a CLI banner, an error page, a truncated tool transcript).
 */
export function assertReviewOutput(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, reason: 'the reviewer returned no output' };
  if (TOOL_TRANSCRIPT.test(t))
    return { ok: false, reason: `the reviewer emitted a raw tool call, not a review ("${t.slice(0, 80)}")` };
  if (SEVERITY_HEADING.test(t)) return { ok: true, reason: 'severity-structured findings' };
  if (CLEAN_VERDICT.test(t)) return { ok: true, reason: 'explicit clean verdict' };
  return {
    ok: false,
    reason: `the reviewer's reply has no severity heading and no clean verdict — not a review (first line: "${t.split('\n')[0].slice(0, 120)}")`,
  };
}

/** Minimal glob → RegExp: `**` any depth, `*` within a segment, `?` one char. Anchored, case-sensitive. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * Does this PR get the security lens? Pure.
 * files: [{ path }] or strings · body: PR body · securityPaths: globs from review-config.json.
 */
export function decideSecurityPass({ files = [], body = '', securityPaths = [] }) {
  const paths = files.map((f) => (typeof f === 'string' ? f : f.path)).filter(Boolean);
  const res = securityPaths.map(globToRegExp);
  const matched = paths.filter((p) => res.some((r) => r.test(p)));
  if (matched.length)
    return {
      run: true,
      reason: `touches security paths: ${matched.slice(0, 5).join(', ')}${matched.length > 5 ? ` (+${matched.length - 5})` : ''}`,
      matched,
    };
  // Requires the punctuation or the word "tier": plain prose like "a low-risk, high-value change" is not
  // a declaration.
  if (/\brisk\s*tier\s*[:=]\s*\**\s*high\b|\brisk\s*[:=]\s*\**\s*high\b/i.test(body))
    return { run: true, reason: 'PR body declares risk: high', matched: [] };
  return { run: false, reason: 'no security path touched and no risk: high declared', matched: [] };
}

/**
 * Validate a parsed `scripts/review-config.json`. Pure; throws with a named problem rather than
 * defaulting — a missing config silently meaning "review nothing" is the confident-empty failure.
 */
export function parseReviewConfig(json) {
  const scopes = ['every-pr', 'security-paths-only'];
  if (!json || typeof json !== 'object') throw new Error('review-config.json: not an object');
  if (!scopes.includes(json.reviewScope))
    throw new Error(`review-config.json: reviewScope must be one of ${scopes.join(' | ')}`);
  if (
    !Array.isArray(json.securityPaths) ||
    !json.securityPaths.length ||
    json.securityPaths.some((g) => typeof g !== 'string' || !g)
  ) {
    throw new Error('review-config.json: securityPaths must be a non-empty array of globs');
  }
  return { reviewScope: json.reviewScope, securityPaths: json.securityPaths };
}

/** The `gh api` argv that sets a commit status. Pure, so the shape is pinned by a test. */
export function commitStatusArgs({ repo, sha, state, lens, description }) {
  const context = `cross-review/${lens || 'general'}`;
  return [
    'api',
    '--method',
    'POST',
    `repos/${repo}/statuses/${sha}`,
    '-f',
    `state=${state}`,
    '-f',
    `context=${context}`,
    '-f',
    `description=${String(description).slice(0, 140)}`,
  ];
}

/**
 * Post the status for a PR head. I/O shell with injectable spawn. Returns { posted, detail } and never
 * throws: a status that could not be posted is reported by the caller, it does not mask the verdict.
 */
export function postReviewStatus({ pr, repo, state, lens, description, sha = null }, deps = {}) {
  const run = deps.spawn ?? spawnSync;
  let head = sha;
  let fullRepo = repo;
  if (!head || !fullRepo) {
    const view = run(
      'gh',
      ['pr', 'view', String(pr), '--json', 'headRefOid,url', ...(repo ? ['--repo', repo] : [])],
      { encoding: 'utf8' }
    );
    if (view.status !== 0)
      return {
        posted: false,
        detail: `could not resolve PR #${pr} head: ${(view.stderr || '').trim().split('\n')[0]}`,
      };
    try {
      const j = JSON.parse(view.stdout);
      head = head || j.headRefOid;
      if (!fullRepo) fullRepo = new URL(j.url).pathname.split('/').slice(1, 3).join('/');
    } catch {
      return { posted: false, detail: 'unparseable gh pr view output' };
    }
  }
  // A partial `gh pr view` payload used to reach `head.slice(...)` and throw out of a function whose
  // contract is that it never throws — masking the review verdict behind a stack trace.
  if (typeof head !== 'string' || head.length < 7)
    return { posted: false, detail: `no usable head sha for PR #${pr}` };
  if (!fullRepo) return { posted: false, detail: `no repo for PR #${pr}` };
  const r = run('gh', commitStatusArgs({ repo: fullRepo, sha: head, state, lens, description }), {
    encoding: 'utf8',
  });
  if (r.status !== 0)
    return { posted: false, detail: `gh api statuses failed: ${(r.stderr || '').trim().split('\n')[0]}` };
  return { posted: true, detail: `${state} on ${fullRepo}@${head.slice(0, 7)}` };
}

/** The reviewer CLI's version, for the record. Three states: a version, 'unknown', never a guess. */
export function cliVersionNote(agent, deps = {}) {
  const run = deps.spawn ?? spawnSync;
  const bin = { codex: 'codex', antigravity: 'agy', vibe: 'vibe', claude: 'claude' }[agent] || agent;
  const r = run(bin, ['--version'], { encoding: 'utf8' });
  const m = /\d+\.\d+\.\d+/.exec(`${r.stdout || ''}${r.stderr || ''}`);
  if (!m) return `${bin} version unknown`;
  if (agent === 'codex' && m[0] !== CODEX_VERIFIED) {
    return `${bin} ${m[0]} — ⚠ NOT the last verified version (${CODEX_VERIFIED}); the output guard still applied. Bump CODEX_VERIFIED in scripts/lib/review-guard.mjs after a clean run.`;
  }
  return `${bin} ${m[0]}`;
}

/** The hidden marker every review comment carries, so a later run knows WHAT was reviewed. */
export function reviewMarker({ lens = null, sha = null } = {}) {
  return `\n<!-- cross-review lens=${lens || 'general'} sha=${sha || 'unknown'} -->`;
}

/**
 * Re-review convergence (D8): Important-findings-only when this lens has ALREADY reviewed a DIFFERENT
 * commit. A retry on the SAME commit — the first run died posting its status, say — is not a re-review,
 * and suppressing its Should-fix and nits would silently shrink the only pass that PR ever got.
 * A comment with no marker predates them and is treated as a re-review: the conservative side.
 */
export function isReReview(commentBodies = [], lens = null, headSha = null) {
  const title =
    lens === 'security' ? /^### 🔐 Cross-agent review — security lens/m : /^### 🔎 Cross-agent review \(/m;
  const wanted = lens || 'general';
  return commentBodies.some((body) => {
    const b = String(body);
    if (!title.test(b)) return false;
    const m = /<!-- cross-review lens=(\S+) sha=(\S+) -->/.exec(b);
    if (!m) return true;
    if (m[1] !== wanted) return false;
    return !headSha || m[2] !== headSha;
  });
}

export const RE_REVIEW_NOTE =
  '\n\n## RE-REVIEW\nA previous pass already reviewed this PR and the author has pushed changes since. Report **Blocking and Should-fix findings only** — no nits, and do not repeat a finding the author has already fixed or answered on the PR.\n';
