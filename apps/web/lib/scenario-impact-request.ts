const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export type ScenarioImpactCaptureRequest = {
  runId: string
  asOf: string
  idempotencyKey: string
  reason: string
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseScenarioImpactCaptureRequest(
  input: unknown,
  now = new Date().toISOString()
): ScenarioImpactCaptureRequest | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (!exactKeys(value, ['runId', 'asOf', 'idempotencyKey', 'reason'])) return null
  const reason = typeof value.reason === 'string' ? value.reason.trim() : ''
  if (
    typeof value.runId !== 'string' ||
    !UUID.test(value.runId) ||
    typeof value.idempotencyKey !== 'string' ||
    !UUID.test(value.idempotencyKey) ||
    typeof value.asOf !== 'string' ||
    reason.length < 1 ||
    reason.length > 500
  )
    return null
  if (!CANONICAL_INSTANT.test(value.asOf) || !CANONICAL_INSTANT.test(now)) return null
  const asOfMs = Date.parse(value.asOf)
  const nowMs = Date.parse(now)
  if (
    !Number.isFinite(asOfMs) ||
    !Number.isFinite(nowMs) ||
    new Date(asOfMs).toISOString() !== value.asOf ||
    asOfMs > nowMs
  )
    return null
  return {
    runId: value.runId,
    asOf: value.asOf,
    idempotencyKey: value.idempotencyKey,
    reason,
  }
}
