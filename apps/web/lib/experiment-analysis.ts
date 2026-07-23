import type { ExactSegmentScalar, ExactSegmentTagField } from './entity-contract'
import type { ExperimentDefinition, ExperimentMetric } from './experiment-definition'
import {
  compareJourneyTimestamps,
  parseJourneyTimestamp,
  type JourneyTimestamp,
} from './journey-timestamp'

// Experiment governance v2 · Sprint 2 — the import-safe, read-only analysis core.  This module
// deliberately accepts normalized facts instead of importing a database/client seam: every caller
// must resolve a single project before it reaches here, and tests can pin the analytical contract
// without a runtime-only dependency.

export const EXPERIMENT_SRM_ALPHA = 0.01
export const EXPERIMENT_SEGMENT_CARDINALITY_CAP = 20
export const EXPERIMENT_SEGMENT_MIN_CELL_SIZE = 5
export const EXPERIMENT_FRESHNESS_HOURS = 24

export type ExperimentAnalysisFact = {
  id: string
  event: string
  featureId: string | null
  tags: Record<string, unknown> | null
  subjectType: string | null
  subjectId: string | null
  occurredAt: string | null
  createdAt: string
}

export type ExperimentAnalysisLifecycle = {
  status: 'running' | 'stopped' | 'decided' | 'invalid' | 'draft'
  startedAt: string | null
  endedAt: string | null
}

export type ExperimentAnalysisSegment = {
  field: ExactSegmentTagField
  value: ExactSegmentScalar
}

export type ExperimentAnalysisInput = {
  experimentKey: string
  definitionVersion: number
  definition: ExperimentDefinition
  lifecycle: ExperimentAnalysisLifecycle
  asOf: string
  facts: readonly ExperimentAnalysisFact[]
  segment?: ExperimentAnalysisSegment
}

export type ExperimentIntegrityDiagnostic =
  | 'version_mismatch'
  | 'unknown_variant'
  | 'missing_or_wrong_subject'
  | 'eligibility_mismatch'
  | 'duplicate_exposure'
  | 'cross_variant_exposure'
  | 'out_of_window_exposure'

type MetricResult = {
  event: string
  direction: ExperimentMetric['direction']
  variants: Array<{
    key: string
    exposedSubjects: number
    convertedSubjects: number
    conversionRate: number | null
    absoluteDeltaFromControl: number | null
    liftFromControl: number | null
    directionalStatus: 'favorable' | 'unfavorable' | 'no_difference' | 'indeterminate'
  }>
  addressability: {
    candidateEvents: number
    addressableEvents: number
    joinedEvents: number
    attributedSubjects: number
    coverage: number | null
  }
}

type AnalysisCore = {
  window: { startAt: string; endAt: string; asOf: string }
  decisionReady: boolean
  integrityReady: boolean
  sampleStatus: 'met' | 'below'
  blockers: Array<
    'srm_detected' | 'srm_not_evaluable' | 'metric_subject_unaddressable' | ExperimentIntegrityDiagnostic
  >
  variants: Array<{
    key: string
    observedSubjects: number
    expectedSubjects: number
    minimumSampleStatus: 'met' | 'below'
  }>
  primaryMetric: MetricResult
  guardrailMetrics: MetricResult[]
  diagnostics: {
    srm: {
      status: 'clear' | 'detected' | 'not_evaluable'
      alpha: number
      chiSquare: number | null
      pValue: number | null
    }
    integrity: Array<{ code: ExperimentIntegrityDiagnostic; severity: 'warning' | 'blocker'; count: number }>
    validExposureSubjects: number
  }
  freshness: {
    latestEffectiveFactAt: string | null
    latestReceiptAt: string | null
    staleAfterHours: number
    isStale: boolean | null
  }
}

export type ExperimentAnalysisResult = AnalysisCore & {
  // The request value is deliberately never echoed.  The consumer knows what it asked for, while
  // this response cannot become a raw tag-value enumeration surface.
  segment: { status: 'not_requested' }
    | { status: 'undeclared' }
    | { status: 'suppressed_cardinality' }
    | { status: 'suppressed_small_cell' }
    | { status: 'included'; field: ExactSegmentTagField; analysis: AnalysisCore }
}

type TimedFact = ExperimentAnalysisFact & { effectiveAt: JourneyTimestamp; created: JourneyTimestamp }
type Assignment = { subjectId: string; variant: string; exposedAt: JourneyTimestamp }

function effectiveAt(fact: ExperimentAnalysisFact): JourneyTimestamp {
  return parseJourneyTimestamp(fact.occurredAt ?? fact.createdAt)
}

function isExactScalar(value: unknown): value is ExactSegmentScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function sameScalar(a: unknown, b: ExactSegmentScalar): boolean {
  return typeof a === typeof b && a === b
}

function tagsMatch(tags: Record<string, unknown> | null, predicates: ExperimentDefinition['eligibility']['tags']): boolean {
  if (!predicates) return true
  for (const [field, expected] of Object.entries(predicates)) {
    if (!sameScalar(tags?.[field], expected)) return false
  }
  return true
}

function inWindow(at: JourneyTimestamp, start: JourneyTimestamp, end: JourneyTimestamp): boolean {
  return compareJourneyTimestamps(at, start) >= 0 && compareJourneyTimestamps(at, end) < 0
}

function beforeOrAt(at: JourneyTimestamp, asOf: JourneyTimestamp): boolean {
  return compareJourneyTimestamps(at, asOf) <= 0
}

function sortFacts(facts: readonly ExperimentAnalysisFact[]): TimedFact[] {
  return facts
    .map((fact) => ({ ...fact, effectiveAt: effectiveAt(fact), created: parseJourneyTimestamp(fact.createdAt) }))
    .sort((a, b) =>
      compareJourneyTimestamps(a.effectiveAt, b.effectiveAt) ||
      a.id.localeCompare(b.id))
}

function timestampDifferenceHours(later: JourneyTimestamp, earlier: JourneyTimestamp): number {
  return ((later.epochSecond - earlier.epochSecond) * 1_000_000 + later.microsecond - earlier.microsecond) / 3_600_000_000
}

function expectedCounts(definition: ExperimentDefinition, total: number): Map<string, number> {
  const denominator = definition.variants.reduce((sum, variant) => sum + variant.weight, 0)
  return new Map(definition.variants.map((variant) => [variant.key, total * variant.weight / denominator]))
}

// Regularized upper incomplete gamma Q(a, x), adapted from the stable Numerical Recipes series /
// continued-fraction split.  Chi-square's survival function is Q(df / 2, statistic / 2).
function logGamma(xx: number): number {
  const coefficients = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5]
  let x = xx - 1
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (const coefficient of coefficients) {
    x += 1
    ser += coefficient / x
  }
  return -tmp + Math.log(2.5066282746310005 * ser)
}

function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return Number.NaN
  if (x === 0) return 1
  const gln = logGamma(a)
  if (x < a + 1) {
    let sum = 1 / a
    let delta = sum
    let ap = a
    for (let n = 1; n <= 100; n += 1) {
      ap += 1
      delta *= x / ap
      sum += delta
      if (Math.abs(delta) < Math.abs(sum) * 3e-14) break
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln)
  }
  let b = x + 1 - a
  let c = 1 / 1e-30
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 100; i += 1) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = b + an / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-14) break
  }
  return h * Math.exp(-x + a * Math.log(x) - gln)
}

function srm(definition: ExperimentDefinition, assignments: Map<string, Assignment>) {
  const expected = expectedCounts(definition, assignments.size)
  if ([...expected.values()].some((count) => count < 5)) {
    return { status: 'not_evaluable' as const, alpha: EXPERIMENT_SRM_ALPHA, chiSquare: null, pValue: null, expected }
  }
  const observed = new Map(definition.variants.map((variant) => [variant.key, 0]))
  for (const assignment of assignments.values()) observed.set(assignment.variant, (observed.get(assignment.variant) ?? 0) + 1)
  const chiSquare = definition.variants.reduce((sum, variant) => {
    const expectation = expected.get(variant.key)!
    const delta = (observed.get(variant.key) ?? 0) - expectation
    return sum + delta * delta / expectation
  }, 0)
  const pValue = gammaQ((definition.variants.length - 1) / 2, chiSquare / 2)
  return {
    status: pValue < EXPERIMENT_SRM_ALPHA ? 'detected' as const : 'clear' as const,
    alpha: EXPERIMENT_SRM_ALPHA,
    chiSquare,
    pValue,
    expected,
  }
}

function metricResult(
  metric: ExperimentMetric,
  definition: ExperimentDefinition,
  facts: TimedFact[],
  assignments: Map<string, Assignment>,
  start: JourneyTimestamp,
  end: JourneyTimestamp,
  asOf: JourneyTimestamp,
): MetricResult {
  const candidates = facts.filter((fact) => fact.event === metric.event &&
    inWindow(fact.effectiveAt, start, end) && beforeOrAt(fact.created, asOf))
  const addressable = candidates.filter((fact) => fact.subjectType === definition.assignmentEntityType && fact.subjectId !== null)
  const convertedByVariant = new Map(definition.variants.map((variant) => [variant.key, new Set<string>()]))
  let joinedEvents = 0
  for (const fact of addressable) {
    const assignment = assignments.get(fact.subjectId!)
    if (!assignment || compareJourneyTimestamps(fact.effectiveAt, assignment.exposedAt) < 0) continue
    joinedEvents += 1
    convertedByVariant.get(assignment.variant)!.add(fact.subjectId!)
  }
  const rows = definition.variants.map((variant) => {
    const exposed = [...assignments.values()].filter((assignment) => assignment.variant === variant.key).length
    const converted = convertedByVariant.get(variant.key)!.size
    return {
      key: variant.key,
      exposedSubjects: exposed,
      convertedSubjects: converted,
      conversionRate: exposed === 0 ? null : converted / exposed,
    }
  })
  const controlRow = rows.find((row) => row.key === definition.controlVariantKey)
  if (!controlRow) throw new Error('experiment definition control variant is not declared')
  const controlRate = controlRow.conversionRate
  return {
    event: metric.event,
    direction: metric.direction,
    variants: rows.map((row) => ({
      ...row,
      absoluteDeltaFromControl:
        row.key === definition.controlVariantKey || controlRate === null || row.conversionRate === null
          ? null
          : row.conversionRate - controlRate,
      liftFromControl: row.key === definition.controlVariantKey ||
        controlRate === null ||
        controlRate === 0 ||
        row.conversionRate === null
        ? null
        : (row.conversionRate - controlRate) / controlRate,
      directionalStatus: row.key === definition.controlVariantKey ||
        controlRate === null ||
        row.conversionRate === null
        ? 'indeterminate' as const
        : row.conversionRate === controlRate
          ? 'no_difference' as const
          : metric.direction === 'increase'
            ? row.conversionRate > controlRate ? 'favorable' as const : 'unfavorable' as const
            : row.conversionRate < controlRate ? 'favorable' as const : 'unfavorable' as const,
    })),
    addressability: {
      candidateEvents: candidates.length,
      addressableEvents: addressable.length,
      joinedEvents,
      attributedSubjects: [...convertedByVariant.values()]
        .reduce((total, subjects) => total + subjects.size, 0),
      coverage: candidates.length === 0 ? null : addressable.length / candidates.length,
    },
  }
}

function computeCore(input: ExperimentAnalysisInput, segment?: ExperimentAnalysisSegment): AnalysisCore {
  const asOf = parseJourneyTimestamp(input.asOf)
  const start = parseJourneyTimestamp(input.definition.plannedWindow.startAt)
  const plannedEnd = parseJourneyTimestamp(input.definition.plannedWindow.endAt)
  const lifecycleEnd = parseJourneyTimestamp(input.lifecycle.endedAt ?? input.asOf)
  const stoppedEnd = compareJourneyTimestamps(plannedEnd, lifecycleEnd) < 0 ? plannedEnd : lifecycleEnd
  const end = compareJourneyTimestamps(stoppedEnd, asOf) < 0 ? stoppedEnd : asOf
  const facts = sortFacts(input.facts).filter((fact) => beforeOrAt(fact.created, asOf) && beforeOrAt(fact.effectiveAt, asOf))
  const counts = new Map<ExperimentIntegrityDiagnostic, number>([
    ['version_mismatch', 0], ['unknown_variant', 0], ['missing_or_wrong_subject', 0],
    ['eligibility_mismatch', 0], ['duplicate_exposure', 0], ['cross_variant_exposure', 0], ['out_of_window_exposure', 0],
  ])
  const assignments = new Map<string, Assignment>()
  const declaredVariants = new Set(input.definition.variants.map((variant) => variant.key))

  for (const fact of facts) {
    if (fact.event !== 'experiment_exposed' || fact.featureId !== input.experimentKey) continue
    if (segment && !sameScalar(fact.tags?.[segment.field], segment.value)) continue
    if (!inWindow(fact.effectiveAt, start, end)) {
      counts.set('out_of_window_exposure', counts.get('out_of_window_exposure')! + 1)
      continue
    }
    if (fact.tags?.experiment_definition_version !== input.definitionVersion) {
      counts.set('version_mismatch', counts.get('version_mismatch')! + 1)
      continue
    }
    const variant = fact.tags?.variant
    if (typeof variant !== 'string' || !declaredVariants.has(variant)) {
      counts.set('unknown_variant', counts.get('unknown_variant')! + 1)
      continue
    }
    if (fact.subjectType !== input.definition.assignmentEntityType || fact.subjectId === null) {
      counts.set('missing_or_wrong_subject', counts.get('missing_or_wrong_subject')! + 1)
      continue
    }
    if (!tagsMatch(fact.tags, input.definition.eligibility.tags)) {
      counts.set('eligibility_mismatch', counts.get('eligibility_mismatch')! + 1)
      continue
    }
    const first = assignments.get(fact.subjectId)
    if (!first) {
      assignments.set(fact.subjectId, { subjectId: fact.subjectId, variant, exposedAt: fact.effectiveAt })
    } else if (first.variant === variant) {
      counts.set('duplicate_exposure', counts.get('duplicate_exposure')! + 1)
    } else {
      counts.set('cross_variant_exposure', counts.get('cross_variant_exposure')! + 1)
    }
  }

  const allocation = srm(input.definition, assignments)
  const integrity = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([code, count]) => ({
      code,
      count,
      severity: code === 'duplicate_exposure' || code === 'out_of_window_exposure'
        ? 'warning' as const
        : 'blocker' as const,
    }))
  const primaryMetric = metricResult(
    input.definition.primaryMetric,
    input.definition,
    facts,
    assignments,
    start,
    end,
    asOf,
  )
  const guardrailMetrics = input.definition.guardrailMetrics.map((metric) =>
    metricResult(metric, input.definition, facts, assignments, start, end, asOf))
  const hasUnaddressableMetricStream = [primaryMetric, ...guardrailMetrics]
    .some((metric) => metric.addressability.candidateEvents > 0 && metric.addressability.addressableEvents === 0)
  const blockers: AnalysisCore['blockers'] = [
    ...(allocation.status === 'detected' ? ['srm_detected' as const] : []),
    ...(allocation.status === 'not_evaluable' ? ['srm_not_evaluable' as const] : []),
    ...(hasUnaddressableMetricStream ? ['metric_subject_unaddressable' as const] : []),
    ...integrity.filter((diagnostic) => diagnostic.severity === 'blocker').map((diagnostic) => diagnostic.code),
  ]
  const variants = input.definition.variants.map((variant) => {
    const observedSubjects = [...assignments.values()].filter((assignment) => assignment.variant === variant.key).length
    return {
      key: variant.key,
      observedSubjects,
      expectedSubjects: allocation.expected.get(variant.key)!,
      minimumSampleStatus: observedSubjects >= input.definition.minimumSamplePerVariant ? 'met' as const : 'below' as const,
    }
  })
  const sampleStatus = variants.every((variant) => variant.minimumSampleStatus === 'met')
    ? 'met' as const
    : 'below' as const
  const integrityReady = blockers.length === 0
  const latestEffective = facts.reduce<JourneyTimestamp | null>((latest, fact) =>
    latest === null || compareJourneyTimestamps(fact.effectiveAt, latest) > 0 ? fact.effectiveAt : latest, null)
  const latestReceipt = facts.reduce<JourneyTimestamp | null>((latest, fact) =>
    latest === null || compareJourneyTimestamps(fact.created, latest) > 0 ? fact.created : latest, null)
  return {
    window: { startAt: start.canonical, endAt: end.canonical, asOf: asOf.canonical },
    decisionReady: integrityReady && sampleStatus === 'met',
    integrityReady,
    sampleStatus,
    blockers,
    variants,
    primaryMetric,
    guardrailMetrics,
    diagnostics: {
      srm: { status: allocation.status, alpha: allocation.alpha, chiSquare: allocation.chiSquare, pValue: allocation.pValue },
      integrity,
      validExposureSubjects: assignments.size,
    },
    freshness: {
      latestEffectiveFactAt: latestEffective?.canonical ?? null,
      latestReceiptAt: latestReceipt?.canonical ?? null,
      staleAfterHours: EXPERIMENT_FRESHNESS_HOURS,
      isStale: latestReceipt === null ? null : timestampDifferenceHours(asOf, latestReceipt) > EXPERIMENT_FRESHNESS_HOURS,
    },
  }
}

/**
 * Computes descriptive experiment results only.  It never picks a winner, recommends a rollout,
 * or mutates the experiment lifecycle.  A stopped version freezes its end boundary at endedAt;
 * a running version is evaluated through the supplied asOf snapshot.
 */
export function computeExperimentAnalysis(input: ExperimentAnalysisInput): ExperimentAnalysisResult {
  const base = computeCore(input)
  if (!input.segment) return { ...base, segment: { status: 'not_requested' } }
  if (!input.definition.segmentFields.includes(input.segment.field)) return { ...base, segment: { status: 'undeclared' } }

  const asOf = parseJourneyTimestamp(input.asOf)
  const start = parseJourneyTimestamp(input.definition.plannedWindow.startAt)
  const plannedEnd = parseJourneyTimestamp(input.definition.plannedWindow.endAt)
  const lifecycleEnd = parseJourneyTimestamp(input.lifecycle.endedAt ?? input.asOf)
  const stoppedEnd = compareJourneyTimestamps(plannedEnd, lifecycleEnd) < 0 ? plannedEnd : lifecycleEnd
  const end = compareJourneyTimestamps(stoppedEnd, asOf) < 0 ? stoppedEnd : asOf
  const values = new Set<string>()
  const assignedSubjects = new Set<string>()
  const declaredVariants = new Set(input.definition.variants.map((variant) => variant.key))
  for (const fact of sortFacts(input.facts)) {
    if (fact.event !== 'experiment_exposed' || fact.featureId !== input.experimentKey) continue
    if (
      !beforeOrAt(fact.effectiveAt, asOf) ||
      !beforeOrAt(fact.created, asOf) ||
      !inWindow(fact.effectiveAt, start, end) ||
      fact.tags?.experiment_definition_version !== input.definitionVersion ||
      typeof fact.tags?.variant !== 'string' ||
      !declaredVariants.has(fact.tags.variant) ||
      fact.subjectType !== input.definition.assignmentEntityType ||
      fact.subjectId === null ||
      assignedSubjects.has(fact.subjectId) ||
      !tagsMatch(fact.tags, input.definition.eligibility.tags)
    ) continue
    assignedSubjects.add(fact.subjectId)
    const value = fact.tags?.[input.segment.field]
    if (isExactScalar(value)) values.add(`${typeof value}:${String(value)}`)
  }
  if (values.size > EXPERIMENT_SEGMENT_CARDINALITY_CAP) return { ...base, segment: { status: 'suppressed_cardinality' } }
  const cut = computeCore(input, input.segment)
  if (cut.variants.some((variant) => variant.observedSubjects < EXPERIMENT_SEGMENT_MIN_CELL_SIZE)) {
    return { ...base, segment: { status: 'suppressed_small_cell' } }
  }
  return { ...base, segment: { status: 'included', field: input.segment.field, analysis: cut } }
}
