// experiments-for-humans · Story 2.2 — the ONE pure planner (epic README D3, D4, D5, D6, D8).
//
// Answers in; everything the builder's screens show and everything Save/Start/Roll-out write, out.
// Zero I/O — the same shape as `packages/sdk/src/flag-commands.ts`. Every number the product person
// sees (days, need per version, people a day, the split) and every word of the plan sentence is
// computed HERE, once, and tested once; a component that does arithmetic is a second implementation.
//
// Every output goes through its own authority before it leaves: the experiment definition through
// `parseExperimentDefinition`, the flag definition through the SDK's `parseFlagDefinition`. A plan
// the backend would reject is a failure here, not a 400 later.

import {
  EXPERIMENT_METADATA_KEYS,
  MAX_FLAG_METADATA_ENTRIES,
  parseFlagDefinition,
  planFlagSet,
  type FlagClause,
  type FlagDefinition,
  type FlagPlanResult,
  type FlagRule,
  type FlagScalar,
} from '@golden-frijoles/sdk'
import { RESERVED_EVENTS, type EventCatalog } from './event-catalog'
import {
  MAX_EXPERIMENT_PREDICATE_STRING_LENGTH,
  MAX_EXPERIMENT_SAMPLE_PER_VARIANT,
  MAX_EXPERIMENT_VARIANT_LABEL_LENGTH,
  parseExperimentDefinition,
  type ExperimentDefinition,
} from './experiment-definition'
import {
  EXPERIMENT_REASONS,
  EXPERIMENT_TEMPLATES,
  GUARDRAIL_PATTERN,
  WEEK_OPTIONS,
  type ExperimentConditionField,
  type ExperimentReasonKey,
  type ExperimentTemplateKey,
} from './experiment-templates'

// ── D4: the priorities an experiment's rules take ─────────────────────────────────────────────
//
// ⚠️ NOT 0…k−1. Rules whose hashed tuples differ in one same-length digit admit CORRELATED people
// under FNV-1a (measured joint admission 0.35 vs 0.25 independent for priorities 0 and 1), and the
// stacked-rollout arithmetic below assumes independence. Priorities of different decimal LENGTH are
// independent — measured worst deviation 0.23 pp over 400k keys. See the epic README, D4.
export const EXPERIMENT_RULE_PRIORITIES = [0, 10, 100, 1000] as const
/** Served rules move below the experiment's, order preserved. */
export const SERVED_RULE_OFFSET = 10_000
const MAX_RULE_PRIORITY = 1_000_000
export const MAX_EXPERIMENT_VERSIONS = EXPERIMENT_RULE_PRIORITIES.length
const DAY_MS = 86_400_000

export type ExperimentCondition = { field: ExperimentConditionField; values: FlagScalar[] }

/** What the five questions answer. The browser sends THIS, never a definition (D7). */
export type ExperimentBuilderAnswers = {
  template: ExperimentTemplateKey
  /** An existing feature's flag key, or `null` for "A new feature just for this test". */
  flagKey: string | null
  why: ExperimentReasonKey
  direction: 'increase' | 'decrease'
  metric: string
  guardrails: string[]
  breakdowns: ExperimentConditionField[]
  /** The smallest change worth knowing about, percent, 1–100. */
  mde: number
  who: {
    mode: 'everyone' | 'some'
    conditions: ExperimentCondition[]
    /** "How many of them", percent, 1–100. */
    allocation: number
  }
  entity: string
  /** Version names, control first. Two for an on/off feature; 2–4 for a new one. */
  versions: string[]
  /** The treatment's share of the in-test people when there are exactly two versions, 1–99. */
  split: number
  weeks: number
}

/** The feature the experiment changes, as the page loaded it. `null` for a new feature. */
export type ServedFeature = {
  flagKey: string
  definition: FlagDefinition
  /** A version of this flag is activated in Production. */
  activeInProduction: boolean
} | null

export type ExperimentPlanContext = {
  catalog: EventCatalog
  served: ServedFeature
  now: Date
  /** The experiment version Save draft will create (the latest + 1, or 1). The DB function re-asserts it. */
  nextVersion: number
  /** A saved draft's window, when re-planning a draft; otherwise the window starts `now`. */
  savedWindow?: { startAt: string; endAt: string }
  /** Keys already taken in this project, so a new name never collides. */
  // REQUIRED (fresh reviewer, PR #169): an omitted list made every name look free, so a second
  // test on a busy feature re-used the first one's key. A re-save says so through `draft`.
  takenExperimentKeys: readonly string[]
  takenFlagKeys: readonly string[]
  /**
   * Re-planning a SAVED draft (Continue, Start, Change the plan): its names are already taken — by
   * itself. Without this a re-save names `…_enabled_2` / `…_copy_test_2` and splits one test into two
   * (fresh reviewer, PR #169).
   */
  draft?: { experimentKey: string; flagKey: string }
}

export type CheckStatus = 'ok' | 'warn' | 'fail'
export type CheckFix =
  | { kind: 'step'; step: 1 | 2 | 3 | 4 | 5 }
  | { kind: 'remove-condition'; field: ExperimentConditionField }
  | { kind: 'set-weeks'; weeks: number }
  | { kind: 'replan-from-today' }
export type ExperimentCheck = {
  id: 'feature' | 'metrics' | 'eligibility' | 'split' | 'window' | 'srm'
  status: CheckStatus
  /** The builder step the check points at; `null` for the always-on SRM check. */
  step: 1 | 2 | 3 | 4 | 5 | null
  title: string
  detail: string
  fix?: { label: string } & CheckFix
}

/** A run of the plan sentence; `emphasis` is the prototype's `<em>`. The UI never parses HTML. */
export type SentencePart = { text: string; emphasis: boolean }

export type ExperimentPlan = {
  experimentKey: string
  flagKey: string
  createsFeature: boolean
  definition: ExperimentDefinition
  flagDefinition: FlagDefinition
  weights: number[]
  estimate: {
    /** Assignment entities a day that will be IN the test (after conditions and allocation). */
    inTestPerDay: number
    /** The metric's baseline rate for this entity type, 0–1, or `null` when the catalog has none. */
    baseline: number | null
    needPerVersion: number | null
    days: number | null
    recommendedWeeks: number
  }
  checks: ExperimentCheck[]
  failing: number
  sentence: SentencePart[]
  hypothesis: string
  /** Non-blocking notes that do not fit a check (D4's served-rule warning). */
  notes: string[]
}

export type ExperimentPlanResult = { ok: true; plan: ExperimentPlan } | { ok: false; errors: string[] }

// ── the maths (shown as days, never as a formula) ─────────────────────────────────────────────

/** n ≈ 16·p(1−p)/δ² per version: 80 % power, α = 0.05, δ = p × MDE. `null` when p is not in (0,1). */
export function sampleSizePerVersion(baseline: number | null, mdePercent: number): number | null {
  if (baseline === null || !(baseline > 0 && baseline < 1) || !(mdePercent > 0)) return null
  const delta = (baseline * mdePercent) / 100
  return Math.ceil((16 * baseline * (1 - baseline)) / (delta * delta))
}

/** Integer percents summing to 100, control first. Two versions follow `split`; more split evenly. */
export function versionWeights(versionCount: number, split: number): number[] {
  if (versionCount === 2) return [100 - split, split]
  const even = Math.floor(100 / versionCount)
  const weights = Array.from({ length: versionCount }, () => even)
  weights[0] += 100 - even * versionCount
  return weights
}

/**
 * D4's stacked rollouts. Rule *i* admits `a·wᵢ / (1 − Σⱼ<ᵢ a·wⱼ)` of the people who reach it, so,
 * rules being independent (see EXPERIMENT_RULE_PRIORITIES), arm *i* ends up with exactly `a·wᵢ` and
 * `1 − a` fall through. `null` means "no rollout" — the last arm when everyone eligible is in.
 */
export function stackedBasisPoints(
  weights: readonly number[],
  allocationPercent: number
): Array<number | null> {
  const a = allocationPercent / 100
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let consumed = 0
  return weights.map((weight, index) => {
    const share = (a * weight) / total
    const last = index === weights.length - 1
    const basisPoints =
      last && allocationPercent >= 100 ? null : Math.round((10_000 * share) / (1 - consumed))
    consumed += share
    return basisPoints === null ? null : Math.min(10_000, Math.max(0, basisPoints))
  })
}

// ── words ─────────────────────────────────────────────────────────────────────────────────────

function joinWith(items: string[], last: string): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`
}

const ENTITY_PLURALS: Record<string, string> = { merchant: 'merchants', user: 'people', device: 'devices' }
export function entityPlural(type: string): string {
  return ENTITY_PLURALS[type] ?? `${type.replace(/_/g, ' ')}s`
}

/** `checkout_completed` → "checkout completed". The catalog has names, not nouns; say the name plainly. */
export function eventWords(event: string): string {
  return event.replace(/[._]+/g, ' ').trim()
}

function conditionWords(condition: ExperimentCondition): string {
  const values = joinWith(condition.values.map(String), 'or')
  switch (condition.field) {
    case 'region':
      return `in ${values}`
    case 'channel':
      return `on ${values}`
    case 'plan':
      return `on the ${values} plan`
    case 'source':
      return `who came from ${values}`
    case 'campaign':
      return `from the ${values} campaign`
  }
}

export function whoWords(answers: Pick<ExperimentBuilderAnswers, 'who' | 'entity'>): string {
  const base = entityPlural(answers.entity)
  // Only conditions with a value: an unfinished one fails check 3; it must not print "in  ".
  const conditions =
    answers.who.mode === 'everyone'
      ? []
      : answers.who.conditions.filter((condition) => condition.values.length > 0)
  if (conditions.length === 0) return `${base} who reach it`
  return `${base} ${joinWith(conditions.map(conditionWords), 'and')}`
}

export function shareWords(percent: number): string {
  if (percent === 50) return 'half'
  if (percent === 100) return 'all'
  if (percent === 25) return 'a quarter'
  return `${Math.round(percent * 10) / 10}%`
}

// ── D5: template defaults, resolved against THIS project's catalog ─────────────────────────────

/** Metric candidates: events the product really sends, most frequent first, never a reserved one. */
export function metricCandidates(catalog: EventCatalog): string[] {
  return catalog.events
    .filter((event) => !event.reserved)
    .sort((a, b) => b.count14d - a.count14d || a.event.localeCompare(b.event))
    .map((event) => event.event)
}

export type ResolvedDefaults = {
  answers: ExperimentBuilderAnswers | null
  /** Every field a template filled, so the UI can tag it "suggested" (D5). */
  suggested: Array<'metric' | 'guardrails' | 'breakdowns' | 'who' | 'entity' | 'weeks'>
  /** Why a field was NOT filled — the honest empty state (CODE-QUALITY #8). */
  gaps: string[]
}

/**
 * The answers a template arrives with, for THIS project. Returns `answers: null` only when the
 * catalog has no usable event at all — there is no metric to suggest, and inventing one is the
 * exact failure D5 exists to prevent.
 */
export function resolveTemplateDefaults(
  template: ExperimentTemplateKey,
  context: {
    catalog: EventCatalog
    flagKey: string | null
    /** The feature registry's `adoptedEvent` for this flag, when the project declared one. */
    adoptedEvent?: string | null
    served?: ServedFeature
  }
): ResolvedDefaults {
  const spec = EXPERIMENT_TEMPLATES[template]
  const events = metricCandidates(context.catalog)
  const gaps: string[] = []
  if (events.length === 0) {
    return {
      answers: null,
      suggested: [],
      gaps: ["Your product hasn't sent any events in the last 14 days."],
    }
  }
  const metric =
    (context.adoptedEvent && events.includes(context.adoptedEvent) ? context.adoptedEvent : null) ??
    events.find((event) => spec.metricPattern.test(event)) ??
    events[0]
  const guardrails = events
    .filter((event) => event !== metric && GUARDRAIL_PATTERN.test(event))
    .slice(0, spec.guardrailCount)
  if (guardrails.length === 0)
    gaps.push('No event looks like a guardrail (errors, refunds, abandons), so none is suggested.')

  const coverage = (field: ExperimentConditionField) =>
    context.catalog.segments.find((segment) => segment.field === field)
  const conditionSegment = spec.conditionField ? coverage(spec.conditionField) : undefined
  const topValue = conditionSegment?.values[0]?.value
  const conditionUsable =
    spec.conditionField !== null &&
    conditionSegment !== undefined &&
    conditionSegment.coverage >= 0.9 &&
    topValue !== undefined &&
    predicateValueAllowed(topValue)
  if (spec.conditionField && !conditionUsable) {
    gaps.push(
      `Too few of your events carry "${spec.conditionField}" to suggest a condition, so everyone who reaches it is in.`
    )
  }
  const breakdown = coverage(spec.breakdownField)
  const breakdowns: ExperimentConditionField[] =
    breakdown && breakdown.coverage >= 0.5 ? [spec.breakdownField] : []
  if (breakdowns.length === 0)
    gaps.push(`Too few of your events carry "${spec.breakdownField}" to break results down by it.`)

  const seen = [...context.catalog.entities].sort((a, b) => b.subjects14d - a.subjects14d)
  const entity = seen.some((row) => row.type === spec.entity) ? spec.entity : (seen[0]?.type ?? spec.entity)

  const versions = versionNamesFor(spec.versionNames, context.served ?? null)
  const answers: ExperimentBuilderAnswers = {
    template,
    flagKey: context.flagKey,
    why: spec.why,
    direction: GUARDRAIL_PATTERN.test(metric) ? 'decrease' : 'increase',
    metric,
    guardrails,
    breakdowns,
    mde: spec.mde,
    who: {
      mode: conditionUsable ? 'some' : 'everyone',
      conditions: conditionUsable ? [{ field: spec.conditionField!, values: [topValue!] }] : [],
      allocation: 100,
    },
    entity,
    versions,
    split: spec.split,
    weeks: 2,
  }
  return {
    answers,
    suggested: ['metric', 'guardrails', 'breakdowns', 'who', 'entity', 'weeks'],
    gaps,
  }
}

/** An existing multi-value feature fixes the number of versions (D4); an on/off one has two. */
function versionNamesFor(names: [string, string], served: ServedFeature): string[] {
  if (!served || served.definition.valueType === 'boolean') return [...names]
  return orderedVariants(served.definition).map((variant, index) =>
    index === 0 ? names[0] : `Version ${letter(index)}`
  )
}

function letter(index: number): string {
  return String.fromCharCode(65 + index)
}

/** The value a predicate may hold (`validScalarPredicate`): a catalog value outside it is never offered. */
export function predicateValueAllowed(value: FlagScalar): boolean {
  if (typeof value === 'string')
    return !value.includes('\0') && Array.from(value).length <= MAX_EXPERIMENT_PREDICATE_STRING_LENGTH
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000_000
  return true
}

// ── naming ────────────────────────────────────────────────────────────────────────────────────

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function unique(base: string, taken: readonly string[], max: number): string | null {
  const trimmed = base.slice(0, max)
  if (!taken.includes(trimmed)) return trimmed
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, max - suffix.length)}${suffix}`
    if (!taken.includes(candidate)) return candidate
  }
  // Never hand back a taken name (Codex, PR #169): the save would collide with someone else's test.
  return null
}

export function newFeatureKey(template: ExperimentTemplateKey, taken: readonly string[]): string | null {
  return unique(`experiments.${EXPERIMENT_TEMPLATES[template].suffix}_enabled`, taken, 128)
}

export function experimentKeyFor(
  flagKey: string,
  template: ExperimentTemplateKey,
  taken: readonly string[]
): string | null {
  const short = slug((flagKey.split('.').pop() ?? flagKey).replace(/_enabled$/, '')) || 'feature'
  const suffix = EXPERIMENT_TEMPLATES[template].suffix
  const named = /^[a-z]/.test(short) ? short : `f_${short}`
  // A feature created FOR the test is already named after it (`experiments.copy_test_enabled`); do not
  // say it twice (`copy_test_copy_test`, seen in the rendered look).
  const base = named === suffix || named.endsWith(`_${suffix}`) ? named : `${named}_${suffix}`
  return unique(base, taken, 64)
}

/** Served variants, the DEFAULT (control) first, the rest in declared order. */
function orderedVariants(definition: FlagDefinition) {
  const control = definition.variants.find((variant) => variant.key === definition.defaultVariantKey)
  return control
    ? [control, ...definition.variants.filter((variant) => variant.key !== control.key)]
    : [...definition.variants]
}

// ── the flag version (D4) ─────────────────────────────────────────────────────────────────────

/**
 * The share of recent events meeting every condition, and whether that number is EXACT.
 *
 * - One condition: its marginal (`coverage × the chosen values' shares`) — exact for the top 20 values.
 * - Several, with a COMPLETE combination table: the joint share — exact, and it knows when tags never
 *   arrive together (Codex, PR #169).
 * - Several, with an INCOMPLETE table (one high-cardinality tag pushes a tenant past the cap): the
 *   product of marginals, flagged approximate. The table alone would count only the top combinations
 *   and read a real audience as zero (fresh reviewer + Codex, PR #169, round 3).
 */
export function audienceShare(
  answers: ExperimentBuilderAnswers,
  catalog: EventCatalog
): { fraction: number; exact: boolean } {
  const conditions = activeConditions(answers)
  if (answers.who.mode === 'everyone' || conditions.length === 0) return { fraction: 1, exact: true }
  const marginal = (condition: ExperimentCondition) => {
    const segment = catalog.segments.find((row) => row.field === condition.field)
    if (!segment) return 0
    return (
      segment.coverage *
      segment.values
        .filter((row) =>
          condition.values.some((value) => typeof value === typeof row.value && value === row.value)
        )
        .reduce((sum, row) => sum + row.share, 0)
    )
  }
  if (conditions.length === 1) {
    // Exact only if every chosen value is in the listed top values, or the list is not truncated —
    // a value cut from the top 20 would otherwise count as zero (fresh reviewer + Codex, round 4).
    const segment = catalog.segments.find((row) => row.field === conditions[0].field)
    const listed = (value: FlagScalar) =>
      segment?.values.some((row) => typeof row.value === typeof value && row.value === value) === true
    const exact = segment !== undefined && (segment.values.length < 20 || conditions[0].values.every(listed))
    return { fraction: marginal(conditions[0]), exact }
  }
  const { rows, combos, complete } = catalog.segmentCombos
  if (!complete)
    return {
      fraction: conditions.reduce((product, condition) => product * marginal(condition), 1),
      exact: false,
    }
  if (rows === 0) return { fraction: 0, exact: true }
  const matched = combos
    .filter((combo) =>
      conditions.every((condition) =>
        condition.values.some((value) => {
          const actual = combo.values[condition.field]
          return typeof actual === typeof value && actual === value
        })
      )
    )
    .reduce((sum, combo) => sum + combo.count, 0)
  return { fraction: matched / rows, exact: true }
}

function activeConditions(answers: ExperimentBuilderAnswers): ExperimentCondition[] {
  return answers.who.mode === 'everyone'
    ? []
    : answers.who.conditions.filter((condition) => condition.values.length > 0)
}

function clausesFor(answers: ExperimentBuilderAnswers): FlagClause[] {
  if (answers.who.mode === 'everyone') return []
  // A condition with no value picked is a CHECK failure (D6 check 3), not a plan error: Save draft must
  // still work, and the flag parser would refuse an empty `one_of` (fresh reviewer, PR #169).
  return activeConditions(answers).map((condition) =>
    condition.values.length === 1
      ? { field: condition.field, operator: 'equals' as const, value: condition.values[0] }
      : { field: condition.field, operator: 'one_of' as const, values: [...condition.values] }
  )
}

/**
 * D8 — the served definition with the experiment taken OUT: its rules, its three metadata keys, and
 * the +10000 offset on the feature's own rules undone. Without it `planFlagSet` would carry the split
 * forward, because `set` preserves rules by design.
 */
export function stripExperiment(definition: FlagDefinition): FlagDefinition {
  const metadata = { ...(definition.metadata ?? {}) }
  const listed = metadata[EXPERIMENT_METADATA_KEYS.rules]
  const experimentRules = new Set(
    typeof listed === 'string' && /^\d{1,7}(,\d{1,7})*$/.test(listed) ? listed.split(',').map(Number) : []
  )
  delete metadata[EXPERIMENT_METADATA_KEYS.key]
  delete metadata[EXPERIMENT_METADATA_KEYS.version]
  delete metadata[EXPERIMENT_METADATA_KEYS.rules]
  const shifted = experimentRules.size > 0
  const rules = definition.rules
    .filter((rule) => !experimentRules.has(rule.priority))
    .map((rule) =>
      shifted && rule.priority >= SERVED_RULE_OFFSET
        ? { ...rule, priority: rule.priority - SERVED_RULE_OFFSET }
        : rule
    )
  const { metadata: _drop, ...rest } = definition
  return { ...rest, rules, ...(Object.keys(metadata).length > 0 ? { metadata } : {}) }
}

/**
 * D8 — "Set ‹version› for everyone in Production": `planFlagSet` on the stripped definition.
 *
 * ⚠️ It names the experiment it expects to be stripping and REFUSES any other (fresh reviewer, PR
 * #169): the served version can change between the page loading and the press, and a Production
 * write must never remove a different experiment's split.
 */
export function planExperimentRollout(
  served: FlagDefinition,
  variantKey: string,
  expected: { experimentKey: string; version: number }
): FlagPlanResult {
  const metadata = served.metadata ?? {}
  if (
    metadata[EXPERIMENT_METADATA_KEYS.key] !== expected.experimentKey ||
    metadata[EXPERIMENT_METADATA_KEYS.version] !== expected.version
  ) {
    return {
      ok: false,
      errors: [
        `Production is no longer serving ${expected.experimentKey} v${expected.version}; nothing was changed.`,
      ],
    }
  }
  return planFlagSet({ current: stripExperiment(served), variantKey, environments: ['production'] })
}

// ── the plan ──────────────────────────────────────────────────────────────────────────────────

export function buildExperimentPlan(
  answers: ExperimentBuilderAnswers,
  context: ExperimentPlanContext
): ExperimentPlanResult {
  // The planner validates its own input: it is a shared seam, and "the caller already checked" is how
  // `template: 'toString'` became a flag key (fresh reviewer, PR #169).
  const checked = parseExperimentBuilderAnswers(answers)
  if (!checked.ok) return { ok: false, errors: [checked.error] }
  const errors: string[] = []
  const spec = EXPERIMENT_TEMPLATES[answers.template]

  // ── versions and their flag values ──
  const served = context.served
  const names = answers.versions.map((name) => name.trim())
  if (names.length < 2 || names.length > MAX_EXPERIMENT_VERSIONS)
    errors.push(`A test has 2–${MAX_EXPERIMENT_VERSIONS} versions.`)
  if (new Set(names).size !== names.length) errors.push('Two versions have the same name.')
  if (
    names.some((name) => name.length === 0 || Array.from(name).length > MAX_EXPERIMENT_VARIANT_LABEL_LENGTH)
  )
    errors.push(`A version name is 1–${MAX_EXPERIMENT_VARIANT_LABEL_LENGTH} characters.`)

  let variantKeys: string[]
  let flagBase: FlagDefinition
  let flagKey: string
  const createsFeature = answers.flagKey === null
  if (createsFeature) {
    const named = context.draft?.flagKey ?? newFeatureKey(answers.template, context.takenFlagKeys)
    if (named === null)
      return { ok: false, errors: ['Too many features already have this name; pick an existing feature.'] }
    flagKey = named
    variantKeys = names.map((name, index) => {
      const key = slug(name) || `version_${letter(index).toLowerCase()}`
      return /^[a-z]/.test(key) ? key.slice(0, 64) : `v_${key}`.slice(0, 64)
    })
    if (new Set(variantKeys).size !== variantKeys.length)
      errors.push('Two version names make the same value.')
    flagBase = {
      valueType: 'string',
      description: `Created for the ${spec.name.toLowerCase()} test.`,
      defaultVariantKey: variantKeys[0],
      variants: variantKeys.map((key) => ({ key, value: key })),
      rules: [],
    }
  } else {
    if (!served || served.flagKey !== answers.flagKey)
      return { ok: false, errors: ['The feature is not loaded.'] }
    flagKey = served.flagKey
    // ⚠️ STRIPPED first (agy, PR #169). A feature can already be serving an experiment — exactly the
    // "Change the plan" case, where v1's flag version is live — and planning on it raw would treat
    // v1's rules as the customer's own and push them (and the already-shifted ones) further down.
    flagBase = stripExperiment(served.definition)
    const ordered = orderedVariants(flagBase)
    variantKeys = ordered.map((variant) => variant.key)
    if (variantKeys.length !== names.length)
      errors.push(
        `${flagKey} has ${variantKeys.length} values, so the test has exactly ${variantKeys.length} versions.`
      )
    if (flagBase.rules.some((rule) => rule.priority + SERVED_RULE_OFFSET > MAX_RULE_PRIORITY))
      errors.push("One of this feature's rules has a priority too high to move below the test's.")
  }
  if (answers.split < 1 || answers.split > 99 || !Number.isInteger(answers.split))
    errors.push('The split is 1–99 %.')
  if (answers.who.allocation < 1 || answers.who.allocation > 100 || !Number.isInteger(answers.who.allocation))
    errors.push('"How many of them" is 1–100 %.')
  if (!(WEEK_OPTIONS as readonly number[]).includes(answers.weeks))
    errors.push('Pick a run length from the list.')
  if (errors.length > 0) return { ok: false, errors }

  const weights = versionWeights(names.length, answers.split)
  const experimentKey =
    context.draft?.experimentKey ?? experimentKeyFor(flagKey, answers.template, context.takenExperimentKeys)
  if (experimentKey === null) return { ok: false, errors: ['Too many experiments already have this name.'] }

  // ── the experiment's rules (D4) ──
  const clauses = clausesFor(answers)
  const basisPoints = stackedBasisPoints(weights, answers.who.allocation)
  const experimentRules: FlagRule[] = variantKeys.map((variantKey, index) => ({
    priority: EXPERIMENT_RULE_PRIORITIES[index],
    clauses,
    ...(basisPoints[index] === null ? {} : { rollout: { basisPoints: basisPoints[index]! } }),
    variantKey,
  }))
  const servedRules = flagBase.rules.map((rule) => ({
    ...rule,
    priority: rule.priority + SERVED_RULE_OFFSET,
  }))
  const metadata = {
    ...(flagBase.metadata ?? {}),
    [EXPERIMENT_METADATA_KEYS.key]: experimentKey,
    [EXPERIMENT_METADATA_KEYS.version]: context.nextVersion,
    [EXPERIMENT_METADATA_KEYS.rules]: EXPERIMENT_RULE_PRIORITIES.slice(0, variantKeys.length).join(','),
  }
  if (Object.keys(metadata).length > MAX_FLAG_METADATA_ENTRIES)
    return { ok: false, errors: [`${flagKey} already carries too much metadata to name a test.`] }
  const flagParsed = parseFlagDefinition({
    ...flagBase,
    rules: [...experimentRules, ...servedRules].sort((a, b) => a.priority - b.priority),
    metadata,
  })
  if (!flagParsed.ok) return { ok: false, errors: flagParsed.errors }

  // ── the estimate ──
  const entityRow = context.catalog.entities.find((row) => row.type === answers.entity)
  const perDay =
    entityRow && context.catalog.observedDays > 0 ? entityRow.subjects14d / context.catalog.observedDays : 0
  // The JOINT share of recent events meeting every condition, read from the catalog's segment
  // combinations — never a product of marginals, which invents traffic for tags that never co-occur
  // (Codex, PR #169). With an incomplete combination table it is a lower bound.
  const { fraction: conditionFraction, exact: shareExact } = audienceShare(answers, context.catalog)
  // ⚠️ THE RULE, final form (Codex + fresh reviewer, PR #169 rounds 3–5): an estimate can BLOCK Start
  // only when it is a count, not a share — everyone who reaches it, on a catalog that was not cut at
  // the row cap. Any condition makes it a share of events applied to people, and a capped catalog
  // sees only its newest rows; both can be far off, so every estimate-driven check then only warns.
  const estimateExact =
    (answers.who.mode === 'everyone' || activeConditions(answers).length === 0) && !context.catalog.truncated
  // ⚠️ An APPROXIMATION, named (fresh reviewer, round 4): `conditionFraction` is a share of EVENTS,
  // used here as a share of PEOPLE. It is biased when tagged events concentrate among heavy users.
  // The screen says "about"; check 3 (D6) is defined on events, so that check is exact about its own
  // claim, and the estimate is only ever as good as this line.
  const inTestPerDay = perDay * conditionFraction * (answers.who.allocation / 100)
  const baseline =
    context.catalog.baselines.find((row) => row.event === answers.metric && row.type === answers.entity)
      ?.baseline ?? null
  const needPerVersion = sampleSizePerVersion(baseline, answers.mde)
  const slowest = (inTestPerDay * Math.min(...weights)) / 100
  const days = needPerVersion === null || slowest <= 0 ? null : Math.ceil(needPerVersion / slowest)
  const recommendedWeeks = days === null ? 4 : Math.max(2, Math.ceil(days / 7))

  // ── the window ──
  // A saved window is kept only while it still IS the plan: once the run length changes, the draft is
  // a different plan and gets a window from now — otherwise check 5's "Run it for N weeks" could never
  // clear itself on a saved draft (fresh reviewer, PR #169).
  const saved = context.savedWindow
  const savedWindow =
    saved &&
    new Date(saved.endAt).getTime() - new Date(saved.startAt).getTime() === answers.weeks * 7 * DAY_MS
      ? saved
      : undefined
  const startAt = savedWindow ? new Date(savedWindow.startAt) : startOfMinute(context.now)
  const endAt = savedWindow
    ? new Date(savedWindow.endAt)
    : new Date(startAt.getTime() + answers.weeks * 7 * DAY_MS)

  // ── the definition ──
  const tags = Object.fromEntries(
    answers.who.mode === 'everyone'
      ? []
      : activeConditions(answers).map((condition) => [
          condition.field,
          condition.values.length === 1 ? condition.values[0] : [...condition.values],
        ])
  )
  const hypothesis = hypothesisText(answers, names)
  const definitionParsed = parseExperimentDefinition({
    hypothesis,
    assignmentEntityType: answers.entity,
    eligibility: {
      description: truncate(`${answers.who.allocation}% of ${whoWords(answers)}`, 500),
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
    },
    variants: variantKeys.map((key, index) => ({ key, weight: weights[index], label: names[index] })),
    controlVariantKey: variantKeys[0],
    primaryMetric: { event: answers.metric, direction: spec.guarded ? 'increase' : answers.direction },
    guardrailMetrics: answers.guardrails
      .filter((event) => event !== answers.metric)
      .map((event) => ({ event, direction: GUARDRAIL_PATTERN.test(event) ? 'decrease' : 'increase' })),
    segmentFields: [...answers.breakdowns],
    plannedWindow: { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
    minimumSamplePerVariant: Math.min(MAX_EXPERIMENT_SAMPLE_PER_VARIANT, Math.max(1, needPerVersion ?? 1000)),
  })
  if (!definitionParsed.ok) return { ok: false, errors: definitionParsed.errors }

  const checks = computeChecks(answers, context, {
    experimentKey,
    savedWindow: savedWindow !== undefined,
    flagKey,
    createsFeature,
    weights,
    days,
    needPerVersion,
    inTestPerDay,
    estimateExact,
    startAt,
    endAt,
  })
  const notes: string[] = []
  if (!createsFeature && flagBase.rules.length > 0)
    notes.push(
      `${flagKey} has ${flagBase.rules.length} rule${flagBase.rules.length === 1 ? '' : 's'} of its own. People left out of the test fall through to them, so some may not see ${names[0]}.`
    )
  if (!shareExact)
    notes.push(
      'The number of people a day is approximate: your events carry more tag combinations than the estimate can hold, so the conditions are treated as independent.'
    )
  if (needPerVersion === null)
    notes.push(
      `There isn't a baseline for ${eventWords(answers.metric)} among ${entityPlural(answers.entity)} yet, so the minimum sample is set to 1,000 per version.`
    )

  return {
    ok: true,
    plan: {
      experimentKey,
      flagKey,
      createsFeature,
      definition: definitionParsed.definition,
      flagDefinition: flagParsed.definition,
      weights,
      estimate: { inTestPerDay, baseline, needPerVersion, days, recommendedWeeks },
      checks,
      failing: checks.filter((check) => check.status === 'fail').length,
      sentence: planSentence(answers, names, weights),
      hypothesis,
      notes,
    },
  }
}

/** By code point — `.slice` on UTF-16 can leave a lone surrogate that jsonb refuses. */
function truncate(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('')
}

function startOfMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000)
}

function hypothesisText(answers: ExperimentBuilderAnswers, names: string[]): string {
  const guarded = EXPERIMENT_TEMPLATES[answers.template].guarded
  const verb = guarded ? "won't lower" : answers.direction === 'increase' ? 'will raise' : 'will lower'
  return truncate(
    `We believe showing ${names[1]} to ${whoWords(answers)} ${verb} ${eventWords(answers.metric)} because ${EXPERIMENT_REASONS[answers.why]}.`,
    500
  )
}

/** The prototype's `planSentence`, as runs rather than HTML. */
export function planSentence(
  answers: ExperimentBuilderAnswers,
  names: string[],
  weights: number[]
): SentencePart[] {
  const parts: SentencePart[] = []
  const plain = (text: string) => parts.push({ text, emphasis: false })
  const em = (text: string) => parts.push({ text, emphasis: true })
  const treatmentShare = (weights[1] * answers.who.allocation) / 100
  const treatments = joinWith(names.slice(1), 'and')
  const many = names.length > 2
  const guards = answers.guardrails.filter((event) => event !== answers.metric)
  const guardClauses = [
    ...(guards.filter((event) => GUARDRAIL_PATTERN.test(event)).length
      ? [
          `${joinWith(guards.filter((event) => GUARDRAIL_PATTERN.test(event)).map(eventWords), 'and')} don't rise`,
        ]
      : []),
    ...(guards.filter((event) => !GUARDRAIL_PATTERN.test(event)).length
      ? [
          `${joinWith(guards.filter((event) => !GUARDRAIL_PATTERN.test(event)).map(eventWords), 'and')} don't drop`,
        ]
      : []),
  ]
  em(treatments)
  plain(many ? ' each go to ' : ' goes to ')
  em(shareWords(treatmentShare))
  plain(' of ')
  em(whoWords(answers))
  if (EXPERIMENT_TEMPLATES[answers.template].guarded) {
    plain(" first. It's safe to go further if ")
    em(eventWords(answers.metric))
    plain(" doesn't drop")
    guardClauses.forEach((clause) => {
      plain(' and ')
      em(clause)
    })
    plain('.')
    return parts
  }
  plain('. It wins if ')
  em(eventWords(answers.metric))
  plain(answers.direction === 'increase' ? ' rises by at least ' : ' falls by at least ')
  em(`${answers.mde}%`)
  guardClauses.forEach((clause, index) => {
    plain(index === 0 ? ', as long as ' : ' and ')
    em(clause)
  })
  plain('.')
  return parts
}

export function sentenceText(parts: SentencePart[]): string {
  return parts.map((part) => part.text).join('')
}

// ── D6: the six checks ────────────────────────────────────────────────────────────────────────

function computeChecks(
  answers: ExperimentBuilderAnswers,
  context: ExperimentPlanContext,
  derived: {
    experimentKey: string
    savedWindow: boolean
    flagKey: string
    createsFeature: boolean
    weights: number[]
    days: number | null
    needPerVersion: number | null
    inTestPerDay: number
    estimateExact: boolean
    startAt: Date
    endAt: Date
  }
): ExperimentCheck[] {
  const checks: ExperimentCheck[] = []
  const { catalog } = context

  // 1 · the feature exists in Production, and something reads it
  if (derived.createsFeature) {
    checks.push({
      id: 'feature',
      status: 'fail',
      step: 1,
      title: 'The feature has no code behind it yet',
      detail: `${derived.flagKey} is created with this test, but nothing in Production checks it. Save a draft now and start once the code ships.`,
      fix: { label: 'Pick an existing feature', kind: 'step', step: 1 },
    })
  } else if (
    typeof context.served?.definition.metadata?.[EXPERIMENT_METADATA_KEYS.key] === 'string' &&
    context.served.definition.metadata[EXPERIMENT_METADATA_KEYS.key] !== derived.experimentKey
  ) {
    // Planning on the stripped definition would silently take the OTHER test's split out of
    // Production at Start (fresh reviewer, PR #169). One test per feature at a time.
    const other = String(context.served.definition.metadata[EXPERIMENT_METADATA_KEYS.key])
    checks.push({
      id: 'feature',
      status: 'fail',
      step: 1,
      title: 'Another test is using this feature',
      detail: `${derived.flagKey} is serving ${other} in Production. Finish that test (decide it, then roll the winner out or turn it off), or pick another feature.`,
      fix: { label: 'Pick another feature', kind: 'step', step: 1 },
    })
  } else if (!context.served?.activeInProduction) {
    checks.push({
      id: 'feature',
      status: 'fail',
      step: 1,
      title: "The feature isn't on in Production",
      detail: `${derived.flagKey} has no version serving in Production, so nobody would see a version.`,
      fix: { label: 'Pick another feature', kind: 'step', step: 1 },
    })
  } else {
    const evaluations =
      catalog.flagEvaluations.find((row) => row.flagKey === derived.flagKey)?.evaluations ?? 0
    checks.push(
      evaluations > 0
        ? {
            id: 'feature',
            status: 'ok',
            step: 1,
            title: 'The feature is live in Production',
            detail: `${derived.flagKey} was checked ${evaluations.toLocaleString('en-US')} times in the last 24 hours.`,
          }
        : {
            id: 'feature',
            status: 'warn',
            step: 1,
            title: "We can't see the feature being checked",
            detail: `${derived.flagKey} is on in Production, but no evaluation of it arrived in the last 24 hours. If your app doesn't report flag checks, the test will serve its split and count nobody.`,
          }
    )
  }

  // 2 · every metric arrived in the last 24 hours
  const metrics = [answers.metric, ...answers.guardrails.filter((event) => event !== answers.metric)]
  const quiet = metrics.filter(
    (event) => (catalog.events.find((row) => row.event === event)?.count24h ?? 0) === 0
  )
  checks.push(
    quiet.length > 0
      ? {
          id: 'metrics',
          status: 'fail',
          step: 4,
          title: 'A metric has gone quiet',
          detail: `${quiet.join(', ')} arrived 0 times in the last 24 hours. Is its tracking still running?`,
          fix: { label: 'Choose a different metric', kind: 'step', step: 4 },
        }
      : {
          id: 'metrics',
          status: 'ok',
          step: 4,
          title: 'Every metric arrived in the last 24 hours',
          detail: `${answers.metric}${metrics.length > 1 ? `, and all ${metrics.length - 1} guardrail${metrics.length - 1 === 1 ? '' : 's'}` : ''}.`,
        }
  )

  // 3 · eligibility tags on recent events
  if (answers.who.mode === 'everyone' || answers.who.conditions.length === 0) {
    checks.push({
      id: 'eligibility',
      status: 'ok',
      step: 2,
      title: 'Everyone who reaches it can be in the test',
      detail: 'No tags to check.',
    })
  } else {
    const empty = answers.who.conditions.find((condition) => condition.values.length === 0)
    const scored = answers.who.conditions
      .map((condition) => ({
        condition,
        coverage: catalog.segments.find((row) => row.field === condition.field)?.coverage ?? 0,
      }))
      .sort((a, b) => a.coverage - b.coverage)
    const worst = scored[0]
    const percent = Math.round(worst.coverage * 100)
    if (empty) {
      checks.push({
        id: 'eligibility',
        status: 'fail',
        step: 2,
        title: 'A condition has no value picked',
        detail: `Pick at least one ${empty.field}, or remove the condition.`,
        fix: { label: 'Fix who’s in it', kind: 'step', step: 2 },
      })
    } else if (worst.coverage < 0.1) {
      checks.push({
        id: 'eligibility',
        status: 'fail',
        step: 2,
        title: "Your events don't carry one of the tags",
        detail: `Only ${percent}% of recent events carry ${worst.condition.field}, so almost nobody can match it and the test would never fill.`,
        fix: {
          label: `Remove the ${worst.condition.field} condition`,
          kind: 'remove-condition',
          field: worst.condition.field,
        },
      })
    } else if (worst.coverage < 0.9) {
      checks.push({
        id: 'eligibility',
        status: 'warn',
        step: 2,
        title: 'One tag is missing from some events',
        detail: `${percent}% of recent events carry ${worst.condition.field}. People whose events lack it are left out, which the estimate already counts.`,
      })
    } else {
      checks.push({
        id: 'eligibility',
        status: 'ok',
        step: 2,
        title: 'Your eligibility tags appear on recent events',
        detail: scored
          .map((row) => `${row.condition.field} on ${Math.round(row.coverage * 100)}%`)
          .join(' · '),
      })
    }
  }

  // 4 · the split adds up
  const sum = derived.weights.reduce((total, weight) => total + weight, 0)
  checks.push(
    sum === 100 && derived.weights.every((weight) => weight >= 1)
      ? {
          id: 'split',
          status: 'ok',
          step: 3,
          title: 'The split adds up',
          detail: `${derived.weights.join(' / ')}, which is 100%.`,
        }
      : {
          id: 'split',
          status: 'fail',
          step: 3,
          title: "The split doesn't add up",
          detail: `${derived.weights.join(' / ')} is ${sum}%.`,
          fix: { label: 'Fix the split', kind: 'step', step: 3 },
        }
  )

  // 5 · it runs long enough — measured from NOW for a saved draft (A6)
  // A fresh plan runs its FULL planned length (its window starts at the minute boundary before `now`,
  // so measuring from `now` would lose a day to rounding — agy, PR #169). A saved draft's window is
  // already running down, so it is measured from now.
  const remainingDays = derived.savedWindow
    ? Math.floor(
        (derived.endAt.getTime() - Math.max(context.now.getTime(), derived.startAt.getTime())) / DAY_MS
      )
    : answers.weeks * 7
  const fitting =
    (WEEK_OPTIONS as readonly number[]).find((weeks) => derived.days !== null && weeks * 7 >= derived.days) ??
    8
  if (derived.inTestPerDay <= 0 && !derived.estimateExact) {
    // An approximate zero is not evidence that nobody matches — never block Start on it.
    checks.push({
      id: 'window',
      status: 'warn',
      step: 2,
      title: "We can't tell how many people match",
      detail:
        'Your events carry too many different tag combinations to count these conditions together, so there is no estimate of how long it needs.',
    })
  } else if (derived.inTestPerDay <= 0) {
    checks.push({
      id: 'window',
      status: 'fail',
      step: 2,
      title: 'Nobody matches who’s in it',
      detail: 'With these conditions no one would enter the test.',
      fix: { label: 'Loosen who’s in it', kind: 'step', step: 2 },
    })
  } else if (derived.days === null) {
    checks.push({
      id: 'window',
      status: 'warn',
      step: 5,
      title: "We can't estimate how long it needs",
      detail: `${eventWords(answers.metric)} has no baseline among ${entityPlural(answers.entity)} yet, so there's no number of days to check the plan against.`,
    })
  } else if (derived.days > WEEK_OPTIONS[WEEK_OPTIONS.length - 1] * 7) {
    // No run length on offer fits, so "Run it for 8 weeks" would be a fix that cannot fix anything.
    // ⚠️ THE RULE (after three review rounds found three instances of one class — an imprecise
    // estimate blocking Start): check 5 FAILS only on an EXACT estimate. An approximate one warns and
    // keeps its fix. A window whose dates have already passed is a fact, not an estimate, and fails.
    checks.push({
      id: 'window',
      status: derived.estimateExact ? 'fail' : 'warn',
      step: 2,
      title: 'Not enough people for any run length',
      detail: `It needs about ${derived.days} days at your current traffic — longer than the ${WEEK_OPTIONS[WEEK_OPTIONS.length - 1]}-week maximum. Include more people, or look for a bigger change.`,
      fix: { label: 'Change who’s in it', kind: 'step', step: 2 },
    })
  } else if (
    derived.savedWindow &&
    derived.startAt.getTime() < context.now.getTime() &&
    remainingDays < derived.days
  ) {
    checks.push({
      id: 'window',
      status: derived.estimateExact || remainingDays <= 0 ? 'fail' : 'warn',
      step: 5,
      title: 'This draft’s dates have run out',
      detail: `It was planned from ${derived.startAt.toISOString().slice(0, 10)}; ${Math.max(0, remainingDays)} days are left and it needs about ${derived.days}.`,
      fix: { label: 'Plan it from today', kind: 'replan-from-today' },
    })
  } else if (remainingDays < derived.days) {
    checks.push({
      id: 'window',
      status: derived.estimateExact ? 'fail' : 'warn',
      step: 5,
      title: 'The test ends before it has enough people',
      detail: `${answers.weeks} week${answers.weeks === 1 ? '' : 's'} planned, but it needs about ${derived.days} days at your current traffic.`,
      fix: { label: `Run it for ${fitting} weeks`, kind: 'set-weeks', weeks: fitting },
    })
  } else {
    checks.push({
      id: 'window',
      status: 'ok',
      step: 5,
      title: 'It runs long enough',
      detail: `${answers.weeks} weeks planned, about ${derived.days} days needed.`,
    })
  }

  // 6 · split checking is armed (the governed analysis always runs SRM at α = 0.01)
  checks.push({
    id: 'srm',
    status: 'ok',
    step: null,
    title: 'Split checking is on',
    detail: `Every day we check that people are divided ${derived.weights.join(' / ')} and alert you if they drift (p < 0.01).`,
  })
  return checks
}

// ── the browser's answers, checked before the planner sees them (D7) ───────────────────────────

const REASON_KEYS = new Set(Object.keys(EXPERIMENT_REASONS))
const TEMPLATE_KEYS = new Set(Object.keys(EXPERIMENT_TEMPLATES))
const CONDITION_FIELDS = new Set<string>(['region', 'channel', 'plan', 'source', 'campaign'])
const ANSWER_KEYS = [
  'template',
  'flagKey',
  'why',
  'direction',
  'metric',
  'guardrails',
  'breakdowns',
  'mde',
  'who',
  'entity',
  'versions',
  'split',
  'weeks',
]

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The ONLY way a server action turns browser input into answers. Closed shape, bounded sizes, known
 * keys — anything else is refused, never coerced (CODE-QUALITY #7). The planner then applies the
 * product rules; this only guarantees it is handed the type it declares.
 */
export function parseExperimentBuilderAnswers(
  input: unknown
): { ok: true; answers: ExperimentBuilderAnswers } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error })
  if (!plainObject(input)) return bad('Answers must be an object.')
  if (Object.keys(input).some((key) => !ANSWER_KEYS.includes(key)))
    return bad('Answers carry an unknown field.')
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.length > 0 && value.length <= max
  const int = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
  if (!TEMPLATE_KEYS.has(input.template as string)) return bad('Unknown template.')
  if (input.flagKey !== null && !text(input.flagKey, 128)) return bad('Invalid feature.')
  if (!REASON_KEYS.has(input.why as string)) return bad('Unknown reason.')
  if (input.direction !== 'increase' && input.direction !== 'decrease') return bad('Invalid direction.')
  if (!text(input.metric, 128) || RESERVED_EVENTS.has(input.metric as string)) return bad('Invalid metric.')
  if (
    !Array.isArray(input.guardrails) ||
    input.guardrails.length > 10 ||
    !input.guardrails.every((event) => text(event, 128) && !RESERVED_EVENTS.has(event as string))
  )
    return bad('Invalid guardrails.')
  if (
    !Array.isArray(input.breakdowns) ||
    input.breakdowns.length > 5 ||
    !input.breakdowns.every((field) => CONDITION_FIELDS.has(field as string))
  )
    return bad('Invalid breakdowns.')
  if (!int(input.mde, 1, 100) || !int(input.split, 1, 99) || !int(input.weeks, 1, 8))
    return bad('Invalid numbers.')
  if (!text(input.entity, 64)) return bad('Invalid entity.')
  if (
    !Array.isArray(input.versions) ||
    input.versions.length < 2 ||
    input.versions.length > MAX_EXPERIMENT_VERSIONS ||
    !input.versions.every((name) => text(name, 80))
  )
    return bad('Invalid versions.')
  const who = input.who
  if (!plainObject(who) || (who.mode !== 'everyone' && who.mode !== 'some') || !int(who.allocation, 1, 100))
    return bad('Invalid audience.')
  if (Object.keys(who).some((key) => !['mode', 'conditions', 'allocation'].includes(key)))
    return bad('Invalid audience.')
  if (!Array.isArray(who.conditions) || who.conditions.length > 5) return bad('Invalid conditions.')
  const fields = new Set<string>()
  for (const condition of who.conditions) {
    if (!plainObject(condition) || Object.keys(condition).some((key) => key !== 'field' && key !== 'values'))
      return bad('Invalid condition.')
    if (!CONDITION_FIELDS.has(condition.field as string) || fields.has(condition.field as string))
      return bad('Invalid condition field.')
    fields.add(condition.field as string)
    if (
      Array.isArray(condition.values) &&
      new Set(condition.values.map((value) => `${typeof value}:${String(value)}`)).size !==
        condition.values.length
    )
      return bad('A condition lists the same value twice.')
    if (
      !Array.isArray(condition.values) ||
      condition.values.length > 20 ||
      !condition.values.every(
        (value) =>
          (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
          predicateValueAllowed(value)
      )
    )
      return bad('Invalid condition values.')
  }
  return { ok: true, answers: input as unknown as ExperimentBuilderAnswers }
}
