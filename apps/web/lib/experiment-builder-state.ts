import {
  MAX_EXPERIMENT_VERSIONS,
  parseExperimentBuilderAnswers,
  resolveTemplateDefaults,
  type ExperimentBuilderAnswers,
  type ServedFeature,
} from './experiment-builder-plan'
import type { EventCatalog } from './event-catalog'
import type {
  ExperimentConditionField,
  ExperimentReasonKey,
  ExperimentTemplateKey,
} from './experiment-templates'
import type { FlagScalar } from '@golden-frijoles/sdk'

/** Browser state is deliberately answers-only: definitions are always rebuilt by the planner. */
export type BuilderState = {
  step: 1 | 2 | 3 | 4 | 5 | 6
  answers: ExperimentBuilderAnswers
  continuing: string | null
}
export type BuilderDefaultsContext = {
  catalog: EventCatalog
  served: ServedFeature
  adoptedEvent?: string | null
}

export type BuilderAction =
  | { type: 'template'; template: ExperimentTemplateKey; context: BuilderDefaultsContext }
  | { type: 'feature'; flagKey: string | null; context: BuilderDefaultsContext }
  | { type: 'why'; why: ExperimentReasonKey }
  | { type: 'direction'; direction: 'increase' | 'decrease' }
  | { type: 'metric'; metric: string }
  | { type: 'guardrail'; event: string }
  | { type: 'breakdown'; field: ExperimentConditionField }
  | { type: 'who-mode'; mode: 'everyone' | 'some' }
  | { type: 'condition-add'; field: ExperimentConditionField }
  | { type: 'condition-remove'; field: ExperimentConditionField }
  | { type: 'condition-field'; index: number; field: ExperimentConditionField }
  | { type: 'condition-value'; index: number; value: FlagScalar }
  | { type: 'allocation'; allocation: number }
  | { type: 'entity'; entity: string }
  | { type: 'version-rename'; index: number; name: string }
  | { type: 'version-add' }
  | { type: 'version-remove'; index: number }
  | { type: 'split'; split: number }
  | { type: 'mde'; mde: number }
  | { type: 'weeks'; weeks: number }
  | { type: 'step'; step: 1 | 2 | 3 | 4 | 5 | 6 }
  | {
      type: 'check-fix'
      fix: { kind: string; step?: 1 | 2 | 3 | 4 | 5; field?: ExperimentConditionField; weeks?: number }
    }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)))
const sameScalar = (a: FlagScalar, b: FlagScalar) => typeof a === typeof b && a === b
const replace = <T>(values: T[], index: number, value: T) =>
  values.map((old, i) => (i === index ? value : old))

function defaults(template: ExperimentTemplateKey, flagKey: string | null, context: BuilderDefaultsContext) {
  return resolveTemplateDefaults(template, {
    catalog: context.catalog,
    flagKey,
    served: context.served,
    adoptedEvent: context.adoptedEvent,
  }).answers
}

export function initialBuilderState(
  template: ExperimentTemplateKey,
  context: BuilderDefaultsContext,
  continuing: string | null = null
): BuilderState | null {
  const answers = defaults(template, context.served?.flagKey ?? null, context)
  return answers ? { step: 1, answers, continuing } : null
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const a = state.answers
  switch (action.type) {
    case 'template': {
      const answers = defaults(action.template, a.flagKey, action.context)
      return answers ? { ...state, answers } : state
    }
    case 'feature': {
      const answers = defaults(a.template, action.flagKey, action.context)
      return answers ? { ...state, answers } : state
    }
    case 'why':
      return { ...state, answers: { ...a, why: action.why } }
    case 'direction':
      return { ...state, answers: { ...a, direction: action.direction } }
    case 'metric':
      // A metric cannot also be its own guardrail — and the guardrail list hides the chosen metric, so
      // leaving it there would strand it with no way to remove it (agy, PR #170).
      return {
        ...state,
        answers: {
          ...a,
          metric: action.metric,
          guardrails: a.guardrails.filter((event) => event !== action.metric),
        },
      }
    case 'guardrail':
      return {
        ...state,
        answers: {
          ...a,
          guardrails: a.guardrails.includes(action.event)
            ? a.guardrails.filter((x) => x !== action.event)
            : [...a.guardrails, action.event],
        },
      }
    case 'breakdown':
      return {
        ...state,
        answers: {
          ...a,
          breakdowns: a.breakdowns.includes(action.field)
            ? a.breakdowns.filter((x) => x !== action.field)
            : [...a.breakdowns, action.field],
        },
      }
    case 'who-mode':
      return {
        ...state,
        answers: {
          ...a,
          who: {
            ...a.who,
            mode: action.mode,
            conditions: action.mode === 'everyone' ? [] : a.who.conditions,
          },
        },
      }
    case 'condition-add':
      return a.who.conditions.some((c) => c.field === action.field)
        ? state
        : {
            ...state,
            answers: {
              ...a,
              who: {
                ...a.who,
                mode: 'some',
                conditions: [...a.who.conditions, { field: action.field, values: [] }],
              },
            },
          }
    case 'condition-remove':
      return {
        ...state,
        answers: {
          ...a,
          who: { ...a.who, conditions: a.who.conditions.filter((c) => c.field !== action.field) },
        },
      }
    case 'condition-field':
      return {
        ...state,
        answers: {
          ...a,
          who: {
            ...a.who,
            conditions: replace(a.who.conditions, action.index, { field: action.field, values: [] }),
          },
        },
      }
    case 'condition-value': {
      const condition = a.who.conditions[action.index]
      if (!condition) return state
      const values = condition.values.some((value) => sameScalar(value, action.value))
        ? condition.values.filter((value) => !sameScalar(value, action.value))
        : [...condition.values, action.value]
      return {
        ...state,
        answers: {
          ...a,
          who: { ...a.who, conditions: replace(a.who.conditions, action.index, { ...condition, values }) },
        },
      }
    }
    case 'allocation':
      return { ...state, answers: { ...a, who: { ...a.who, allocation: clamp(action.allocation, 1, 100) } } }
    case 'entity':
      return { ...state, answers: { ...a, entity: action.entity } }
    case 'version-rename': {
      if (!a.versions[action.index]) return state
      const versions = [...a.versions]
      const clash = versions.findIndex((name, index) => index !== action.index && name === action.name)
      if (clash >= 0) [versions[action.index], versions[clash]] = [versions[clash], versions[action.index]]
      else versions[action.index] = action.name
      return { ...state, answers: { ...a, versions } }
    }
    case 'version-add':
      return a.flagKey !== null || a.versions.length >= MAX_EXPERIMENT_VERSIONS
        ? state
        : {
            ...state,
            answers: {
              ...a,
              versions: [...a.versions, `Version ${String.fromCharCode(65 + a.versions.length)}`],
            },
          }
    case 'version-remove':
      return a.flagKey !== null || a.versions.length <= 2
        ? state
        : { ...state, answers: { ...a, versions: a.versions.filter((_, i) => i !== action.index) } }
    case 'split':
      return { ...state, answers: { ...a, split: clamp(action.split, 1, 99) } }
    case 'mde':
      return { ...state, answers: { ...a, mde: clamp(action.mde, 5, 30) } }
    case 'weeks':
      return { ...state, answers: { ...a, weeks: action.weeks } }
    case 'step':
      return { ...state, step: action.step }
    case 'check-fix':
      if (action.fix.kind === 'step' && action.fix.step) return { ...state, step: action.fix.step }
      if (action.fix.kind === 'remove-condition' && action.fix.field)
        return builderReducer(state, { type: 'condition-remove', field: action.fix.field })
      if (action.fix.kind === 'set-weeks' && action.fix.weeks)
        return builderReducer(state, { type: 'weeks', weeks: action.fix.weeks })
      return state
  }
}

export function builderStorageKey(projectId: string): string {
  return `golden-beans:experiment-builder:${projectId}`
}
export function serializeBuilderState(state: BuilderState): string {
  return JSON.stringify({ answers: state.answers, continuing: state.continuing })
}
export function deserializeBuilderState(
  raw: string | null,
  _context: BuilderDefaultsContext
): BuilderState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { answers?: unknown; continuing?: unknown }
    const checked = parseExperimentBuilderAnswers(parsed.answers)
    return checked.ok
      ? {
          step: 1,
          answers: checked.answers,
          continuing: typeof parsed.continuing === 'string' ? parsed.continuing : null,
        }
      : null
  } catch {
    return null
  }
}
