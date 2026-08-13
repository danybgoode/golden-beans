import { parseFlagDefinition, parseScenarioFault, type ScenarioFaultKind } from '@golden-frijoles/sdk'

export type ScenarioFaultFlagSummary = {
  faultKinds: ScenarioFaultKind[]
  payloadSummary: string
  targetingSummary: string
}

function bounded(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}…`
}

function scalar(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

export function summarizeScenarioFaultFlag(definition: unknown): ScenarioFaultFlagSummary | null {
  const parsed = parseFlagDefinition(definition)
  if (!parsed.ok || parsed.definition.valueType !== 'json') return null
  const faults = parsed.definition.variants.map((variant) => ({
    key: variant.key,
    fault: parseScenarioFault(variant.value),
  }))
  if (faults.some((item) => item.fault === null) || !faults.some((item) => item.fault?.kind !== 'none'))
    return null
  const payloadSummary = bounded(
    faults
      .map(({ key, fault }) => {
        if (!fault || fault.kind === 'none') return `${key}: control`
        return fault.kind === 'delay'
          ? `${key}: ${fault.delayMs}ms delay`
          : `${key}: error ${fault.errorCode}`
      })
      .join('; ')
  )
  const targetingSummary = bounded(
    parsed.definition.rules.length === 0
      ? `No targeting rules; default ${parsed.definition.defaultVariantKey}.`
      : `${parsed.definition.rules
          .map((rule) => {
            const clauses = rule.clauses.length
              ? rule.clauses
                  .map((clause) =>
                    clause.operator === 'one_of'
                      ? `${clause.field} one of ${clause.values.map(scalar).join('/')}`
                      : `${clause.field} = ${scalar(clause.value)}`
                  )
                  .join(' and ')
              : 'all contexts'
            const rollout = rule.rollout ? ` at ${rule.rollout.basisPoints / 100}%` : ''
            return `p${rule.priority} ${clauses} → ${rule.variantKey}${rollout}`
          })
          .join('; ')}; default ${parsed.definition.defaultVariantKey}.`
  )
  return {
    faultKinds: [...new Set(faults.flatMap((item) => (item.fault ? [item.fault.kind] : [])))],
    payloadSummary,
    targetingSummary,
  }
}
