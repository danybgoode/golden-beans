#!/usr/bin/env node
// optimize/extract.mjs — the ONE number each Jev threshold acts on, per labelled fixture, read from the REAL Node
// judges (compiled-prompts S1.3). `refit.py` fits thresholds on these numbers; it never re-implements a judge.
//
//   node optimize/extract.mjs            write optimize/.cache/stats.json and print the parity summary
//   node optimize/extract.mjs --stdout   print the stats JSON instead of writing it
//
// Offline by construction: every answer is REPLAYED from scripts/jev-eval.fixtures.json (`replayAsk`), so there is no
// key, no egress and no cost. Dev-only (D4): it lives outside the kit and imports the monorepo's own scripts/.
//
// The reduction, per rail:
//   review  one Jev probability per fixture (`is_real_review`) plus the regex's own verdict. The judge passes at
//           noul ≥ real, fails at noul ≤ notReal, and lets the regex decide between. `noul: null` means Jev's answer
//           never reached the decision (an empty reply or a tool transcript, decided mechanically).
//   prose   per family, the highest noul at which the judge RAISES that family's finding — found by asking the real
//           judge at each recorded noul of that family, so the evidence gates, `liveFlags` corroboration and the
//           heading filter are applied by the judge itself, never copied here. `null` = not raised at any threshold.
//
// THE PARITY CHECK: the reduction must reproduce the judge's decision on every fixture at every threshold of a grid.
// A reduction that drifts from the judge would fit a rule the kit does not run, so a single mismatch is an error.
//
// Zero deps — Node 18+.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES_PATH, loadRails, replayAsk } from '../scripts/jev-eval.mjs';
import { loadJevConfig, parseJevConfig, repoRoot } from '../scripts/lib/jev.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATS_PATH = join(__dirname, '.cache', 'stats.json');

/** A threshold grid, 0.05 … 0.95. */
export const GRID = Array.from({ length: 19 }, (_, i) => Math.round((i + 1) * 5) / 100);

/** Jev config for one rail at the given thresholds, forced to decide with Jev — as `jev-eval` scores it. */
export function railConfig(base, rail, thresholds) {
  return parseJevConfig({
    model: base.model,
    egress: true,
    rails: { ...base.rails, [rail]: { ...base.rails[rail], mode: 'jev', shadowExpires: null, thresholds } },
  });
}

const deps = (fx, config) => ({ config, key: 'eval', log: () => {}, ask: replayAsk(fx.recorded) });

/** Pure: the review rule over the reduced statistic. */
export const reviewDecision = (s, { real, notReal }) =>
  s.noul === null ? s.regexOk : s.noul >= real ? true : s.noul <= notReal ? false : s.regexOk;

/** Pure: the prose rule over the reduced statistic — the families raised at `claim`, sorted. */
export const proseDecision = (s, claim) =>
  Object.entries(s.stats)
    .filter(([, v]) => v !== null && v >= claim)
    .map(([code]) => code)
    .sort();

/** Per-fixture review statistics, from the real judge. */
export async function reviewStats(fixtures, rails, base) {
  const out = [];
  for (const fx of fixtures) {
    let asked = false;
    const d = deps(fx, railConfig(base, 'review', base.rails.review.thresholds));
    const inner = d.ask;
    d.ask = (req) => ((asked = true), inner(req));
    const decision = await rails.review.run(fx, d);
    const raw = fx.recorded?.answers?.is_real_review?.noul;
    const reached = asked && typeof raw === 'number' && raw >= 0 && raw <= 1;
    out.push({ id: fx.id, label: fx.label, noul: reached ? raw : null, regexOk: decision.regexOk });
  }
  return out;
}

/** Per-fixture prose statistics: for each family, the highest recorded noul at which the real judge raises it. */
export async function proseStats(fixtures, rails, base, families) {
  const out = [];
  for (const fx of fixtures) {
    const stats = {};
    for (const f of families) {
      const values = [
        ...new Set(
          Object.entries(fx.recorded?.answers ?? {})
            .filter(([id]) => id.endsWith(`_${f.key}`))
            .map(([, a]) => a?.noul)
            .filter((v) => typeof v === 'number')
        ),
      ].sort((a, b) => b - a);
      stats[f.code] = null;
      for (const v of values) {
        const d = await rails.prose.run(fx, deps(fx, railConfig(base, 'prose', { claim: v })));
        if (rails.prose.predicted(d).includes(f.code)) {
          stats[f.code] = v;
          break;
        }
      }
    }
    out.push({ id: fx.id, label: [...fx.label].sort(), stats });
  }
  return out;
}

/** The parity check: the reduction vs the real judge, every fixture × every grid point. */
export async function parity({ fixtures, rails, base, review, prose }) {
  let checks = 0;
  const mismatches = [];
  for (const real of GRID)
    for (const notReal of GRID.filter((t) => t < real))
      for (const [i, fx] of fixtures.review.entries()) {
        const d = await rails.review.run(fx, deps(fx, railConfig(base, 'review', { real, notReal })));
        checks++;
        if (d.ok !== reviewDecision(review[i], { real, notReal }))
          mismatches.push(`review/${fx.id} at ${real}/${notReal}`);
      }
  for (const claim of GRID)
    for (const [i, fx] of fixtures.prose.entries()) {
      const d = await rails.prose.run(fx, deps(fx, railConfig(base, 'prose', { claim })));
      checks++;
      if (JSON.stringify(rails.prose.predicted(d)) !== JSON.stringify(proseDecision(prose[i], claim)))
        mismatches.push(`prose/${fx.id} at ${claim}`);
    }
  return { checks, mismatches };
}

/** Everything refit.py needs, plus the parity result. Pure over its inputs apart from the judge calls. */
export async function extract({ fixtures, rails, base, families }) {
  const review = await reviewStats(fixtures.review, rails, base);
  const prose = await proseStats(fixtures.prose, rails, base, families);
  const check = await parity({ fixtures, rails, base, review, prose });
  return {
    model: base.model,
    thresholds: { ...base.rails.review.thresholds, ...base.rails.prose.thresholds },
    families: families.map((f) => f.code),
    review,
    prose,
    parity: {
      checks: check.checks,
      mismatches: check.mismatches.length,
      first: check.mismatches.slice(0, 5),
    },
  };
}

async function main() {
  const root = repoRoot();
  const { PROSE_FAMILIES } = await import('../scripts/lib/prose-guard.mjs');
  const out = await extract({
    fixtures: JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')),
    rails: await loadRails(),
    base: loadJevConfig({ root }),
    families: PROSE_FAMILIES,
  });
  const text = `${JSON.stringify(out, null, 2)}\n`;
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else {
    mkdirSync(dirname(STATS_PATH), { recursive: true });
    writeFileSync(STATS_PATH, text);
    process.stderr.write(
      `extract: ${out.review.length} review + ${out.prose.length} prose fixtures → ${STATS_PATH}\n` +
        `parity: ${out.parity.checks} checks against the real judges, ${out.parity.mismatches} mismatch(es)\n`
    );
  }
  if (out.parity.mismatches) {
    process.stderr.write(`extract: the reduction drifted from the judge — ${out.parity.first.join('; ')}\n`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((e) => {
    process.stderr.write(`extract: ${e.message}\n`);
    process.exit(1);
  });
