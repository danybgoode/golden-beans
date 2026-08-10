// flags-visual-rule-builder · Sprint 2, Story 2.3 — the bounded, plain-language version diff.
//
// ── D8, and why the bound is the feature ──────────────────────────────────────────────────────
// This diffs SIX parts and nothing else: a rule's `priority`, `clauses`, `rollout` and `variantKey`,
// plus the definition's `defaultVariantKey` and `variants`. Everything else — `valueType`,
// `description`, `metadata`, or any key a future contract adds — sets `unexplained`, and the caller
// renders "definition changed — show JSON" with the JSON one click away.
//
// A general JSON-to-prose differ is the epic's named appetite trap, and it fails in a specific way:
// it always produces a sentence, so the sentence stops being evidence. A diff that says "I cannot
// describe this one" is one a PM can act on; a diff that describes everything is one they have to
// check. So the rule here is never guess, never silently omit — if something changed outside the
// six parts, that fact is reported alongside whatever inside them WAS describable.
//
// ── Percent, both sides (D3) ──────────────────────────────────────────────────────────────────
// Every rollout in this file goes through `formatRolloutPercent`. Basis points are the stored unit
// and must never reach a sentence: "rollout 1000 → 5000" is a true statement about the database and
// a false one about what the PM changed. The mutation check sprint-2.md names is exactly this —
// report a rollout change in basis points and the formatting test goes red.
//
// ── Pure, and zero framework imports ──────────────────────────────────────────────────────────
// Same reason as rollout-percent.ts: the native `node --test` runner executes this directly, so the
// four cases Story 2.3 names are asserted without rendering anything.

import type { FlagClause, FlagDefinition, FlagRule, FlagVariant } from '@golden-beans/sdk'
import { formatRolloutPercent } from './rollout-percent'

/**
 * A clause value's type, DERIVED from the exported clause union rather than imported.
 *
 * `FlagScalar` is declared in the SDK but not re-exported from its index, and A6 already spent one
 * additive export on the three limit constants D5 could not otherwise obey. This type needs no such
 * change: extracting it from `FlagClause` keeps it pinned to the grammar — if the union's scalar
 * ever widens, this widens with it, which an imported alias would not guarantee any better.
 */
type ClauseScalar = Extract<FlagClause, { operator: 'equals' }>['value']

/** The words the UI shows when a change falls outside the six diffed parts. Named once. */
export const UNEXPLAINED_DIFF_TEXT = 'definition changed — show JSON'

export type FlagDefinitionDiff = {
  /** One sentence per describable change, in reading order. Empty when nothing in scope changed. */
  changes: string[]
  /**
   * Something changed that this diff does not cover, or the stored rows are shaped in a way it
   * cannot pair up. Either way the caller shows `UNEXPLAINED_DIFF_TEXT` and the raw JSON. This is
   * additive to `changes` rather than replacing it: a version that changed both a rollout AND its
   * description should say both, not hide the half it could explain.
   */
  unexplained: boolean
}

/**
 * The keys this diff knows about. A key outside this set — on either side — means the definition
 * contract grew and this file did not, so the honest answer is the fallback rather than a sentence
 * that quietly omits the new part. (`parseFlagDefinition` rejects unknown keys today; this guard is
 * about the day it stops.)
 */
const KNOWN_DEFINITION_KEYS: ReadonlySet<string> = new Set([
  'valueType',
  'description',
  'defaultVariantKey',
  'variants',
  'rules',
  'metadata',
])

/** Parts that exist, are compared, and are deliberately NOT described in prose (D8's bound). */
const UNDESCRIBED_KEYS = ['valueType', 'description', 'metadata'] as const

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * A scalar as the reader should see it, WITH its JSON quoting.
 *
 * The quotes are not decoration. The evaluator's `sameScalar` compares `typeof` as well as value,
 * so a clause holding the number `5` does not match a context holding the string `"5"` — and a diff
 * that rendered both as `5` would describe a behaviour change as no change at all.
 */
function formatScalar(value: ClauseScalar): string {
  return JSON.stringify(value)
}

function describeClause(clause: FlagClause): string {
  return clause.operator === 'equals'
    ? `${clause.field} is ${formatScalar(clause.value)}`
    : `${clause.field} is one of ${clause.values.map(formatScalar).join(', ')}`
}

/**
 * A rule's conditions as one phrase.
 *
 * A rule with no clauses matches every context — the evaluator's clause loop simply never runs — so
 * it is named as such rather than rendered as an empty string. `flag-rule-draft.ts` refuses to
 * AUTHOR that shape without a rollout; this file still has to READ it, because the textarea and the
 * catalog sync path can both store it.
 */
function describeConditions(rule: FlagRule): string {
  if (rule.clauses.length === 0) return 'every context'
  return rule.clauses.map(describeClause).join(' and ')
}

function describeRollout(rule: FlagRule): string {
  return formatRolloutPercent(rule.rollout ? rule.rollout.basisPoints : null)
}

/**
 * A whole rule as one phrase, for the added/removed/moved cases where there is no before/after pair.
 *
 * Verb-free on purpose — the caller supplies "serves", "served" or "serving" — so the three
 * sentences that use it cannot drift apart in how they describe the same shape.
 */
function describeRule(rule: FlagRule): string {
  return `${JSON.stringify(rule.variantKey)} to ${describeConditions(rule)} (${describeRollout(rule)})`
}

/**
 * The rule body WITHOUT its priority — the identity used to recognise a reorder.
 *
 * Rules are paired by `priority` because the parser guarantees it is unique within a definition and
 * because it is what the evaluator actually orders by. That pairing alone hides the thing D9 cares
 * about most, and it hides it in two different ways:
 *
 *   • **a renumber into a vacant slot** would read as one removal plus one addition, and
 *   • **a SWAP** would not even do that — both priorities exist on both sides, so the two rules pair
 *     up and every field reads as changed. Two rules exchanging places produced four sentences
 *     claiming both rules had been rewritten, for an edit that rewrote nothing (found by the fresh
 *     reviewer on PR #88).
 *
 * So the second case is checked FIRST, before any pairing: if the two versions contain exactly the
 * same multiset of bodies, nothing about targeting changed and every difference is a renumbering.
 * The first case is then handled inside the removed/added reconciliation, which is where it lives.
 */
function ruleBody(rule: FlagRule): string {
  return JSON.stringify([rule.clauses, rule.rollout ?? null, rule.variantKey])
}

/**
 * Describe a pure renumbering — the case where both versions hold the same rules and only the
 * priorities differ.
 *
 * Bodies can legitimately repeat (the parser requires unique priorities, not unique rules), so
 * identical bodies are paired by sorted priority: the lowest before-priority to the lowest
 * after-priority. Any other pairing would be a guess about which of two indistinguishable rules the
 * author meant to move, and between two guesses that describe the same outcome this is the one that
 * reports the fewest moves.
 */
function describeReorder(before: FlagRule[], after: FlagRule[], changes: string[]) {
  const sides = new Map<string, { rule: FlagRule; before: number[]; after: number[] }>()
  const side = (rule: FlagRule) => {
    const body = ruleBody(rule)
    const existing = sides.get(body)
    if (existing) return existing
    const fresh = { rule, before: [] as number[], after: [] as number[] }
    sides.set(body, fresh)
    return fresh
  }
  for (const rule of before) side(rule).before.push(rule.priority)
  for (const rule of after) side(rule).after.push(rule.priority)

  for (const entry of sides.values()) {
    entry.before.sort((left, right) => left - right)
    entry.after.sort((left, right) => left - right)
    entry.before.forEach((priority, index) => {
      const moved = entry.after[index]
      if (moved !== priority) {
        changes.push(
          `the rule serving ${describeRule(entry.rule)} moved from priority ${priority} to ${moved}`
        )
      }
    })
  }
}

function describeVariantsChange(before: FlagVariant[], after: FlagVariant[], changes: string[]) {
  const beforeByKey = new Map(before.map((variant) => [variant.key, variant]))
  const afterByKey = new Map(after.map((variant) => [variant.key, variant]))

  for (const variant of after) {
    const previous = beforeByKey.get(variant.key)
    if (!previous) {
      changes.push(`variant ${JSON.stringify(variant.key)} added, serving ${JSON.stringify(variant.value)}`)
    } else if (!sameJson(previous.value, variant.value)) {
      changes.push(
        `variant ${JSON.stringify(variant.key)} now serves ${JSON.stringify(variant.value)} (was ${JSON.stringify(previous.value)})`
      )
    }
  }
  for (const variant of before) {
    if (!afterByKey.has(variant.key)) changes.push(`variant ${JSON.stringify(variant.key)} removed`)
  }
}

function describePairedRule(priority: number, before: FlagRule, after: FlagRule, changes: string[]) {
  const label = `rule ${priority}`

  if (!sameJson(before.clauses, after.clauses)) {
    changes.push(
      `${label}: conditions changed from ${describeConditions(before)} to ${describeConditions(after)}`
    )
  }

  const beforePoints = before.rollout?.basisPoints
  const afterPoints = after.rollout?.basisPoints
  if (beforePoints !== afterPoints) {
    if (beforePoints === undefined) {
      changes.push(
        `${label}: rollout limited to ${formatRolloutPercent(afterPoints)} — it previously served everyone who matched`
      )
    } else if (afterPoints === undefined) {
      changes.push(
        `${label}: rollout removed — it now serves everyone who matches (was ${formatRolloutPercent(beforePoints)})`
      )
    } else {
      // The sentence the smoke walkthrough reads, and the one the mutation check breaks.
      changes.push(
        `${label}: rollout ${formatRolloutPercent(beforePoints)} → ${formatRolloutPercent(afterPoints)}`
      )
    }
  }

  if (before.variantKey !== after.variantKey) {
    changes.push(
      `${label}: now serves ${JSON.stringify(after.variantKey)} (was ${JSON.stringify(before.variantKey)})`
    )
  }
}

/**
 * Index a definition's rules by priority, or `null` when they cannot be indexed.
 *
 * `null` is not defensiveness. Pairing by priority is only meaningful if priority is unique and
 * readable, which `parseFlagDefinition` guarantees for anything it wrote. A stored row that breaks
 * it disagrees with the parser that accepted it, and the honest response to a row we cannot read is
 * the fallback — not a diff computed against a pairing we know is wrong.
 */
function rulesByPriority(rules: FlagRule[]): Map<number, FlagRule> | null {
  const byPriority = new Map<number, FlagRule>()
  for (const rule of rules) {
    if (!Number.isFinite(rule.priority) || byPriority.has(rule.priority)) return null
    byPriority.set(rule.priority, rule)
  }
  return byPriority
}

/**
 * What changed between two immutable versions, in the PM's words, bounded to the six parts D8 names.
 *
 * Reads only. This function does not merge, squash, normalise or reinterpret a stored version — the
 * immutable-version model is the thing the epic exists to make legible, not the thing it edits.
 */
export function diffFlagDefinitions(before: FlagDefinition, after: FlagDefinition): FlagDefinitionDiff {
  const changes: string[] = []
  let unexplained = false

  // Anything outside the six parts: compared, never described.
  for (const key of UNDESCRIBED_KEYS) {
    if (!sameJson(before[key], after[key])) unexplained = true
  }
  for (const key of [...Object.keys(before), ...Object.keys(after)]) {
    if (!KNOWN_DEFINITION_KEYS.has(key)) unexplained = true
  }

  if (before.defaultVariantKey !== after.defaultVariantKey) {
    changes.push(
      `when no rule matches, this flag now serves ${JSON.stringify(after.defaultVariantKey)} (was ${JSON.stringify(before.defaultVariantKey)})`
    )
  }

  describeVariantsChange(before.variants, after.variants, changes)

  const beforeRules = rulesByPriority(before.rules)
  const afterRules = rulesByPriority(after.rules)
  if (!beforeRules || !afterRules) return { changes, unexplained: true }

  // Checked BEFORE pairing by priority: same rules, different numbers, and nothing else. Pairing
  // first would describe a swap as both rules being rewritten — see `ruleBody`'s header.
  if (sameJson([...before.rules].map(ruleBody).sort(), [...after.rules].map(ruleBody).sort())) {
    describeReorder(before.rules, after.rules, changes)
    return { changes, unexplained }
  }

  const removed: FlagRule[] = []
  const added: FlagRule[] = []
  for (const [priority, rule] of beforeRules) {
    const match = afterRules.get(priority)
    if (match) describePairedRule(priority, rule, match, changes)
    else removed.push(rule)
  }
  for (const [priority, rule] of afterRules) {
    if (!beforeRules.has(priority)) added.push(rule)
  }

  // A renumbering, recognised as one thing rather than reported as two (D9).
  const unmatchedAdded = [...added]
  for (const gone of removed) {
    const movedIndex = unmatchedAdded.findIndex((candidate) => ruleBody(candidate) === ruleBody(gone))
    if (movedIndex === -1) {
      changes.push(`rule ${gone.priority} removed — it served ${describeRule(gone)}`)
      continue
    }
    const [moved] = unmatchedAdded.splice(movedIndex, 1)
    changes.push(
      `the rule serving ${describeRule(gone)} moved from priority ${gone.priority} to ${moved.priority}`
    )
  }
  for (const fresh of unmatchedAdded) {
    changes.push(`rule ${fresh.priority} added — it serves ${describeRule(fresh)}`)
  }

  return { changes, unexplained }
}
