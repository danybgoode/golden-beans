// review-route.test.mjs — pins the review ROUTING POLICY. The runner is thin; the policy is the asset,
// and it is exactly the kind of rule that erodes silently (a same-family pass still produces output, so
// nothing fails when the routing quietly degrades). These tests are the thing that fails instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planReview,
  renderPlan,
  renderRefundAsk,
  BUILDERS,
  CROSS_FAMILY_PREFERENCE,
  CROSS_FAMILY_COUNT,
} from './review-route.mjs';

const ALL = CROSS_FAMILY_PREFERENCE;

test('rule 1: a family never reviews its own diff', () => {
  for (const builder of BUILDERS) {
    const plan = planReview({ builder, tier: 'low', available: ALL });
    assert.ok(!plan.crossFamily.includes(builder), `${builder} was routed to review its own diff`);
  }
});

test('rule 2: exactly two cross-family reviewers when the roster is healthy', () => {
  for (const builder of BUILDERS) {
    const plan = planReview({ builder, tier: 'low', available: ALL });
    assert.equal(plan.crossFamily.length, CROSS_FAMILY_COUNT);
    assert.equal(plan.short, false);
    assert.equal(plan.refundPause, null);
  }
});

test('preference order: claude is picked LAST, only when an external pool is missing', () => {
  // Healthy roster, Claude built it → the two externals ahead of claude in the order.
  assert.deepEqual(planReview({ builder: 'claude', tier: 'low', available: ALL }).crossFamily, ['codex', 'agy']);

  // Codex built it → agy + vibe. Claude stays out: three externals can still fill two slots.
  assert.deepEqual(planReview({ builder: 'codex', tier: 'low', available: ALL }).crossFamily, ['agy', 'vibe']);

  // Codex built it AND agy is capped → vibe + claude. Claude rotates in exactly here.
  assert.deepEqual(
    planReview({ builder: 'codex', tier: 'low', available: ['codex', 'vibe', 'claude'] }).crossFamily,
    ['vibe', 'claude']
  );
});

test('rule 3: the fresh subagent is mandatory on HIGH and never spawned on LOW', () => {
  assert.equal(planReview({ builder: 'claude', tier: 'high', available: ALL }).freshReviewer, true);
  assert.equal(planReview({ builder: 'codex', tier: 'high', available: ALL }).freshReviewer, true);
  assert.equal(planReview({ builder: 'claude', tier: 'low', available: ALL }).freshReviewer, false);
  // …even when a different family built it. HIGH is about the diff's risk, not the builder's identity.
  assert.equal(planReview({ builder: 'agy', tier: 'high', available: ALL }).freshReviewer, true);
});

test('rule 3: --fresh is the deliberate LOW-tier override, and it says so', () => {
  const plan = planReview({ builder: 'codex', tier: 'low', available: ALL, forceFresh: true });
  assert.equal(plan.freshReviewer, true);
  assert.match(plan.reasons.join('\n'), /requested explicitly on a LOW-tier PR/);
});

test('rule 4: a short roster raises a REFUND PAUSE rather than silently substituting subagents', () => {
  // Only codex left, and codex built it → zero eligible externals.
  const dark = planReview({ builder: 'codex', tier: 'low', available: ['codex'] });
  assert.deepEqual(dark.crossFamily, []);
  assert.equal(dark.short, true);
  assert.equal(dark.refundPause.missing, 2);
  assert.deepEqual(dark.refundPause.capped, ['agy', 'vibe', 'claude']);
  assert.match(dark.reasons.join('\n'), /REFUND/);
  assert.match(dark.reasons.join('\n'), /fully DARK/);

  // One survivor → still short by one, still a refund ask.
  const one = planReview({ builder: 'claude', tier: 'low', available: ['codex'] });
  assert.deepEqual(one.crossFamily, ['codex']);
  assert.equal(one.short, true);
  assert.equal(one.refundPause.missing, 1);
});

test('the refund ask names the capped pools and the fallback window', () => {
  const plan = planReview({ builder: 'claude', tier: 'low', available: ['codex'], fallbackAfterMin: 45 });
  const ask = renderRefundAsk(plan, 123);
  assert.match(ask, /PR #123/);
  assert.match(ask, /agy, vibe/); // the capped pools, named
  assert.match(ask, /45 min/);
  assert.match(ask, /records the downgrade in the PR body/);
});

test('a LOW-tier plan explicitly states that no orchestrator subagent runs', () => {
  // The regression this guards: the old flow spawned subagents on every build regardless of tier. The
  // plan must SAY it isn't doing that, so a reader can tell the difference between "skipped" and
  // "forgot".
  const plan = planReview({ builder: 'codex', tier: 'low', available: ALL });
  assert.match(plan.reasons.join('\n'), /does not spawn its own reviewers/);
});

test('renderPlan prints one runnable command per cross-family reviewer', () => {
  const plan = planReview({ builder: 'claude', tier: 'high', available: ALL });
  const out = renderPlan(plan, 42, 'owner/repo');
  assert.match(out, /--agent codex/);
  assert.match(out, /--agent antigravity/); // agy's flag value differs from its short name
  assert.match(out, /spawn a fresh reviewer subagent on PR #42/);
  assert.equal(out.match(/cross-review\.mjs/g).length, CROSS_FAMILY_COUNT);
});

test('invalid inputs throw rather than exiting the process', () => {
  assert.throws(() => planReview({ builder: 'nope', tier: 'low' }), /unknown builder/);
  assert.throws(() => planReview({ builder: 'claude', tier: 'medium' }), /tier must be low or high/);
});
