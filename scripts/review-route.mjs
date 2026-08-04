#!/usr/bin/env node
// review-route.mjs — decide WHO reviews a PR, given who built it and what it risks.
//
// ── The problem this solves ───────────────────────────────────────────────────────────────────
// We build with several families now (Claude, Codex, agy, and any other CLI on the roster), not one.
// "Run cross-review" was unambiguous when one family built everything and another always reviewed; it is
// ambiguous the moment a Codex subagent writes the diff, because the default `--agent codex` would have
// **Codex reviewing Codex** — a same-family pass wearing the label of a cross-family one. That is a silent
// downgrade of the review layer, and nothing in a hand-driven flow would catch it.
//
// It also fixes the opposite waste. Before this script, a typical build ran ~THREE review passes: two
// cross-agent CLI passes AND the orchestrator spawning its own reviewer subagents in parallel, every time,
// regardless of tier. Two of those three were paying for the same read.
//
// ── Two axes of independence, and they are not interchangeable ────────────────────────────────
// WAYS-OF-WORKING distinguishes these; this tool makes the distinction executable.
//
//   FAMILY independence  — a different model family, with different blind spots.
//                          Delivered by cross-review.mjs (codex / agy / vibe / claude).
//   CONTEXT independence — an agent that did not hold the diff in its head while writing it.
//                          Delivered by a fresh reviewer SUBAGENT spawned by the orchestrator.
//
// Both matter. The second is expensive (it spends the orchestrator's own budget) and the first is not,
// so the policy below spends the first freely and the second only where it has earned its cost.
//
// ── The policy ────────────────────────────────────────────────────────────────────────────────
//   1. The builder's own family NEVER reviews its own diff.
//   2. TWO cross-family reviewers run on every PR — the top two of the preference order that did not
//      build it. Two, not one: a single external pass has no corroboration, and the families disagree
//      often enough that the second read is where the argued-down finding gets a second vote.
//   3. The fresh reviewer subagent is MANDATORY on HIGH tier and NEVER spawned on LOW tier.
//   4. If fewer than two external families are available, the layer is short — STOP AND ASK FOR A
//      REFUND before spending orchestrator subagents on it. See the refund pause below.
//
// Rule 3 is what makes this cheaper rather than merely different: a LOW-tier PR is reviewed by two
// external families plus the deterministic gate, and costs ZERO orchestrator review tokens. That is only
// safe because the gate carries the repetitive checking — WAYS-OF-WORKING's own instruction.
//
// ── The refund pause (rule 4) ─────────────────────────────────────────────────────────────────
// External quotas are refundable, quickly, by the product owner. Orchestrator subagent tokens are not —
// they come out of the same budget that is building the epic. So when a family caps, the correct move is
// NOT to quietly substitute a subagent; it is to say which pool is empty and ask, because the ask is
// cheap and the substitution is not. Silently swapping in a subagent also hides the fact that the
// cross-family layer went dark, and a missing layer that reads like a clean one is worse than no layer.
//
// The pause is not indefinite. `--fallback-after <minutes>` (default 30) states how long the run waits
// before proceeding with orchestrator subagents; whichever way it resolves, the outcome is recorded in
// the PR body so the downgrade is auditable rather than invisible.
//
// Usage:
//   node scripts/review-route.mjs --builder codex --tier low  <PR#> [--repo <owner/name>]
//   node scripts/review-route.mjs --builder claude --tier high <PR#> --run
//   node scripts/review-route.mjs --builder agy --tier low --json <PR#>

import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need, hasCmd, AGENT_BIN } from './lib/cross-agent-cli.mjs';

/** Who can BUILD. Every family on the roster can also build, which is exactly why rule 1 exists. */
export const BUILDERS = ['claude', 'codex', 'agy', 'vibe'];

/**
 * Cross-family reviewers in preference order.
 *
 * codex first: the established workhorse with the strongest observed review signal.
 * agy second: a genuinely separate quota pool (Gemini → GPT-OSS), so it survives a codex cap.
 * vibe third: Mistral — a fourth independent pool and a genuinely different family.
 * claude LAST, deliberately. Not because it reviews badly — it reviews well — but because Claude
 *   capacity is the scarcest resource in this operation and it is usually the thing BUILDING. Spending
 *   it on a review slot that three external pools can fill is the trade this order refuses to make.
 *   It rotates in the moment one of the three above is capped, which is the point of having it wired.
 */
export const CROSS_FAMILY_PREFERENCE = ['codex', 'agy', 'vibe', 'claude'];

/** How many cross-family passes a PR gets. Two — see rule 2. */
export const CROSS_FAMILY_COUNT = 2;

/** `cross-review.mjs --agent` takes the long name for antigravity; the rest match. */
const AGENT_FLAG = { codex: 'codex', agy: 'antigravity', vibe: 'vibe', claude: 'claude' };

/** Minutes to wait on a refund before falling back to orchestrator subagents. */
export const DEFAULT_FALLBACK_AFTER_MIN = 30;

/**
 * THE POLICY. Pure — no I/O, no availability probing — so it is pinned by tests and reads as one
 * decision rather than being spread through the runner.
 *
 * `available` lets the caller narrow to installed/uncapped CLIs without changing the policy itself.
 *
 * THROWS rather than die()s — a pure function that exits the process cannot be unit-tested, and the
 * policy is the one thing here most worth pinning. The CLI validates the same values at parse time, so
 * the user-facing error is unchanged.
 */
export function planReview({
  builder,
  tier,
  available = CROSS_FAMILY_PREFERENCE,
  forceFresh = false,
  fallbackAfterMin = DEFAULT_FALLBACK_AFTER_MIN,
}) {
  if (!BUILDERS.includes(builder)) throw new Error(`unknown builder '${builder}' (expected: ${BUILDERS.join(' | ')})`);
  if (!['low', 'high'].includes(tier)) throw new Error(`tier must be low or high, got '${tier}'`);

  // Rule 1 + 2: drop the builder's own family, then take the top CROSS_FAMILY_COUNT survivors.
  const eligible = CROSS_FAMILY_PREFERENCE.filter((f) => f !== builder && available.includes(f));
  const crossFamily = eligible.slice(0, CROSS_FAMILY_COUNT);
  const short = crossFamily.length < CROSS_FAMILY_COUNT;

  // Rule 3. HIGH tier always gets the fresh subagent — money/auth/migration/shared-infra diffs are where
  // context independence has repeatedly caught what every external family missed. LOW never does.
  const freshReviewer = tier === 'high' || forceFresh;

  // Rule 4. A short external layer is a REFUND ASK, not a licence to spend subagents. This flag is what
  // the orchestrator must act on before substituting anything.
  const refundPause = short
    ? {
        missing: CROSS_FAMILY_COUNT - crossFamily.length,
        capped: CROSS_FAMILY_PREFERENCE.filter((f) => f !== builder && !available.includes(f)),
        fallbackAfterMin,
      }
    : null;

  const reasons = [];
  if (crossFamily.length) {
    reasons.push(
      `${crossFamily.join(' + ')} review because ${builder} built it — a family never reviews its own diff.`
    );
  }
  if (short) {
    reasons.push(
      `SHORT a cross-family pass (${crossFamily.length}/${CROSS_FAMILY_COUNT} available` +
        `${refundPause.capped.length ? `; unavailable/capped: ${refundPause.capped.join(', ')}` : ''}). ` +
        `STOP AND ASK FOR A REFUND before spending orchestrator subagents — external quota is refundable ` +
        `in minutes and subagent tokens come out of the build budget. Proceed with subagents only after ` +
        `${fallbackAfterMin} minutes with no answer, and record the downgrade in the PR body.`
    );
  }
  if (!crossFamily.length) {
    reasons.push(
      `The cross-family layer is fully DARK for this PR — say so in the PR body rather than letting a ` +
        `missing layer look like a clean one.`
    );
  }
  reasons.push(
    freshReviewer
      ? tier === 'high'
        ? `Fresh reviewer subagent is MANDATORY on HIGH tier — context independence is the axis that catches money-path bugs the external families miss.`
        : `Fresh reviewer subagent requested explicitly on a LOW-tier PR.`
      : `NO fresh reviewer subagent: LOW tier. The two cross-family passes plus the deterministic gate carry it; the orchestrator does not spawn its own reviewers here.`
  );

  return {
    builder,
    tier,
    crossFamily,
    crossFamilyAgentFlags: crossFamily.map((f) => AGENT_FLAG[f]),
    short,
    refundPause,
    freshReviewer,
    // Review is inverted: the strongest model reads the riskiest diff.
    freshReviewerModel: freshReviewer ? 'the strongest available model' : null,
    reasons,
  };
}

/** The exact message to send the product owner when the external layer is short. */
export function renderRefundAsk(plan, pr) {
  const capped = plan.refundPause.capped;
  return [
    `⏸  REFUND ASK — PR #${pr}`,
    ``,
    `  The cross-family review layer is short ${plan.refundPause.missing} pass(es).`,
    capped.length ? `  Unavailable or quota-capped: ${capped.join(', ')}` : `  No other family is installed.`,
    ``,
    `  Refunding one of these is faster and cheaper than spending orchestrator subagents on the`,
    `  same read. Which can you top up?`,
    ``,
    `  Waiting ${plan.refundPause.fallbackAfterMin} min. With no answer by then this run proceeds with`,
    `  orchestrator subagents and records the downgrade in the PR body.`,
  ].join('\n');
}

/** Render the plan for a human, including the exact commands to run. */
export function renderPlan(plan, pr, repo) {
  const l = [];
  l.push(`Review plan — PR #${pr}${repo ? ` (${repo})` : ''}`);
  l.push(`  built by:       ${plan.builder}`);
  l.push(`  risk tier:      ${plan.tier.toUpperCase()}`);
  l.push(`  cross-family:   ${plan.crossFamily.join(' + ') || '⚠ NONE AVAILABLE'}${plan.short ? '  ⚠ SHORT' : ''}`);
  l.push(`  fresh subagent: ${plan.freshReviewer ? `YES (${plan.freshReviewerModel})` : 'no'}`);
  l.push('');
  for (const r of plan.reasons) l.push(`  · ${r}`);
  l.push('');
  if (plan.crossFamily.length) {
    l.push('  Run:');
    for (const flag of plan.crossFamilyAgentFlags) {
      l.push(`    node scripts/cross-review.mjs ${pr}${repo ? ` --repo ${repo}` : ''} --agent ${flag}`);
    }
  }
  if (plan.freshReviewer) {
    l.push(`    spawn a fresh reviewer subagent on PR #${pr}   (a DIFFERENT agent than the builder)`);
  }
  if (plan.refundPause) {
    l.push('');
    l.push(renderRefundAsk(plan, pr));
  }
  return l.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let builder = null;
  let tier = null;
  let pr = null;
  let repo = null;
  let run = false;
  let json = false;
  let forceFresh = false;
  let fallbackAfterMin = DEFAULT_FALLBACK_AFTER_MIN;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--builder') builder = need(argv[++i], '--builder');
    else if (a === '--tier') tier = need(argv[++i], '--tier');
    else if (a === '--repo') repo = need(argv[++i], '--repo');
    else if (a === '--fallback-after') fallbackAfterMin = Number(need(argv[++i], '--fallback-after'));
    else if (a === '--run') run = true;
    else if (a === '--json') json = true;
    else if (a === '--fresh') forceFresh = true;
    else if (!a.startsWith('-') && pr === null) pr = a;
    else die(`unknown argument '${a}'`);
  }
  if (!builder) die('--builder is required (who wrote the diff): ' + BUILDERS.join(' | '));
  if (!tier) die('--tier is required (low | high)');
  if (!pr) die('a PR number is required');
  // Validate here so the CLI fails fast with the house error style; planReview throws for callers.
  if (!BUILDERS.includes(builder)) die(`unknown --builder '${builder}' (expected: ${BUILDERS.join(' | ')})`);
  if (!['low', 'high'].includes(tier)) die(`--tier must be low or high, got '${tier}'`);
  if (!Number.isFinite(fallbackAfterMin) || fallbackAfterMin < 0) die('--fallback-after must be a non-negative number of minutes');

  // Availability narrows the choice but never the policy — an unavailable family is reported as a short
  // or dark layer rather than silently substituted.
  const available = CROSS_FAMILY_PREFERENCE.filter((f) => hasCmd(AGENT_BIN[AGENT_FLAG[f]]));
  const plan = planReview({ builder, tier, available, forceFresh, fallbackAfterMin });

  if (json) {
    writeSync(1, `${JSON.stringify({ pr, repo, ...plan }, null, 2)}\n`);
    return;
  }
  writeSync(1, `${renderPlan(plan, pr, repo)}\n`);

  if (run && plan.crossFamily.length) {
    let failed = 0;
    for (const flag of plan.crossFamilyAgentFlags) {
      const args = ['scripts/cross-review.mjs', String(pr), '--agent', flag];
      if (repo) args.push('--repo', repo);
      process.stderr.write(`\n▶ running cross-review with ${flag}…\n`);
      const r = spawnSync('node', args, { stdio: 'inherit' });
      // Keep going after a failure: one capped family must not cancel the other family's pass. The exit
      // code still reports that something went wrong.
      if ((r.status ?? 1) !== 0) failed++;
    }
    process.exit(failed ? 1 : 0);
  }
  if (run && !plan.crossFamily.length) {
    die('--run requested but no cross-family reviewer is available; the layer is dark for this PR.');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
