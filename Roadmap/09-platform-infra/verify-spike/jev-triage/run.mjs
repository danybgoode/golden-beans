#!/usr/bin/env node
// verify-spike S1.3 — Jev triage, in SHADOW: nothing gates on these answers, they are only logged.
//
//   node Roadmap/09-platform-infra/verify-spike/jev-triage/run.mjs            # asks Jev, writes answers.json
//
// For each merged PR that touched the outbox or the flag evaluator, Jev gets the two specs' one-line
// summaries plus the PR's title and its diff on those paths, and answers the four triage questions.
// Egress: honours jev.config.json (`egress` must be true) and TYPESAFE_API_KEY, through the same
// askJev() every other Jev caller uses. The code sent is this public repository's own history.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const { askJev, loadJevConfig, DEFAULT_MODEL } = await import(resolve(root, 'scripts/lib/jev.mjs'));

const config = loadJevConfig({ root });
if (config.egress !== true) {
  console.error('jev.egress is not true — refusing to send anything. Nothing was asked.');
  process.exit(2);
}

// The PRs, newest first: every merged commit on main that touched these paths (git log, 2026-09-29).
const PRS = [
  '7f81540',
  '20cecfb',
  '0a0beb0',
  'b473d13',
  'c258a18',
  'bc1abba',
  '9977c5a',
  '015eae4',
  'ce65993',
];
const PATHS = [
  'apps/web/supabase/migrations/*deliver*',
  'apps/web/supabase/migrations/*fanout*',
  'apps/web/supabase/migrations/*destination*',
  'apps/web/lib/delivery-dispatch.ts',
  'apps/web/lib/deliveries.ts',
  'apps/web/lib/webhook-delivery.ts',
  'apps/web/lib/retry-policy.ts',
  'packages/sdk/src/flags.ts',
];
const DIFF_BUDGET = 60_000;

const SPECS = {
  outbox:
    'Quint model of the event-delivery outbox (event_deliveries status machine pending → in_flight → delivered | failed | dead; ' +
    'claim_deliveries with stale reclaim; settle_delivery guarded by a claim token; release; replay; delete_destination). ' +
    'Invariants: no delivery row vanishes; no re-queueable row points at a deleted destination; attempt_count stays within the ' +
    'retry budget; real sends per row stay within the budget; nothing is sent after delivered/dead; no in_flight row is stranded.',
  flagEvaluator:
    'Lean 4 model of evaluateFlag and explainFlagEvaluation in packages/sdk/src/flags.ts (clause matching, rollout outcome with an ' +
    'uninterpreted hash, first-match-by-priority). Theorems: the explanation names the same variant, reason and rule as the verdict ' +
    'for a type-correct call; a type-incorrect call always disagrees; one explanation line per rule; at most one matched rule.',
};

const QUESTIONS = {
  touches_spec: {
    type: 'noul',
    instructions:
      'Two formal specs describe parts of this codebase (see state.specs). Does this pull request change behaviour that either spec describes — so that the spec could now be wrong, or a checked property could now fail?',
    criteria: {
      true: 'Yes: the diff changes logic, SQL, state transitions, matching or ordering that a spec models.',
      false:
        'No: the diff only changes comments, docs, names, types, UI copy or code the specs do not model.',
    },
  },
  counterexample_class: {
    type: 'choice',
    instructions:
      'If this change introduced a defect in the specified behaviour, which kind of counterexample would a checker most likely produce?',
    criteria: {
      none: 'The change cannot affect the specified behaviour.',
      lost_or_orphaned_delivery: 'A delivery row vanishes or can never be claimed again.',
      duplicate_or_unbounded_send:
        'The same event is sent more times than the budget allows, or after it finished.',
      stuck_row: 'A row is stranded in_flight or in a state nothing advances.',
      budget_violation:
        'attempt_count exceeds the retry budget, or dead-lettering happens too early or never.',
      explain_verdict_disagreement: 'The flag explanation disagrees with the value actually served.',
      other: 'A different class of defect.',
    },
  },
  obligation_difficulty: {
    type: 'choice',
    instructions: 'What would it take to keep the formal verification honest after this change?',
    criteria: {
      none: 'Nothing: the specs are unaffected.',
      rerun: 'Re-run the existing checks; the specs still describe the code.',
      update_spec: 'Edit the spec to mirror the change, then re-run the checks.',
      new_property: 'Add a new invariant or theorem the change introduces.',
      new_technique: 'The change needs a modelling or proof technique the specs do not use yet.',
    },
  },
  verify_depth: {
    type: 'choice',
    instructions: 'How much verification does this pull request deserve before merge?',
    criteria: {
      off: 'None — it cannot affect specified behaviour.',
      light: 'Re-run the existing model checks and proofs in CI.',
      standard: 'Update the spec and run a bounded model check or differential test.',
      deep: 'New invariants or proofs, plus a human reading the counterexamples.',
    },
  },
};

const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();

const results = [];
for (const sha of PRS) {
  const title = git('log', '-1', '--format=%s', sha).trim();
  // Against the FIRST parent: `git show` on a merge commit prints a combined diff, which is empty
  // for a clean merge — two of these PRs landed as merge commits and would otherwise send no code.
  const stat = git('diff', '--stat', `${sha}^1`, sha, '--', ...PATHS).trim();
  let diff = git('diff', `${sha}^1`, sha, '--', ...PATHS);
  const truncated = diff.length > DIFF_BUDGET;
  if (truncated) diff = `${diff.slice(0, DIFF_BUDGET)}\n… [diff truncated at ${DIFF_BUDGET} chars]`;
  const state = { specs: SPECS, pullRequest: { title, filesChanged: stat, diff } };
  const started = Date.now();
  const res = await askJev({ state, questions: QUESTIONS }, { timeoutMs: 30_000 });
  const ms = Date.now() - started;
  const row = res.ok
    ? {
        sha,
        title,
        truncated,
        ms,
        model: res.model,
        touches_spec: res.answers.touches_spec?.noul ?? null,
        counterexample_class: res.answers.counterexample_class?.choice ?? null,
        obligation_difficulty: res.answers.obligation_difficulty?.choice ?? null,
        verify_depth: res.answers.verify_depth?.choice ?? null,
        usage: res.usage,
      }
    : { sha, title, truncated, ms, error: res.error ?? res.state };
  console.log(JSON.stringify(row));
  results.push(row);
}
writeFileSync(
  resolve(here, 'answers.json'),
  `${JSON.stringify({ askedAt: new Date().toISOString(), model: DEFAULT_MODEL, questions: QUESTIONS, results }, null, 2)}\n`
);
