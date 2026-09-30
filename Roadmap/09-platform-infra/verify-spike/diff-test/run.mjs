#!/usr/bin/env node
// verify-spike S1.2 — differential test: the Lean model vs the shipped TypeScript evaluator.
//
//   node Roadmap/09-platform-infra/verify-spike/diff-test/run.mjs [cases=2000] [seed=1]
//
// Generates seeded random (definition × context × call) cases, runs the REAL `evaluateFlag` and
// `explainFlagEvaluation` from packages/sdk/src/flags.ts, computes the rollout admission with the
// REAL FNV-1a (`deterministicFraction`) as an oracle table, runs the compiled Lean model on the same
// cases (lean/.lake/build/bin/flageval — build it with `lake build flageval`), and compares:
//   (1) TS verdict      vs Lean verdict
//   (2) TS explanation  vs Lean explanation (every per-rule outcome)
//   (3) TS verdict      vs TS explanation  — the agreement theorem, checked on the shipped code
// Exits non-zero on any disagreement. The hash is the ONE thing not under test (it is
// uninterpreted in the Lean model by design), so admissions come from the oracle.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const { evaluateFlag, explainFlagEvaluation, parseFlagDefinition } = await import(
  resolve(root, 'packages/sdk/src/flags.ts')
);
const { deterministicFraction } = await import(resolve(root, 'packages/sdk/src/bucketing.ts'));
const leanBin = resolve(here, '../lean/.lake/build/bin/flageval');

const CASES = Number(process.argv[2] ?? 2000);
let seed = Number(process.argv[3] ?? 1) >>> 0;
// mulberry32 — seeded, so every run is reproducible
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const chance = (p) => rand() < p;

const FIELDS = ['source', 'channel', 'campaign', 'plan', 'region'];
// Deliberately confusable scalars: "1" vs 1, "true" vs true.
const SCALARS = ['a', 'b', '1', 'true', 1, 2, true, false];
// Deliberately awkward targeting keys: JS trim() blanks, non-ASCII whitespace, a real key.
const TARGETING_KEYS = ['user-1', 'user-2', 'user-3', '', '   ', ' ', '﻿', ' ', ' x', '\u0085', '᠎'];
const VARIANTS = ['control', 'treat', 'alt'];

const tag = (v) =>
  typeof v === 'string' ? { t: 'str', v } : typeof v === 'number' ? { t: 'num', v } : { t: 'bool', v };

function genDefinition() {
  const variants = VARIANTS.slice(0, 1 + Math.floor(rand() * 3)).map((key) => ({ key, value: `v-${key}` }));
  const keys = variants.map((v) => v.key);
  const priorities = new Set();
  const rules = Array.from({ length: Math.floor(rand() * 6) }, () => {
    let priority;
    do priority = Math.floor(rand() * 20);
    while (priorities.has(priority));
    priorities.add(priority);
    const clauses = Array.from({ length: Math.floor(rand() * 3) }, () =>
      chance(0.5)
        ? { field: pick(FIELDS), operator: 'equals', value: pick(SCALARS) }
        : { field: pick(FIELDS), operator: 'one_of', values: [pick(SCALARS), pick(SCALARS)] }
    );
    const rule = { priority, clauses, variantKey: pick(keys) };
    if (chance(0.45)) rule.rollout = { basisPoints: pick([0, 1, 2500, 5000, 9999, 10000]) };
    return rule;
  });
  return { valueType: 'string', description: 'diff-test', defaultVariantKey: pick(keys), variants, rules };
}

function genContext() {
  const ctx = {};
  for (const f of FIELDS) if (chance(0.55)) ctx[f] = pick(SCALARS);
  if (chance(0.8)) ctx.targetingKey = pick(TARGETING_KEYS);
  return ctx;
}

// A type-correct call, or one of the two ways a call can be type-incorrect.
function genCall() {
  const r = rand();
  if (r < 0.8) return { expectedType: 'string', defaultValue: 'fallback', callTypeOk: true };
  if (r < 0.9) return { expectedType: 'boolean', defaultValue: false, callTypeOk: false }; // valueType ≠ expectedType
  return { expectedType: 'string', defaultValue: 42, callTypeOk: false }; // defaultValue of the wrong type
}

const cases = [];
let rejected = 0;
while (cases.length < CASES) {
  const definition = genDefinition();
  if (!parseFlagDefinition(definition).ok) {
    rejected++;
    continue;
  }
  const flag = { key: `flag.${cases.length % 7}`, definitionVersion: 1 + Math.floor(rand() * 3), definition };
  const context = genContext();
  const call = genCall();
  const tsVerdict = evaluateFlag({
    flag,
    context,
    defaultValue: call.defaultValue,
    expectedType: call.expectedType,
  });
  const tsExplain = explainFlagEvaluation({ flag, context });
  // The oracle: real FNV admission for every rollout rule, whenever the targeting key is a string.
  // Blankness is NOT pre-judged here, so the Lean model's own JS-whitespace rule is under test.
  const admits =
    typeof context.targetingKey === 'string'
      ? definition.rules
          .filter((r) => r.rollout)
          .map((r) => ({
            priority: r.priority,
            admitted:
              deterministicFraction(
                JSON.stringify([context.targetingKey, flag.key, flag.definitionVersion, r.priority])
              ) <
              r.rollout.basisPoints / 10_000,
          }))
      : [];
  cases.push({
    input: {
      id: cases.length,
      flagKey: flag.key,
      definitionVersion: flag.definitionVersion,
      definition: {
        defaultVariantKey: definition.defaultVariantKey,
        variantKeys: definition.variants.map((v) => v.key),
        rules: definition.rules.map((r) => ({
          priority: r.priority,
          variantKey: r.variantKey,
          clauses: r.clauses.map((c) =>
            c.operator === 'equals'
              ? { field: c.field, operator: 'equals', value: tag(c.value) }
              : { field: c.field, operator: 'one_of', values: c.values.map(tag) }
          ),
          ...(r.rollout ? { rolloutBasisPoints: r.rollout.basisPoints } : {}),
        })),
      },
      context: Object.entries(context).map(([field, value]) => ({ field, value: tag(value) })),
      admits,
      callTypeOk: call.callTypeOk,
    },
    tsVerdict,
    tsExplain,
    call,
    context,
  });
}

const started = performance.now();
const leanOut = JSON.parse(
  execFileSync(leanBin, {
    input: JSON.stringify(cases.map((c) => c.input)),
    maxBuffer: 256 * 1024 * 1024,
  }).toString()
);
const leanMs = performance.now() - started;

const failures = [];
const counts = { reasons: {}, outcomes: {}, callSiteGap: 0, blankKeyCases: 0 };
// Key-order-independent: Lean's JSON encoder sorts object keys, JS preserves insertion order.
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon(v[k])])
        )
      : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
for (const [i, c] of cases.entries()) {
  const lean = leanOut[i];
  const ts = {
    verdict: {
      variant: c.tsVerdict.variant ?? null,
      reason: c.tsVerdict.reason,
      rulePriority: c.tsVerdict.rulePriority ?? null,
    },
    explanation: {
      variantKey: c.tsExplain.variantKey,
      reason: c.tsExplain.reason,
      matchedPriority: c.tsExplain.matched?.priority ?? null,
      rules: c.tsExplain.rules.map((r) => ({ priority: r.priority, outcome: r.outcome })),
    },
  };
  counts.reasons[ts.verdict.reason] = (counts.reasons[ts.verdict.reason] ?? 0) + 1;
  for (const r of ts.explanation.rules) counts.outcomes[r.outcome] = (counts.outcomes[r.outcome] ?? 0) + 1;
  if (typeof c.context.targetingKey === 'string' && c.context.targetingKey.trim() === '')
    counts.blankKeyCases++;
  if (!same(ts.verdict, lean.verdict))
    failures.push({ id: i, kind: 'verdict: TS ≠ Lean', ts: ts.verdict, lean: lean.verdict });
  if (!same(ts.explanation, lean.explanation))
    failures.push({
      id: i,
      kind: 'explanation: TS ≠ Lean',
      ts: ts.explanation,
      lean: lean.explanation,
      context: c.context,
    });
  // (3) the agreement theorem on the shipped code, and the call-site gap
  const agree =
    ts.verdict.variant === ts.explanation.variantKey &&
    ts.verdict.reason === ts.explanation.reason &&
    ts.verdict.rulePriority === ts.explanation.matchedPriority;
  if (c.call.callTypeOk && !agree)
    failures.push({ id: i, kind: 'TS verdict ≠ TS explanation (type-correct call)', ts });
  if (!c.call.callTypeOk) {
    if (agree) failures.push({ id: i, kind: 'call-site gap predicted but absent', ts });
    else counts.callSiteGap++;
  }
}

console.log(
  JSON.stringify(
    {
      cases: cases.length,
      seed: Number(process.argv[3] ?? 1),
      definitionsRejectedByParser: rejected,
      leanModelMs: Math.round(leanMs),
      verdictReasons: counts.reasons,
      ruleOutcomes: counts.outcomes,
      jsBlankTargetingKeyCases: counts.blankKeyCases,
      typeIncorrectCallsShowingTheGap: counts.callSiteGap,
      disagreements: failures.length,
    },
    null,
    2
  )
);
if (failures.length > 0) {
  console.log('first disagreements:');
  for (const f of failures.slice(0, 5)) console.log(JSON.stringify(f));
  process.exit(1);
}
