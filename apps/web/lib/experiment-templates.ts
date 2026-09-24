// experiments-for-humans · Story 2.2 (epic README D3, D5) — the four templates, as DATA.
//
// Copied from the approved prototype's `TEMPLATES` (design-system/approved-prototype.html), with one
// deliberate change: the prototype names EVENTS (`application.completed`), because it draws one
// imaginary tenant. A template here names ROLES — patterns resolved against THIS project's event
// catalog by `resolveTemplateDefaults` in ./experiment-builder-plan (D5). A template that named an
// event would offer every other tenant a metric their product never sends.
//
// Pure data, zero imports: the planner, the builder UI and the unit tests all read this one table.

export type ExperimentTemplateKey = 'copy' | 'pricing' | 'onboarding' | 'rollout'

export type ExperimentReasonKey =
  'funnel' | 'recordings' | 'support' | 'interviews' | 'benchmark' | 'risk' | 'hunch'

/** The five allow-listed segment/eligibility fields, in the order the builder offers them. */
export type ExperimentConditionField = 'region' | 'channel' | 'plan' | 'source' | 'campaign'

export type ExperimentTemplate = {
  name: string
  description: string
  /** Version names, control first. A version's name becomes its `label` (D1). */
  versionNames: [string, string]
  /** D5: the primary metric's ROLE, as a pattern over catalog event names. */
  metricPattern: RegExp
  /** How many guardrails to suggest from the catalog's "bad things" events. */
  guardrailCount: number
  /** The smallest change worth knowing about, in percent. */
  mde: number
  why: ExperimentReasonKey
  /** The treatment's share of the in-test people, in percent (two versions). */
  split: number
  /** Preferred assignment entity type, used only if the catalog has seen it. */
  entity: string
  /** Suggested condition field; used only when the catalog shows it on ≥ 90 % of events. */
  conditionField: ExperimentConditionField | null
  /** Suggested breakdown; used only when the catalog shows it on ≥ 50 % of events. */
  breakdownField: ExperimentConditionField
  /** Names the experiment key: `<feature>_<suffix>`. */
  suffix: string
  /** A guarded rollout has no winner, only a safety check: "won't lower", "must hold". */
  guarded: boolean
}

export const EXPERIMENT_TEMPLATES: Record<ExperimentTemplateKey, ExperimentTemplate> = {
  copy: {
    name: 'Copy or button',
    description: 'Change words, a label or a call to action.',
    versionNames: ['Current', 'New copy'],
    metricPattern: /complet|submit|sign_?up|signup|apply|applied|convert/i,
    guardrailCount: 1,
    mde: 10,
    why: 'funnel',
    split: 50,
    entity: 'merchant',
    conditionField: 'region',
    breakdownField: 'channel',
    suffix: 'copy_test',
    guarded: false,
  },
  pricing: {
    name: 'Pricing page',
    description: 'Try a different price, plan or offer.',
    versionNames: ['Current price', 'New price'],
    metricPattern: /subscri|purchas|paid|payment|checkout|upgrad|order/i,
    guardrailCount: 2,
    mde: 20,
    why: 'benchmark',
    split: 50,
    entity: 'merchant',
    conditionField: 'region',
    breakdownField: 'plan',
    suffix: 'price_test',
    guarded: false,
  },
  onboarding: {
    name: 'Onboarding step',
    description: 'Add, remove or reorder a step in setup.',
    versionNames: ['Current flow', 'New step'],
    metricPattern: /publish|activat|onboard|first|complet|setup/i,
    guardrailCount: 1,
    mde: 10,
    why: 'recordings',
    split: 50,
    entity: 'merchant',
    conditionField: null,
    breakdownField: 'source',
    suffix: 'setup_test',
    guarded: false,
  },
  rollout: {
    name: 'Guarded rollout',
    description: 'Ship to a slice first. No winner, just a safety check.',
    versionNames: ['Off', 'On'],
    metricPattern: /complet|checkout|success|order|purchas/i,
    guardrailCount: 3,
    mde: 20,
    why: 'risk',
    split: 10,
    entity: 'user',
    conditionField: 'channel',
    breakdownField: 'channel',
    suffix: 'rollout',
    guarded: true,
  },
}

export const EXPERIMENT_TEMPLATE_KEYS = Object.keys(EXPERIMENT_TEMPLATES) as ExperimentTemplateKey[]

/** The prototype's `REASONS`, verbatim — the hypothesis sentence's "because …" clause. */
export const EXPERIMENT_REASONS: Record<ExperimentReasonKey, string> = {
  funnel: 'the funnel drops most at this step',
  recordings: 'session recordings show people hesitating here',
  support: 'support keeps hearing the same confusion',
  interviews: 'people told us so in interviews',
  benchmark: 'it works for products like ours',
  risk: 'it touches money, so it ships to a slice first',
  hunch: 'we think so, and this test is how we find out',
}

/** D5's guardrail role: events whose rise is bad news. */
export const GUARDRAIL_PATTERN = /abandon|cancel|refund|ticket|error|fail|slow/i

/** The prototype's name pools for versions (`CONTROL_NAMES`, `TREAT_NAMES`). */
export const CONTROL_NAMES = ['Current', 'Current copy', 'Current price', 'Current flow', 'Off'] as const
export const TREATMENT_NAMES = [
  'New copy',
  'New price',
  'New step',
  'New layout',
  'On',
  'Version B',
  'Version C',
  'Version D',
] as const

/** The prototype's run-length choices, in weeks. */
export const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8] as const
