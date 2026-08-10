// flags-visual-rule-builder · Sprint 1, Stories 1.2/1.3 — between the controls and the contract.
//
// ── What this file is for ─────────────────────────────────────────────────────────────────────
// The UI edits strings, because that is what an <input> holds. `FlagDefinition` holds a closed
// union of scalars, an optional rollout in basis points, and rules whose priorities must be unique.
// This is the one place those two shapes meet, and it is pure so the meeting can be tested without
// rendering anything (CODE-QUALITY rule 5: a guard behind state the harness cannot reach gets
// extracted and asserted directly).
//
// ── D1, restated as code ──────────────────────────────────────────────────────────────────────
// Every field name and every operator here is IMPORTED. If you find yourself typing 'plan' or
// 'one_of' into a list in a component, that is the wrong turn D1 names — the enum is the SDK's.
//
// ── D2, restated as code ──────────────────────────────────────────────────────────────────────
// Nothing below is a second validator. `definitionFromDraft` narrows what the UI can EMIT so a PM
// gets feedback in the form instead of a server round-trip; `parseFlagDefinition` still decides
// what is VALID, server-side, on every submission. Where the two could drift, this one is stricter
// — a permissive browser check is the drift direction that actually hurts.

import {
  FLAG_CONTEXT_FIELDS,
  MAX_FLAG_CLAUSES,
  MAX_FLAG_RULES,
  type FlagClause,
  type FlagContextField,
  type FlagDefinition,
  type FlagRule,
  type FlagValueType,
  type FlagVariant,
} from '@golden-beans/sdk'
import { basisPointsToPercent, percentToBasisPoints } from './rollout-percent'

/**
 * The clause grammar's operators.
 *
 * ── Why the `satisfies` alone was not enough (cross-review, Codex) ────────────────────────────
 * This file first carried `['equals','one_of'] as const satisfies readonly FlagClause['operator'][]`
 * with a comment claiming that adding a third operator to the SDK would stop this compiling. **That
 * was false.** `satisfies` checks that every element IS an operator; it does not check that every
 * operator is an element, so `['equals']` would have satisfied it just as happily. The builder would
 * have silently under-offered the grammar and D1 would have been broken by the one line written to
 * uphold it — a comment asserting a property the code did not have, which is exactly what
 * CODE-QUALITY rule 3 exists to catch.
 *
 * `MissingOperator` is the real guard: it resolves to `never` only when the list covers the union,
 * so the assignment below fails to compile the moment the SDK grows an operator this list lacks.
 * The runtime list stays hand-written because a TypeScript union has no runtime representation to
 * derive it from — so the type system is made to police the copy instead.
 */
export const FLAG_CLAUSE_OPERATORS = ['equals', 'one_of'] as const satisfies readonly FlagClause['operator'][]
export type FlagClauseOperator = (typeof FLAG_CLAUSE_OPERATORS)[number]

type MissingOperator = Exclude<FlagClause['operator'], FlagClauseOperator>
/** Compile-time exhaustiveness: `never` iff FLAG_CLAUSE_OPERATORS covers every clause operator. */
const _everyOperatorIsOffered: MissingOperator extends never ? true : never = true
void _everyOperatorIsOffered

export type ClauseDraft = {
  field: FlagContextField
  operator: FlagClauseOperator
  /** Used by `equals`. Held as a string because that is what the control holds. */
  value: string
  /** Used by `one_of`. */
  values: string[]
}

export type RuleDraft = {
  /** Shown to the PM as a number and changed explicitly — D9. Never renumbered behind their back. */
  priority: number
  clauses: ClauseDraft[]
  /** Percent, the display unit. `null` means no rollout configured, i.e. everyone who matches. */
  rolloutPercent: number | null
  variantKey: string
}

export type DefinitionDraft = {
  valueType: FlagValueType
  description: string
  defaultVariantKey: string
  /**
   * Carried through untouched. The builder edits RULES; variants, their values and the flag's
   * value type are authored in the header or preserved from the loaded definition. Editing variant
   * values is not in this epic's appetite, and a half-built variant editor is worse than the
   * textarea it would sit next to.
   */
  variants: FlagVariant[]
  rules: RuleDraft[]
}

export type DefinitionDraftResult =
  | { ok: true; definition: FlagDefinition }
  | { ok: false; errors: string[] }

/** Whether another rule fits. The bound is the SDK constant — never a literal (D5). */
export function canAddRule(rules: readonly unknown[]): boolean {
  return rules.length < MAX_FLAG_RULES
}

/** Whether another clause fits this rule. Same rule as above, same reason. */
export function canAddClause(clauses: readonly unknown[]): boolean {
  return clauses.length < MAX_FLAG_CLAUSES
}

export function emptyClauseDraft(): ClauseDraft {
  return { field: FLAG_CONTEXT_FIELDS[0], operator: 'equals', value: '', values: [] }
}

/**
 * A new rule, placed after every existing one.
 *
 * Priority decides evaluation order (the SDK sorts ascending and takes the first match), and the
 * parser rejects duplicates. Appending at `max + 10` leaves room to insert between two rules later
 * without renumbering anything that already exists — D9's "no silent renumbering" is easier to keep
 * if the default spacing does not force it.
 */
export function emptyRuleDraft(existing: readonly RuleDraft[], variantKey: string): RuleDraft {
  // Only FINITE priorities count toward the next default. Both review families caught the same bug
  // here independently: a priority mid-edit is NaN (see RuleCard — an emptied number field must stay
  // empty rather than snap to 0), and `Math.max(anything, NaN)` is NaN, so one half-typed rule made
  // every rule added afterwards NaN too. The corruption spread from a field the reader was still
  // in the middle of using.
  const highest = existing
    .map((rule) => rule.priority)
    .filter((priority) => Number.isFinite(priority))
    .reduce((max, priority) => Math.max(max, priority), 0)
  return { priority: highest + 10, clauses: [emptyClauseDraft()], rolloutPercent: null, variantKey }
}

function clauseFromDraft(draft: ClauseDraft, path: string, errors: string[]): FlagClause | null {
  if (draft.operator === 'equals') {
    const value = draft.value.trim()
    if (value.length === 0) {
      errors.push(`${path}: enter a value for ${draft.field}.`)
      return null
    }
    return { field: draft.field, operator: 'equals', value }
  }
  const values = draft.values.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  if (values.length === 0) {
    errors.push(`${path}: add at least one value for ${draft.field}.`)
    return null
  }
  // The parser rejects duplicates in a `one_of` list. Catching it here names the offending value;
  // the parser can only say the list is invalid.
  const duplicate = values.find((entry, index) => values.indexOf(entry) !== index)
  if (duplicate !== undefined) {
    errors.push(`${path}: "${duplicate}" is listed twice.`)
    return null
  }
  return { field: draft.field, operator: 'one_of', values }
}

/**
 * A draft → the definition to store, or the messages to show the PM.
 *
 * Returns EVERY error rather than the first, because a form that reveals one problem per submit is
 * how a five-clause rule takes five round trips.
 */
export function definitionFromDraft(draft: DefinitionDraft): DefinitionDraftResult {
  const errors: string[] = []
  const rules: FlagRule[] = []
  const seenPriorities = new Set<number>()

  if (draft.rules.length > MAX_FLAG_RULES) errors.push(`A flag can have at most ${MAX_FLAG_RULES} rules.`)

  draft.rules.forEach((rule, index) => {
    const path = `Rule ${index + 1}`
    if (!Number.isInteger(rule.priority) || rule.priority < 0) {
      errors.push(`${path}: priority must be a whole number.`)
    } else if (seenPriorities.has(rule.priority)) {
      errors.push(`${path}: priority ${rule.priority} is already used. Two rules cannot share one.`)
    } else {
      seenPriorities.add(rule.priority)
    }

    if (rule.clauses.length > MAX_FLAG_CLAUSES) {
      errors.push(`${path}: a rule can have at most ${MAX_FLAG_CLAUSES} conditions.`)
    }
    const clauses = rule.clauses
      .map((clause, clauseIndex) => clauseFromDraft(clause, `${path}, condition ${clauseIndex + 1}`, errors))
      .filter((clause): clause is FlagClause => clause !== null)

    let rollout: FlagRule['rollout']
    if (rule.rolloutPercent !== null) {
      const basisPoints = percentToBasisPoints(rule.rolloutPercent)
      // Rejected, not clamped — see rollout-percent.ts. A 150% rollout is a typo, and silently
      // saving it as 100% agrees with something the PM did not mean.
      if (basisPoints === null) errors.push(`${path}: rollout must be a percentage between 0 and 100.`)
      else rollout = { basisPoints }
    }

    if (!draft.variants.some((variant) => variant.key === rule.variantKey)) {
      errors.push(`${path}: choose which variant this rule serves.`)
    }

    // A rule with no conditions matches EVERY context — the evaluator's clause loop simply never
    // runs — so it serves its variant to everyone and makes every lower-priority rule below it
    // dead code. The parser accepts that, and a PM who deleted their last condition did not mean it.
    //
    // Cross-review (Agy) proposed requiring at least one clause. That would be too strict: a rule
    // with NO clauses but WITH a rollout is "serve this variant to X% of everyone", which is one of
    // the most common things a flag is for. So the guard is the narrower one — a rule must say
    // something, either a condition or a rollout. A rule with neither is not targeting; it is just
    // `defaultVariantKey` written in a more confusing place.
    if (rule.clauses.length === 0 && rule.rolloutPercent === null) {
      errors.push(
        `${path}: add a condition or a rollout. A rule with neither serves ${rule.variantKey} to everyone and hides every rule below it.`
      )
    }

    if (clauses.length === rule.clauses.length && rule.clauses.length <= MAX_FLAG_CLAUSES) {
      rules.push({
        priority: rule.priority,
        clauses,
        ...(rollout ? { rollout } : {}),
        variantKey: rule.variantKey,
      })
    }
  })

  if (!draft.variants.some((variant) => variant.key === draft.defaultVariantKey)) {
    errors.push('Choose the variant this flag serves when no rule matches.')
  }
  if (draft.description.trim().length === 0) errors.push('Describe what this flag does.')

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    definition: {
      valueType: draft.valueType,
      description: draft.description.trim(),
      defaultVariantKey: draft.defaultVariantKey,
      variants: draft.variants,
      rules,
    },
  }
}

/**
 * A stored definition → an editable draft, or `null` when the builder cannot represent it faithfully.
 *
 * ── Why `null` and not a best effort ──────────────────────────────────────────────────────────
 * Clause values are `FlagScalar` — string, number or boolean — and the evaluator's `sameScalar`
 * compares `typeof` as well as value. So a clause holding the number `5` matches only a numeric
 * context, and rendering it into a text input would turn it into `"5"` on the next save: a rule that
 * silently stops matching, caused by nothing more than opening the flag to look at it.
 *
 * There is no safe way to guess the intended type back out of a string ("true" is a plausible plan
 * name), so the builder declines the whole definition and the caller keeps the JSON textarea for it.
 * A bounded editor that admits its limits is the same bargain D8 strikes for the diff.
 *
 * `metadata` is the other decline: the builder never authors it, and dropping a key on save would
 * be a silent deletion.
 */
export function draftFromDefinition(definition: FlagDefinition | undefined | null): DefinitionDraft | null {
  if (!definition) return null
  if (definition.metadata !== undefined) return null

  const rules: RuleDraft[] = []
  for (const rule of definition.rules) {
    const clauses: ClauseDraft[] = []
    for (const clause of rule.clauses) {
      if (clause.operator === 'equals') {
        if (typeof clause.value !== 'string') return null
        clauses.push({ field: clause.field, operator: 'equals', value: clause.value, values: [] })
      } else {
        if (!clause.values.every((value) => typeof value === 'string')) return null
        clauses.push({
          field: clause.field,
          operator: 'one_of',
          value: '',
          values: clause.values as string[],
        })
      }
    }
    let rolloutPercent: number | null = null
    if (rule.rollout) {
      rolloutPercent = basisPointsToPercent(rule.rollout.basisPoints)
      // A stored value the display seam refuses is a row that disagrees with the parser that wrote
      // it. Editing it in a control that cannot show it would write back a number nobody chose.
      if (rolloutPercent === null) return null
    }
    rules.push({ priority: rule.priority, clauses, rolloutPercent, variantKey: rule.variantKey })
  }

  return {
    valueType: definition.valueType,
    description: definition.description,
    defaultVariantKey: definition.defaultVariantKey,
    variants: definition.variants,
    rules,
  }
}
