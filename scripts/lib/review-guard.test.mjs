import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertReviewOutput,
  changedFileCount,
  commitStatusArgs,
  decideSecurityPass,
  globToRegExp,
  isReReview,
  parseReviewConfig,
  postReviewStatus,
  reviewMarker,
} from './review-guard.mjs';

// Real reply shapes, excerpted from cross-review comments posted on this operation's PRs. Measured
// 2026-09-16 over 229 historical reviews: the guard accepts 227 and rejects exactly the two that were
// broken (vibe emitting a raw tool call instead of a review).
const REAL_OK = [
  '### Blocking\n\n- `.claude/settings.json`: `Bash(git add *)` permits `git add -u`.',
  'Clean.',
  'Clean — documentation updates are consistent, all cross-references resolve.',
  '## Findings\n\n**Clean** — the PR correctly addresses the agy 1.1.11 tabular model output change.',
  '### **Blocking**\n- **Unmounted `<dialog>` in `AIAgentButton` skips `.close()`**',
  '**Scope: 3 FILE(S) ONLY.** This reviewer was given a targeted subset.\n\n### Review Findings\n\n**Diff Assessment: Clean**\n\nNo **Blocking**, **Should-fix**, or **Nit** findings.',
  'This advisory review carries weight.\n\n### **Blocking**\n- **x**',
  '🔴 Important: the webhook handler trusts `event.account` from the body.',
  'No security findings in this diff.',
];
const REAL_BROKEN = [
  'read_file{"path": "/Users/x/scripts/agy-doctor.mjs"}',
  'write_fileémonie{"file_path": "/Users/x/.vibe/plans/p.md", "content": "## Findings\\n\\n**Blocking**: None"}',
  // The same failure with REAL newlines in the payload: without the tool-call rule this reads as a
  // severity-structured review and would be posted as one.
  'write_file{"file_path": "/Users/x/.vibe/plans/p.md", "content": "\n## Findings\n\n**Blocking**: None\n\n**Nit**: none\n"}',
];

test('accepts every real review shape, including terse clean verdicts', () => {
  for (const t of REAL_OK) assert.equal(assertReviewOutput(t).ok, true, t.slice(0, 60));
});

test('rejects the real broken replies — a tool call is not a review even if its JSON contains review words', () => {
  for (const t of REAL_BROKEN) assert.equal(assertReviewOutput(t).ok, false, t.slice(0, 60));
});

test('rejects empty, whitespace and structureless output — the silent-CLI failure', () => {
  for (const t of [
    '',
    '   \n\t',
    null,
    undefined,
    'OpenAI Codex v0.154.0 (research preview)\n--------\nworkdir: /tmp',
    'Error: rate limited, try again later',
  ]) {
    const v = assertReviewOutput(t);
    assert.equal(v.ok, false, String(t));
    assert.ok(v.reason.length > 10);
  }
});

test('glob: ** spans directories, * stays within a segment', () => {
  assert.equal(globToRegExp('app/api/**').test('app/api/checkout/route.ts'), true);
  assert.equal(globToRegExp('**/auth/**').test('apps/web/lib/auth/session.ts'), true);
  assert.equal(globToRegExp('**/auth/**').test('auth/x.ts'), true);
  assert.equal(globToRegExp('supabase/migrations/*.sql').test('supabase/migrations/2026_x.sql'), true);
  assert.equal(globToRegExp('supabase/migrations/*.sql').test('supabase/migrations/old/2026_x.sql'), false);
  assert.equal(globToRegExp('**/*stripe*').test('lib/payments/stripe-connect.ts'), true);
});

test('security pass: path match or declared high risk triggers; neither does not', () => {
  const securityPaths = ['**/checkout/**', '**/webhooks/**', 'middleware.ts'];
  assert.equal(
    decideSecurityPass({ files: [{ path: 'app/api/checkout/route.ts' }], securityPaths }).run,
    true
  );
  assert.equal(decideSecurityPass({ files: ['middleware.ts'], securityPaths }).run, true);
  assert.equal(
    decideSecurityPass({ files: ['docs/readme.md'], body: '**Risk tier: HIGH** (auth)', securityPaths }).run,
    true
  );
  assert.equal(
    decideSecurityPass({ files: ['docs/readme.md'], body: 'Risk tier: LOW', securityPaths }).run,
    false
  );
  assert.equal(
    decideSecurityPass({ files: ['components/Button.tsx'], body: 'high quality docs', securityPaths }).run,
    false
  );
});

test("the SHIPPED globs trigger on an App Router's route files, not just on basenames", () => {
  // Every route file in an App Router is called `route.ts`, so a basename glob like `**/*webhook*` is
  // near-dead there — the directory carries the meaning. Found by the fresh review of dobby-foundation#11.
  // Derived from THIS repo's own config: a hardcoded path silently stops testing anything in a repo
  // whose globs differ.
  const cfg = parseReviewConfig(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'review-config.json'), 'utf8')
    )
  );
  const materialise = (glob) =>
    glob
      .replace(/\*\*\//g, 'x/')
      .replace(/\/\*\*/g, '/x')
      .replace(/\*/g, 'x');
  for (const glob of cfg.securityPaths) {
    const path = materialise(glob);
    assert.equal(
      decideSecurityPass({ files: [path], securityPaths: cfg.securityPaths }).run,
      true,
      `glob ${glob} does not match its own shape ${path}`
    );
    // The App Router case: a file INSIDE a security directory, named route.ts like every other one.
    if (glob.endsWith('/**')) {
      const routeFile = `${materialise(glob.slice(0, -3))}/route.ts`;
      assert.equal(
        decideSecurityPass({ files: [routeFile], securityPaths: cfg.securityPaths }).run,
        true,
        `a route file under ${glob} does not trigger: ${routeFile}`
      );
    }
  }
  for (const p of ['components/Button.tsx', 'docs/readme.md', 'Roadmap/09-platform-infra/x/README.md']) {
    assert.equal(
      decideSecurityPass({ files: [p], securityPaths: cfg.securityPaths }).run,
      false,
      `should NOT trigger: ${p}`
    );
  }
});

test('a TRUNCATED file list forces the lens on instead of reading as "no security path"', () => {
  // gh pr view --json files caps at 100 with no signal (a real 108-file PR returned 100).
  const securityPaths = ['**/auth/**'];
  const hundred = Array.from({ length: 100 }, (_, i) => `components/C${i}.tsx`);
  const cut = decideSecurityPass({ files: hundred, securityPaths, totalFiles: 108 });
  assert.equal(cut.run, true);
  assert.match(cut.reason, /truncated \(100 of 108/);
  // A complete list with nothing matching stays off — the guard must allow the negation.
  assert.equal(decideSecurityPass({ files: hundred, securityPaths, totalFiles: 100 }).run, false);
  // An UNREADABLE count at the cap must not fail open (codex ×2 and the security lens, #145/#178).
  const unknown = decideSecurityPass({ files: hundred, securityPaths, totalFiles: null });
  assert.equal(unknown.run, true);
  assert.match(unknown.reason, /could not be read — lens forced on/);
  // Under the cap the list is complete: a missing count changes nothing.
  assert.equal(
    decideSecurityPass({ files: hundred.slice(0, 40), securityPaths, totalFiles: null }).run,
    false
  );
});

test('changedFileCount reads the REST count and never guesses', () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push(args);
    return { status: 0, stdout: '108\n' };
  };
  assert.equal(changedFileCount({ pr: 399, repo: 'o/r' }, { spawn }), 108);
  assert.deepEqual(calls[0].slice(0, 2), ['api', 'repos/o/r/pulls/399']);
  assert.equal(
    changedFileCount({ pr: 1, repo: 'o/r' }, { spawn: () => ({ status: 1, stderr: 'HTTP 404' }) }),
    null
  );
  assert.equal(
    changedFileCount({ pr: 1, repo: 'o/r' }, { spawn: () => ({ status: 0, stdout: 'null' }) }),
    null
  );
});

test('a plain-prose "low-risk high-value" body is not a risk declaration', () => {
  const securityPaths = ['**/auth/**'];
  assert.equal(
    decideSecurityPass({ files: ['x.md'], body: 'a low-risk high-value change', securityPaths }).run,
    false
  );
  assert.equal(
    decideSecurityPass({ files: ['x.md'], body: '**Risk tier: HIGH** (auth)', securityPaths }).run,
    true
  );
});

test('review config is validated, never defaulted', () => {
  assert.deepEqual(
    parseReviewConfig({ reviewScope: 'every-pr', securityPaths: ['**/auth/**'] }).reviewScope,
    'every-pr'
  );
  assert.throws(() => parseReviewConfig({ reviewScope: 'sometimes', securityPaths: ['x'] }), /reviewScope/);
  assert.throws(() => parseReviewConfig({ reviewScope: 'every-pr', securityPaths: [] }), /securityPaths/);
  assert.throws(() => parseReviewConfig(null), /not an object/);
});

test('status args name the lens as the context', () => {
  const a = commitStatusArgs({
    repo: 'o/r',
    sha: 'abc',
    state: 'failure',
    lens: 'security',
    description: 'x'.repeat(200),
  });
  assert.deepEqual(a.slice(0, 4), ['api', '--method', 'POST', 'repos/o/r/statuses/abc']);
  assert.ok(a.includes('context=cross-review/security'));
  assert.ok(a.includes('state=failure'));
  assert.equal(a.find((x) => x.startsWith('description=')).length, 'description='.length + 140);
  assert.ok(
    commitStatusArgs({ repo: 'o/r', sha: 's', state: 'success' }).includes('context=cross-review/general')
  );
});

test('postReviewStatus resolves the head, posts, and reports a failure instead of throwing', () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push(args);
    if (args[0] === 'pr')
      return {
        status: 0,
        stdout: JSON.stringify({ headRefOid: 'deadbeefcafe', url: 'https://github.com/o/r/pull/7' }),
      };
    return { status: 0, stdout: '{}' };
  };
  const ok = postReviewStatus({ pr: 7, state: 'success', lens: null, description: 'd' }, { spawn });
  assert.equal(ok.posted, true);
  assert.equal(calls[1][3], 'repos/o/r/statuses/deadbeefcafe');
  const down = postReviewStatus(
    { pr: 7, repo: 'o/r', state: 'failure', description: 'd' },
    { spawn: () => ({ status: 1, stderr: 'HTTP 404' }) }
  );
  assert.equal(down.posted, false);
  assert.match(down.detail, /404/);
});

test('a RETRY on the same commit is not a re-review — only a new commit is', () => {
  const first = `### 🔎 Cross-agent review (Codex)${reviewMarker({ sha: 'aaa111' })}`;
  // Same commit: the previous run may have died posting its status. Suppressing Should-fix and nits
  // here would silently shrink the only review that PR ever got.
  assert.equal(isReReview([first], null, 'aaa111'), false);
  // New commit: the author pushed a fix — Blocking/Should-fix only.
  assert.equal(isReReview([first], null, 'bbb222'), true);
  // A comment from before markers existed: conservative side, treat as a re-review.
  assert.equal(isReReview(['### 🔎 Cross-agent review (Codex)'], null, 'aaa111'), true);
  // The security lens's own marker does not silence the general pass, or vice versa.
  const sec = `### 🔐 Cross-agent review — security lens (Codex)${reviewMarker({ lens: 'security', sha: 'aaa111' })}`;
  assert.equal(isReReview([sec], null, 'aaa111'), false);
  assert.equal(isReReview([sec], 'security', 'aaa111'), false);
  assert.equal(isReReview([sec], 'security', 'ccc333'), true);
});

test('postReviewStatus pins the reviewed sha and refuses a partial payload instead of throwing', () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push(args);
    return { status: 0, stdout: '{}' };
  };
  // With an explicit sha and repo it never needs to ask gh where the head is — so a push mid-review
  // cannot move the status onto an unreviewed commit.
  const pinned = postReviewStatus(
    { pr: 7, repo: 'o/r', state: 'success', sha: 'deadbeefcafe', description: 'd' },
    { spawn }
  );
  assert.equal(pinned.posted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], 'repos/o/r/statuses/deadbeefcafe');
  const partial = postReviewStatus(
    { pr: 7, state: 'success', description: 'd' },
    { spawn: () => ({ status: 0, stdout: '{"url":"https://github.com/o/r/pull/7"}' }) }
  );
  assert.equal(partial.posted, false);
  assert.match(partial.detail, /no usable head sha/);
});

test('re-review detection is per lens', () => {
  const general = '### 🔎 Cross-agent review (Codex)\n\n> banner';
  const security = '### 🔐 Cross-agent review — security lens (Codex)';
  assert.equal(isReReview([general], null), true);
  assert.equal(isReReview([general], 'security'), false);
  assert.equal(isReReview([security], 'security'), true);
  assert.equal(isReReview(['lgtm'], null), false);
});
