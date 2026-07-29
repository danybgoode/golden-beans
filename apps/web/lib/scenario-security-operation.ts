const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ScenarioSecurityOperation = {
  runId: string
  expectedRevision: number
}

export function parseScenarioSecurityOperation(value: unknown): ScenarioSecurityOperation | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const input = value as Record<string, unknown>
  const keys = Object.keys(input).sort()
  if (
    keys.length !== 2 ||
    keys[0] !== 'expectedRevision' ||
    keys[1] !== 'runId' ||
    typeof input.runId !== 'string' ||
    !UUID.test(input.runId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 1
  ) {
    return null
  }
  return {
    runId: input.runId,
    expectedRevision: Number(input.expectedRevision),
  }
}
