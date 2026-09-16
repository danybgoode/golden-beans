import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertReviewOutput,
  commitStatusArgs,
  decideSecurityPass,
  globToRegExp,
  isReReview,
  parseReviewConfig,
  postReviewStatus,
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

test('re-review detection is per lens', () => {
  const general = '### 🔎 Cross-agent review (Codex)\n\n> banner';
  const security = '### 🔐 Cross-agent review — security lens (Codex)';
  assert.equal(isReReview([general], null), true);
  assert.equal(isReReview([general], 'security'), false);
  assert.equal(isReReview([security], 'security'), true);
  assert.equal(isReReview(['lgtm'], null), false);
});
