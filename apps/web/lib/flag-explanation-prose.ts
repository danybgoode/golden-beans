// flags-visual-rule-builder · Sprint 3, Story 3.2 — saying *why*, in words a PM can act on.
//
// ── Why the sentences live on a seam and not in the component ─────────────────────────────────
// Story 3.2's acceptance is entirely about wording: "excluded by rollout" must read as clearly
// different from "no rule matched", and every rollout must be a percentage. Wording that matters
// that much is wording worth asserting, and a sentence built inside a client component is reachable
// only through a signed-in browser — the same argument that put Sprint 2's derivation on a seam.
//
// ── One vocabulary across the epic (D3) ───────────────────────────────────────────────────────
// Clauses are described by `describeFlagClause`, the same function the version diff uses, and every
// rollout goes through `formatRolloutPercent`. A reader who has just been told "rule 10: rollout 10%
// → 50%" on one panel and "the 10% rollout excluded this context" on another is reading about one
// number in one unit. Basis points appear nowhere.
//
// ── No matching logic (D4) ────────────────────────────────────────────────────────────────────
// Every outcome below is READ off `explainFlagEvaluation`'s answer. There is no clause comparison in
// this file and no re-derivation of what matched — grep it. The SDK decided; this only narrates.

import type { FlagEvaluationExplanation, FlagRuleExplanation } from './flag-definition'
import { describeFlagClause } from './flag-definition-diff'
import { formatRolloutPercent } from './rollout-percent'

/**
 * The headline: what this context gets, and what decided it.
 *
 * **A5, and it is a copy trap the epic README flags explicitly.** No rule matching is
 * `reason: 'STATIC'`, never `'DEFAULT'` — `'DEFAULT'` is reserved for the error fallbacks. So the
 * sentence names the default VARIANT by its key and never uses the word "default" as a status.
 */
export function describeEvaluationOutcome(explanation: FlagEvaluationExplanation): string {
  if (explanation.errorCode === 'FLAG_NOT_FOUND') return 'That flag is not in this environment’s snapshot.'
  if (explanation.errorCode === 'INVALID_DEFINITION')
    return 'The version activated here cannot be evaluated, so there is nothing to preview.'
  if (explanation.errorCode === 'INVALID_CONTEXT')
    return 'The evaluator refused that context. Only the six targeting fields are accepted.'

  if (explanation.matched) {
    return `Rule ${explanation.matched.priority} matched. This context gets ${JSON.stringify(explanation.matched.variantKey)}.`
  }
  return `No rule matched. This flag serves ${JSON.stringify(explanation.defaultVariantKey)}, the variant it falls back to.`
}

/**
 * One rule, and what it did.
 *
 * The two rollout outcomes are the point of the whole sprint. `evaluateFlag` collapsed "a clause
 * failed" and "the rollout excluded you" into one `false`, so a PM whose conditions were right and
 * whose bucket was wrong was told their targeting did not match — which sends them to edit the one
 * thing that was already correct. And a rollout with no targeting key in context is a third,
 * distinct outcome (A5): the rule cannot match at all, because there is nothing to hash.
 */
export function describeRuleOutcome(rule: FlagRuleExplanation): string {
  const label = `Rule ${rule.priority}`
  const rollout = formatRolloutPercent(rule.rolloutBasisPoints ?? null)

  if (rule.outcome === 'matched') {
    const admitted =
      rule.rolloutBasisPoints === undefined ? '' : ` and its ${rollout} rollout admitted this context`
    return `${label} matched${admitted} — it serves ${JSON.stringify(rule.variantKey)}.`
  }
  if (rule.outcome === 'clause_failed') {
    const failed = rule.failedClause ? describeFlagClause(rule.failedClause) : 'a condition'
    return `${label} did not match: ${failed}.`
  }
  if (rule.outcome === 'rollout_excluded') {
    return `${label} — its conditions all matched, but the ${rollout} rollout excluded this context. That is not the same as "no rule matched": widen the rollout, not the conditions.`
  }
  if (rule.outcome === 'rollout_missing_targeting_key') {
    return `${label} — its conditions all matched, but a ${rollout} rollout needs a targeting key and none was given, so the rule was excluded outright.`
  }
  return `${label} was never consulted — a lower-numbered rule matched first.`
}

/** Every clause on a rule, for the matched rule's "these are the conditions that held" list. */
export function describeRuleConditions(rule: FlagRuleExplanation): string[] {
  return rule.clauses.map(describeFlagClause)
}
