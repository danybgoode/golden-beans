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
import type { EventCatalog } from './event-catalog'
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
  takenExperimentKeys?: readonly string[]
  takenFlagKeys?: readonly string[]
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
  if (answers.who.mode === 'everyone' || answers.who.conditions.length === 0) return `${base} who reach it`
  return `${base} ${joinWith(answers.who.conditions.map(conditionWords), 'and')}`
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

function unique(base: string, taken: readonly string[], max: number): string {
  const trimmed = base.slice(0, max)
  if (!taken.includes(trimmed)) return trimmed
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, max - suffix.length)}${suffix}`
    if (!taken.includes(candidate)) return candidate
  }
  return trimmed
}

export function newFeatureKey(template: ExperimentTemplateKey, taken: readonly string[] = []): string {
  return unique(`experiments.${EXPERIMENT_TEMPLATES[template].suffix}_enabled`, taken, 128)
}

export function experimentKeyFor(
  flagKey: string,
  template: ExperimentTemplateKey,
  taken: readonly string[] = []
): string {
  const short = slug((flagKey.split('.').pop() ?? flagKey).replace(/_enabled$/, '')) || 'feature'
  const base = `${/^[a-z]/.test(short) ? short : `f_${short}`}_${EXPERIMENT_TEMPLATES[template].suffix}`
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

function clausesFor(answers: ExperimentBuilderAnswers): FlagClause[] {
  if (answers.who.mode === 'everyone') return []
  return answers.who.conditions.map((condition) =>
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

/** D8 — "Set ‹version› for everyone in Production": `planFlagSet` on the stripped definition. */
export function planExperimentRollout(served: FlagDefinition, variantKey: string): FlagPlanResult {
  return planFlagSet({ current: stripExperiment(served), variantKey, environments: ['production'] })
}

// ── the plan ──────────────────────────────────────────────────────────────────────────────────

export function buildExperimentPlan(
  answers: ExperimentBuilderAnswers,
  context: ExperimentPlanContext
): ExperimentPlanResult {
  const errors: string[] = []
  const spec = EXPERIMENT_TEMPLATES[answers.template]
  if (!spec) return { ok: false, errors: ['Unknown template.'] }

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
    flagKey = newFeatureKey(answers.template, context.takenFlagKeys)
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
    flagBase = served.definition
    const ordered = orderedVariants(served.definition)
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
  const experimentKey = experimentKeyFor(flagKey, answers.template, context.takenExperimentKeys)

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
  const perDay = entityRow ? entityRow.subjects14d / context.catalog.windowDays : 0
  const conditionFraction =
    answers.who.mode === 'everyone'
      ? 1
      : answers.who.conditions.reduce((fraction, condition) => {
          const segment = context.catalog.segments.find((row) => row.field === condition.field)
          if (!segment) return 0
          const share = segment.values
            .filter((row) =>
              condition.values.some((value) => typeof value === typeof row.value && value === row.value)
            )
            .reduce((sum, row) => sum + row.share, 0)
          return fraction * segment.coverage * share
        }, 1)
  const inTestPerDay = perDay * conditionFraction * (answers.who.allocation / 100)
  const baseline =
    context.catalog.baselines.find((row) => row.event === answers.metric && row.type === answers.entity)
      ?.baseline ?? null
  const needPerVersion = sampleSizePerVersion(baseline, answers.mde)
  const slowest = (inTestPerDay * Math.min(...weights)) / 100
  const days = needPerVersion === null || slowest <= 0 ? null : Math.ceil(needPerVersion / slowest)
  const recommendedWeeks = days === null ? 4 : Math.max(2, Math.ceil(days / 7))

  // ── the window ──
  const startAt = context.savedWindow ? new Date(context.savedWindow.startAt) : startOfMinute(context.now)
  const endAt = context.savedWindow
    ? new Date(context.savedWindow.endAt)
    : new Date(startAt.getTime() + answers.weeks * 7 * DAY_MS)

  // ── the definition ──
  const tags = Object.fromEntries(
    answers.who.mode === 'everyone'
      ? []
      : answers.who.conditions.map((condition) => [
          condition.field,
          condition.values.length === 1 ? condition.values[0] : [...condition.values],
        ])
  )
  const hypothesis = hypothesisText(answers, names)
  const definitionParsed = parseExperimentDefinition({
    hypothesis,
    assignmentEntityType: answers.entity,
    eligibility: {
      description: `${answers.who.allocation}% of ${whoWords(answers)}`.slice(0, 500),
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
    flagKey,
    createsFeature,
    weights,
    days,
    needPerVersion,
    inTestPerDay,
    startAt,
    endAt,
  })
  const notes: string[] = []
  if (!createsFeature && flagBase.rules.length > 0)
    notes.push(
      `${flagKey} has ${flagBase.rules.length} rule${flagBase.rules.length === 1 ? '' : 's'} of its own. People left out of the test fall through to them, so some may not see ${names[0]}.`
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

function startOfMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000)
}

function hypothesisText(answers: ExperimentBuilderAnswers, names: string[]): string {
  const guarded = EXPERIMENT_TEMPLATES[answers.template].guarded
  const verb = guarded ? "won't lower" : answers.direction === 'increase' ? 'will raise' : 'will lower'
  return `We believe showing ${names[1]} to ${whoWords(answers)} ${verb} ${eventWords(answers.metric)} because ${EXPERIMENT_REASONS[answers.why]}.`.slice(
    0,
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
    flagKey: string
    createsFeature: boolean
    weights: number[]
    days: number | null
    needPerVersion: number | null
    inTestPerDay: number
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
          detail: `${answers.metric}${answers.guardrails.length ? `, and all ${metrics.length - 1} guardrail${metrics.length - 1 === 1 ? '' : 's'}` : ''}.`,
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
  const remainingDays = Math.floor(
    (derived.endAt.getTime() - Math.max(context.now.getTime(), derived.startAt.getTime())) / DAY_MS
  )
  const fitting =
    (WEEK_OPTIONS as readonly number[]).find((weeks) => derived.days !== null && weeks * 7 >= derived.days) ??
    8
  if (derived.inTestPerDay <= 0) {
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
  } else if (
    context.savedWindow &&
    derived.startAt.getTime() < context.now.getTime() &&
    remainingDays < derived.days
  ) {
    checks.push({
      id: 'window',
      status: 'fail',
      step: 5,
      title: 'This draft’s dates have run out',
      detail: `It was planned from ${derived.startAt.toISOString().slice(0, 10)}; ${Math.max(0, remainingDays)} days are left and it needs about ${derived.days}.`,
      fix: { label: 'Plan it from today', kind: 'replan-from-today' },
    })
  } else if (remainingDays < derived.days) {
    checks.push({
      id: 'window',
      status: 'fail',
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
