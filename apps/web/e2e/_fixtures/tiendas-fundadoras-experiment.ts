import type {
  ExperimentAnalysisFact,
  ExperimentAnalysisInput,
} from '@/lib/experiment-analysis'
import type { ExperimentDefinition } from '@/lib/experiment-definition'

// Experiment governance v2 · Story 3.3 — Golden Beans' copyable half of the future
// cross-repo Tiendas Fundadoras contract. Miyagi still owns the enablement flag and
// calls the SDK only after its local eligibility check; Golden Beans receives facts
// and never serves, reads or mutates that flag.
export const TIENDAS_FUNDADORAS_CONTRACT = {
  experimentKey: 'tiendas-fundadoras-promise-v1',
  definitionVersion: 1,
  assignmentEntityType: 'founding_application',
  runtimeBoundary: {
    gateOwner: 'miyagi',
    plannedGateKey: 'growth.founding_merchants_enabled',
    assignmentMode: 'local_sdk_bucket',
    remoteAssignmentEndpoint: null,
    goldenBeansMayReadOrMutateMiyagiFlag: false,
  },
} as const

export const TIENDAS_FUNDADORAS_DEFINITION: ExperimentDefinition = {
  hypothesis: 'Leading with the founding-shop promise increases completed applications.',
  assignmentEntityType: TIENDAS_FUNDADORAS_CONTRACT.assignmentEntityType,
  eligibility: {
    description: 'Consent-safe Tiendas Fundadoras applicants in Mexico.',
    tags: { region: 'mx', source: 'tiendas_fundadoras' },
  },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'promise_first', weight: 1 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_abandoned', direction: 'decrease' }],
  segmentFields: ['source', 'region'],
  plannedWindow: {
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-08-03T00:00:00.000Z',
  },
  minimumSamplePerVariant: 5,
}

export type TiendasFundadorasFixtureScenario = 'clean' | 'skewed'

type ScenarioPlan = {
  control: readonly string[]
  promiseFirst: readonly string[]
  completed: readonly string[]
  abandoned: readonly string[]
}

const CLEAN_CONTROL = [
  'tf-app-0002', 'tf-app-0003', 'tf-app-0005', 'tf-app-0007', 'tf-app-0008',
  'tf-app-0009', 'tf-app-0011', 'tf-app-0012', 'tf-app-0013', 'tf-app-0014',
] as const
const CLEAN_PROMISE_FIRST = [
  'tf-app-0001', 'tf-app-0004', 'tf-app-0006', 'tf-app-0010', 'tf-app-0015',
  'tf-app-0016', 'tf-app-0018', 'tf-app-0020', 'tf-app-0022', 'tf-app-0023',
] as const
const SKEWED_CONTROL = ['tf-app-0017'] as const
const SKEWED_PROMISE_FIRST = [
  'tf-app-0028', 'tf-app-0030', 'tf-app-0031', 'tf-app-0032', 'tf-app-0033',
  'tf-app-0037', 'tf-app-0039', 'tf-app-0040', 'tf-app-0041', 'tf-app-0042',
  'tf-app-0043', 'tf-app-0048', 'tf-app-0049', 'tf-app-0053', 'tf-app-0054',
  'tf-app-0056', 'tf-app-0058', 'tf-app-0060', 'tf-app-0062',
] as const

const PLANS: Record<TiendasFundadorasFixtureScenario, ScenarioPlan> = {
  clean: {
    control: CLEAN_CONTROL,
    promiseFirst: CLEAN_PROMISE_FIRST,
    completed: [...CLEAN_CONTROL.slice(0, 4), ...CLEAN_PROMISE_FIRST.slice(0, 6)],
    abandoned: [...CLEAN_CONTROL.slice(8), CLEAN_PROMISE_FIRST[9]],
  },
  skewed: {
    control: SKEWED_CONTROL,
    promiseFirst: SKEWED_PROMISE_FIRST,
    completed: [...SKEWED_CONTROL, ...SKEWED_PROMISE_FIRST.slice(0, 10)],
    abandoned: SKEWED_PROMISE_FIRST.slice(10, 12),
  },
}

function timestamp(minute: number): string {
  return new Date(Date.UTC(2026, 7, 1, 0, minute)).toISOString()
}

function exposure(
  scenario: TiendasFundadorasFixtureScenario,
  subjectId: string,
  variant: 'control' | 'promise_first',
  minute: number,
): ExperimentAnalysisFact {
  return {
    id: `tf-${scenario}-exposure-${subjectId}`,
    event: 'experiment_exposed',
    featureId: TIENDAS_FUNDADORAS_CONTRACT.experimentKey,
    tags: {
      variant,
      experiment_definition_version: TIENDAS_FUNDADORAS_CONTRACT.definitionVersion,
      region: 'mx',
      source: 'tiendas_fundadoras',
    },
    subjectType: TIENDAS_FUNDADORAS_CONTRACT.assignmentEntityType,
    subjectId,
    occurredAt: timestamp(minute),
    createdAt: timestamp(minute),
  }
}

function applicationEvent(
  scenario: TiendasFundadorasFixtureScenario,
  subjectId: string,
  event: 'founding_application_completed' | 'founding_application_abandoned',
  minute: number,
): ExperimentAnalysisFact {
  return {
    id: `tf-${scenario}-${event}-${subjectId}`,
    event,
    // Real product outcomes do not carry experiment attribution. The analysis
    // joins them to the first valid exposure by the opaque application subject.
    featureId: null,
    tags: null,
    subjectType: TIENDAS_FUNDADORAS_CONTRACT.assignmentEntityType,
    subjectId,
    occurredAt: timestamp(minute),
    createdAt: timestamp(minute),
  }
}

export function buildTiendasFundadorasFixture(
  scenario: TiendasFundadorasFixtureScenario,
): ExperimentAnalysisInput {
  const plan = PLANS[scenario]
  const exposures = [
    ...plan.control.map((subjectId, index) => exposure(scenario, subjectId, 'control', 5 + index)),
    ...plan.promiseFirst.map((subjectId, index) => exposure(scenario, subjectId, 'promise_first', 30 + index)),
  ]
  const facts = [
    ...exposures,
    ...plan.completed.map((subjectId, index) =>
      applicationEvent(scenario, subjectId, 'founding_application_completed', 180 + index)),
    ...plan.abandoned.map((subjectId, index) =>
      applicationEvent(scenario, subjectId, 'founding_application_abandoned', 240 + index)),
  ]

  return {
    experimentKey: TIENDAS_FUNDADORAS_CONTRACT.experimentKey,
    definitionVersion: TIENDAS_FUNDADORAS_CONTRACT.definitionVersion,
    definition: TIENDAS_FUNDADORAS_DEFINITION,
    lifecycle: {
      status: 'stopped',
      startedAt: TIENDAS_FUNDADORAS_DEFINITION.plannedWindow.startAt,
      endedAt: '2026-08-02T00:00:00.000Z',
    },
    asOf: '2026-08-02T00:00:00.000Z',
    facts,
  }
}
