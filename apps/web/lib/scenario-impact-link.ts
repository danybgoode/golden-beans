export type ScenarioImpactExperimentReference = { key: string; definitionVersion: number }

export function scenarioImpactExperimentReference(
  evidence: unknown
): ScenarioImpactExperimentReference | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const experiment = (evidence as { experiment?: unknown }).experiment
  if (!experiment || typeof experiment !== 'object' || Array.isArray(experiment)) return null
  const key = (experiment as { key?: unknown }).key
  const definitionVersion = (experiment as { definitionVersion?: unknown }).definitionVersion
  return typeof key === 'string' &&
    key.length > 0 &&
    Number.isSafeInteger(definitionVersion) &&
    Number(definitionVersion) >= 1
    ? { key, definitionVersion: Number(definitionVersion) }
    : null
}
