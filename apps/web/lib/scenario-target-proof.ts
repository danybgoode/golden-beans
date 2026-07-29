import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SCENARIO_TARGET_CHALLENGE_BYTES = 32
export const SCENARIO_TARGET_PROOF_HEADER = 'x-golden-beans-ownership-proof'
export const SCENARIO_TARGET_REQUEST_HEADER = 'x-golden-beans-ownership-request'
const HEX_64 = /^[0-9a-f]{64}$/
const TARGET_KEY = /^[a-z][a-z0-9_.-]{0,127}$/

function canonicalTarget(targetKey: string, origin: string): string {
  if (!TARGET_KEY.test(targetKey)) throw new Error('Invalid scenario target key')
  const parsed = new URL(origin)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== origin
  ) {
    throw new Error('Scenario target origin must be an exact HTTPS origin')
  }
  return `${targetKey}\n${origin}`
}

function hmac(secret: string, message: string): string {
  if (secret.length < 16) throw new Error('Scenario target proof secret is unavailable')
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex')
}

export function createScenarioTargetChallenge(): string {
  return randomBytes(SCENARIO_TARGET_CHALLENGE_BYTES).toString('hex')
}

export function hashScenarioTargetChallenge(challenge: string): string {
  if (!HEX_64.test(challenge)) throw new Error('Invalid scenario target challenge')
  return createHash('sha256').update(challenge, 'utf8').digest('hex')
}

export function createScenarioTargetRequestSignature(input: {
  secret: string
  challenge: string
  targetKey: string
  origin: string
}): string {
  if (!HEX_64.test(input.challenge)) throw new Error('Invalid scenario target challenge')
  return hmac(
    input.secret,
    `golden-beans-target-request-v1\n${input.challenge}\n${canonicalTarget(input.targetKey, input.origin)}`
  )
}

export function createScenarioTargetResponseProof(input: {
  secret: string
  challenge: string
  targetKey: string
  origin: string
}): string {
  if (!HEX_64.test(input.challenge)) throw new Error('Invalid scenario target challenge')
  return hmac(
    input.secret,
    `golden-beans-target-response-v1\n${input.challenge}\n${canonicalTarget(input.targetKey, input.origin)}`
  )
}

export function scenarioTargetProofMatches(expected: string, received: unknown): boolean {
  if (!HEX_64.test(expected) || typeof received !== 'string' || !HEX_64.test(received)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}
