export function scenarioImpactExperimentKey(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const experiment = (evidence as { experiment?: unknown }).experiment
  if (!experiment || typeof experiment !== 'object' || Array.isArray(experiment)) return null
  const key = (experiment as { key?: unknown }).key
  return typeof key === 'string' && key.length > 0 ? key : null
}
