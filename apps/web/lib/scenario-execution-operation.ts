const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ScenarioExecutionOperation =
  | {
      operation: 'reserve'
      runId: string
      expectedRunRevision: number
    }
  | {
      operation: 'settle'
      runId: string
      leaseId: string
      succeeded: boolean
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

/**
 * Closed execution lease contract. Project, environment, caps, target and fault data are never
 * caller-selected; the flag_read credential and the immutable scenario definition own them.
 */
export function parseScenarioExecutionOperation(value: unknown): ScenarioExecutionOperation | null {
  if (!isRecord(value) || typeof value.operation !== 'string') return null

  if (value.operation === 'reserve') {
    if (
      !hasExactKeys(value, ['operation', 'runId', 'expectedRunRevision']) ||
      typeof value.runId !== 'string' ||
      !UUID.test(value.runId) ||
      !Number.isSafeInteger(value.expectedRunRevision) ||
      Number(value.expectedRunRevision) < 1
    ) {
      return null
    }
    return {
      operation: 'reserve',
      runId: value.runId,
      expectedRunRevision: Number(value.expectedRunRevision),
    }
  }

  if (value.operation === 'settle') {
    if (
      !hasExactKeys(value, ['operation', 'runId', 'leaseId', 'succeeded']) ||
      typeof value.runId !== 'string' ||
      !UUID.test(value.runId) ||
      typeof value.leaseId !== 'string' ||
      !UUID.test(value.leaseId) ||
      typeof value.succeeded !== 'boolean'
    ) {
      return null
    }
    return {
      operation: 'settle',
      runId: value.runId,
      leaseId: value.leaseId,
      succeeded: value.succeeded,
    }
  }

  return null
}
