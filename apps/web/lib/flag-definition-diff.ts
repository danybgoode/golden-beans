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

import {
  parseFlagDefinition,
  type FlagClause,
  type FlagDefinition,
  type FlagRule,
  type FlagVariant,
} from '@golden-frijoles/sdk'
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

/**
 * One clause in a PM's words.
 *
 * Exported in Sprint 3 so the preview screen describes a condition with the same vocabulary the
 * version diff does. A reader who has just been told "rule 10: conditions changed from plan is
 * \"pro\"" and then reads "plan is \"pro\" did not match" is reading about one thing; two
 * independently-worded descriptions of the same clause would make them wonder if it is two.
 */
export function describeFlagClause(clause: FlagClause): string {
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
  return rule.clauses.map(describeFlagClause).join(' and ')
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
 * A clause in a form where ORDER carries no meaning.
 *
 * The evaluator ANDs the clause list — `for (const clause of rule.clauses)` — and `one_of` tests
 * with `.some()`. Neither cares about position, so two versions differing only in the order of a
 * clause list, or of a `one_of` list, resolve identically for every context. Comparing the raw
 * arrays reported those as "conditions changed from … to …", which is a behaviour change that did
 * not happen (cross-review, Codex, round 2).
 *
 * The canonical form is used for COMPARISON only. Every sentence is rendered from a rule's own
 * stored order — the rule at the priority the sentence names, not a same-bodied stand-in — so what a
 * reader sees always exists in the JSON at the priority they are told to look at.
 */
function canonicalClause(clause: FlagClause): string {
  return clause.operator === 'equals'
    ? JSON.stringify([clause.field, 'equals', clause.value])
    : JSON.stringify([clause.field, 'one_of', clause.values.map((value) => JSON.stringify(value)).sort()])
}

function canonicalClauses(rule: FlagRule): string {
  return JSON.stringify(rule.clauses.map(canonicalClause).sort())
}

/**
 * The rule's identity WITHOUT its priority — what makes a renumbering recognisable as one.
 *
 * Everything that decides a rule's behaviour except WHEN it is consulted: its conditions (order
 * canonicalised, see above), its rollout and the variant it serves. Two rules with the same body at
 * different priorities are the same rule, moved.
 */
function ruleBody(rule: FlagRule): string {
  return JSON.stringify([canonicalClauses(rule), rule.rollout ?? null, rule.variantKey])
}

type RuleReconciliation = {
  /** before/after pairs that share a priority and whose bodies differ — a rule that was edited. */
  edited: Array<{ priority: number; before: FlagRule; after: FlagRule }>
  removed: FlagRule[]
  added: FlagRule[]
}

/**
 * Work out which rule in `after` is which rule in `before`, and emit the moves.
 *
 * ── Why identity is matched by BODY first, and by priority only afterwards ────────────────────
 * Priority is unique and is what the evaluator orders by, so pairing by it is the obvious move —
 * and it is wrong in the case D9 cares about most. Two rules exchanging priorities have both
 * priorities present on both sides, so a priority-first pairing matches each rule to the OTHER one
 * and reports four rewrites for an edit that rewrote nothing. Round 1 patched that with an
 * all-or-nothing "same multiset of bodies" pre-check, which round 2 showed was defeated by any
 * concurrent edit: swap two rules and widen one rollout, and the four false rewrites came back.
 *
 * So the reconciliation is body-first and incremental:
 *
 *   1. **Same body, same priority** — the rule is untouched. Consumed silently.
 *   2. **Same body, different priority** — the rule MOVED. One sentence, and the surviving priorities
 *      from step 1 are already out of the way, so a rule that did not move can never be described as
 *      having moved to make room for one that did. (That cascade — "moved from 2 to 3" printed while
 *      a rule still sits at 2 — is what sorted-index pairing produced before the intersection step.)
 *   3. **What is left** pairs by priority for a field-level diff, and anything still unpaired is a
 *      removal or an addition.
 *
 * Bodies can legitimately repeat: the parser requires unique priorities, not unique rules. After the
 * step-1 intersection the residue is paired by sorted priority, which is a choice between
 * indistinguishable rules and is therefore arbitrary by definition — but only between rules that
 * genuinely cannot be told apart, and never at the cost of a spurious move.
 */
function reconcileRules(before: FlagRule[], after: FlagRule[], changes: string[]): RuleReconciliation {
  const sides = new Map<string, { before: number[]; after: number[] }>()
  const side = (rule: FlagRule) => {
    const body = ruleBody(rule)
    const existing = sides.get(body)
    if (existing) return existing
    const fresh = { before: [] as number[], after: [] as number[] }
    sides.set(body, fresh)
    return fresh
  }
  for (const rule of before) side(rule).before.push(rule.priority)
  for (const rule of after) side(rule).after.push(rule.priority)

  const byPriority = (rules: FlagRule[]) => new Map(rules.map((rule) => [rule.priority, rule]))
  const beforeByPriority = byPriority(before)
  const afterByPriority = byPriority(after)
  const unmatchedBefore: number[] = []
  const unmatchedAfter: number[] = []
  const moved: Array<{ from: number; to: number }> = []

  for (const entry of sides.values()) {
    // Step 1 — a rule that kept its body AND its priority did not change. Take those out first.
    const stayed = new Set(entry.before.filter((priority) => entry.after.includes(priority)))
    const movedFrom = entry.before.filter((priority) => !stayed.has(priority)).sort((a, b) => a - b)
    const movedTo = entry.after.filter((priority) => !stayed.has(priority)).sort((a, b) => a - b)

    // Step 2 — the residue, in matching order, is this body's moves.
    const moves = Math.min(movedFrom.length, movedTo.length)
    for (let index = 0; index < moves; index++) {
      moved.push({ from: movedFrom[index], to: movedTo[index] })
    }
    unmatchedBefore.push(...movedFrom.slice(moves))
    unmatchedAfter.push(...movedTo.slice(moves))
  }

  // Sorted by the priority moved FROM, so the whole `changes` list reads in evaluation order and is
  // a function of the definition rather than of how its `rules` array happened to be serialised.
  // `sides` is keyed in before-array order, and two byte-different serialisations of the same
  // definition would otherwise emit the same moves in different sequences (fresh review, round 3).
  //
  // Each sentence describes the rule AT ITS OWN before-priority, not the first rule that shared its
  // body. `ruleBody` is order-insensitive, so several rules with different stored clause orders land
  // in one entry — and rendering the entry's first member printed conditions in an order that
  // existed at neither priority named. Behaviourally identical, but a reader cross-referencing
  // "Show JSON" would have found no such rule (fresh review, round 3).
  for (const move of moved.sort((left, right) => left.from - right.from)) {
    changes.push(
      `the rule serving ${describeRule(beforeByPriority.get(move.from)!)} moved from priority ${move.from} to ${move.to}`
    )
  }

  // Step 3 — whatever no body could claim. A shared priority means the rule at that slot was edited.
  const edited: RuleReconciliation['edited'] = []
  const removed: FlagRule[] = []
  const added: FlagRule[] = []
  const stillAfter = new Set(unmatchedAfter)
  for (const priority of unmatchedBefore.sort((a, b) => a - b)) {
    if (stillAfter.delete(priority)) {
      edited.push({
        priority,
        before: beforeByPriority.get(priority)!,
        after: afterByPriority.get(priority)!,
      })
    } else {
      removed.push(beforeByPriority.get(priority)!)
    }
  }
  for (const priority of [...stillAfter].sort((a, b) => a - b)) {
    added.push(afterByPriority.get(priority)!)
  }
  return { edited, removed, added }
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

  // Compared canonically, described as stored: a reordered clause list is not a behaviour change,
  // but the sentence still shows the conditions in the order the author wrote them.
  if (canonicalClauses(before) !== canonicalClauses(after)) {
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
 * What changed between two immutable versions, in the PM's words, bounded to the six parts D8 names.
 *
 * Reads only. This function does not merge, squash, normalise or reinterpret a stored version — the
 * immutable-version model is the thing the epic exists to make legible, not the thing it edits.
 */
export function diffFlagDefinitions(before: FlagDefinition, after: FlagDefinition): FlagDefinitionDiff {
  const changes: string[] = []
  let unexplained = false

  // ── The one shape guard, and it is D2's authority rather than a second validator ───────────────
  // These are JSONB columns; the TypeScript type is a promise the database does not make. Every
  // sentence below indexes into `clauses`, pairs by `priority` and trusts `basisPoints` — all
  // guaranteed by `parseFlagDefinition` and by nothing else. A row it rejects is a row nothing will
  // ever serve, so the honest output is the fallback: show the JSON and describe none of it. This
  // also subsumes the duplicate-priority refusal that used to live in a hand-written index, and it
  // is what makes the non-null assertions in `reconcileRules` safe by construction.
  if (!parseFlagDefinition(before).ok || !parseFlagDefinition(after).ok) {
    return { changes: [], unexplained: true }
  }

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

  // Moves are emitted inside `reconcileRules` — they are the part of the rules diff that has to be
  // decided before anything else can be paired. What comes back is what no move could explain.
  const { edited, removed, added } = reconcileRules(before.rules, after.rules, changes)
  for (const pair of edited) describePairedRule(pair.priority, pair.before, pair.after, changes)
  for (const gone of removed) changes.push(`rule ${gone.priority} removed — it served ${describeRule(gone)}`)
  for (const fresh of added) changes.push(`rule ${fresh.priority} added — it serves ${describeRule(fresh)}`)

  return { changes, unexplained }
}
