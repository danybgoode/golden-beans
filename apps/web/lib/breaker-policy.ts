import { validateExperimentKey } from './experiment-definition'
import { validateFlagKey } from './flag-definition'

// Circuit-breaker policy v1. The immutable policy names one exact flag version and one
// pre-authorized protective variant; an invocation never supplies a key, value or direction.

export const BREAKER_POLICY_CONTRACT_VERSION = 1 as const
export const MAX_BREAKER_POLICY_BYTES = 32 * 1024
export const MAX_BREAKER_WINDOW_SECONDS = 24 * 60 * 60
export const MAX_BREAKER_COOLDOWN_SECONDS = 7 * 24 * 60 * 60
export const MAX_BREAKER_TRIPS = 10
export const MAX_BREAKER_SAMPLE_PER_VARIANT = 1_000_000

const POLICY_KEY = /^[a-z][a-z0-9_-]{0,63}$/
const VARIANT_KEY = /^[a-z][a-z0-9_-]{0,63}$/

export type BreakerPolicyDefinition = {
  contractVersion: 1
  flag: {
    key: string
    definitionVersion: number
    protectiveVariantKey: string
    protectiveDirection: 'enable' | 'disable' | 'replace'
  }
  evidence: {
    resolver: 'scenario_impact_v1'
    scenario: { key: string; definitionVersion: number }
    experiment: { key: string; definitionVersion: number }
    metricRole: 'primary' | 'guardrail'
    metricEvent: string
    adverseDirection: 'increase' | 'decrease'
    thresholdBasisPoints: number
    minimumSamplePerVariant: number
    requiredIntegrity: 'valid'
  }
  windowSeconds: number
  cooldownSeconds: number
  maxTrips: number
  riskClass: 'standard' | 'money_auth_checkout'
  confirmationMode: 'manual' | 'owner_preapproved_emergency'
}

export type BreakerPolicyResult =
  { ok: true; definition: BreakerPolicyDefinition } | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
) {
  const accepted = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) errors.push(`${path}.${key} is not allowed`)
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function positiveVersion(value: unknown): value is number {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER)
}

function validPolicyKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && POLICY_KEY.test(value)
}

function validVariantKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && VARIANT_KEY.test(value)
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function parseBreakerPolicy(input: unknown): BreakerPolicyResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['definition must be an object'] }
  if (byteLength(input) > MAX_BREAKER_POLICY_BYTES) {
    errors.push(`definition exceeds ${MAX_BREAKER_POLICY_BYTES} bytes`)
  }
  rejectUnknownKeys(
    input,
    [
      'contractVersion',
      'flag',
      'evidence',
      'windowSeconds',
      'cooldownSeconds',
      'maxTrips',
      'riskClass',
      'confirmationMode',
    ],
    'definition',
    errors
  )
  if (input.contractVersion !== BREAKER_POLICY_CONTRACT_VERSION) {
    errors.push(`definition.contractVersion must be ${BREAKER_POLICY_CONTRACT_VERSION}`)
  }

  let flag: BreakerPolicyDefinition['flag'] | null = null
  if (!isRecord(input.flag)) {
    errors.push('definition.flag must be an object')
  } else {
    rejectUnknownKeys(
      input.flag,
      ['key', 'definitionVersion', 'protectiveVariantKey', 'protectiveDirection'],
      'definition.flag',
      errors
    )
    if (!validateFlagKey(input.flag.key)) errors.push('definition.flag.key is invalid')
    if (!positiveVersion(input.flag.definitionVersion)) {
      errors.push('definition.flag.definitionVersion must be a positive safe integer')
    }
    if (!validVariantKey(input.flag.protectiveVariantKey)) {
      errors.push('definition.flag.protectiveVariantKey is invalid')
    }
    if (
      input.flag.protectiveDirection !== 'enable' &&
      input.flag.protectiveDirection !== 'disable' &&
      input.flag.protectiveDirection !== 'replace'
    ) {
      errors.push('definition.flag.protectiveDirection must be enable, disable or replace')
    }
    if (
      validateFlagKey(input.flag.key) &&
      positiveVersion(input.flag.definitionVersion) &&
      validVariantKey(input.flag.protectiveVariantKey) &&
      (input.flag.protectiveDirection === 'enable' ||
        input.flag.protectiveDirection === 'disable' ||
        input.flag.protectiveDirection === 'replace')
    ) {
      flag = {
        key: input.flag.key,
        definitionVersion: input.flag.definitionVersion,
        protectiveVariantKey: input.flag.protectiveVariantKey,
        protectiveDirection: input.flag.protectiveDirection,
      }
    }
  }

  let evidence: BreakerPolicyDefinition['evidence'] | null = null
  if (!isRecord(input.evidence)) {
    errors.push('definition.evidence must be an object')
  } else {
    rejectUnknownKeys(
      input.evidence,
      [
        'resolver',
        'scenario',
        'experiment',
        'metricRole',
        'metricEvent',
        'adverseDirection',
        'thresholdBasisPoints',
        'minimumSamplePerVariant',
        'requiredIntegrity',
      ],
      'definition.evidence',
      errors
    )
    if (input.evidence.resolver !== 'scenario_impact_v1') {
      errors.push('definition.evidence.resolver must be scenario_impact_v1')
    }

    const scenario = input.evidence.scenario
    if (!isRecord(scenario)) {
      errors.push('definition.evidence.scenario must be an object')
    } else {
      rejectUnknownKeys(scenario, ['key', 'definitionVersion'], 'definition.evidence.scenario', errors)
      if (!validPolicyKey(scenario.key)) errors.push('definition.evidence.scenario.key is invalid')
      if (!positiveVersion(scenario.definitionVersion)) {
        errors.push('definition.evidence.scenario.definitionVersion is invalid')
      }
    }

    const experiment = input.evidence.experiment
    if (!isRecord(experiment)) {
      errors.push('definition.evidence.experiment must be an object')
    } else {
      rejectUnknownKeys(experiment, ['key', 'definitionVersion'], 'definition.evidence.experiment', errors)
      if (!validateExperimentKey(experiment.key)) {
        errors.push('definition.evidence.experiment.key is invalid')
      }
      if (!positiveVersion(experiment.definitionVersion)) {
        errors.push('definition.evidence.experiment.definitionVersion is invalid')
      }
    }

    if (input.evidence.metricRole !== 'primary' && input.evidence.metricRole !== 'guardrail') {
      errors.push('definition.evidence.metricRole must be primary or guardrail')
    }
    if (
      typeof input.evidence.metricEvent !== 'string' ||
      input.evidence.metricEvent.length < 1 ||
      input.evidence.metricEvent.length > 128 ||
      input.evidence.metricEvent.trim() !== input.evidence.metricEvent ||
      /[\u0000-\u001f\u007f]/u.test(input.evidence.metricEvent)
    ) {
      errors.push('definition.evidence.metricEvent must be a bounded event name')
    }
    if (input.evidence.adverseDirection !== 'increase' && input.evidence.adverseDirection !== 'decrease') {
      errors.push('definition.evidence.adverseDirection must be increase or decrease')
    }
    if (!boundedInteger(input.evidence.thresholdBasisPoints, 1, 100_000)) {
      errors.push('definition.evidence.thresholdBasisPoints must be an integer from 1 to 100000')
    }
    if (!boundedInteger(input.evidence.minimumSamplePerVariant, 1, MAX_BREAKER_SAMPLE_PER_VARIANT)) {
      errors.push(
        `definition.evidence.minimumSamplePerVariant must be an integer from 1 to ${MAX_BREAKER_SAMPLE_PER_VARIANT}`
      )
    }
    if (input.evidence.requiredIntegrity !== 'valid') {
      errors.push('definition.evidence.requiredIntegrity must be valid')
    }

    if (
      input.evidence.resolver === 'scenario_impact_v1' &&
      isRecord(scenario) &&
      validPolicyKey(scenario.key) &&
      positiveVersion(scenario.definitionVersion) &&
      isRecord(experiment) &&
      validateExperimentKey(experiment.key) &&
      positiveVersion(experiment.definitionVersion) &&
      (input.evidence.metricRole === 'primary' || input.evidence.metricRole === 'guardrail') &&
      typeof input.evidence.metricEvent === 'string' &&
      input.evidence.metricEvent.length >= 1 &&
      input.evidence.metricEvent.length <= 128 &&
      input.evidence.metricEvent.trim() === input.evidence.metricEvent &&
      !/[\u0000-\u001f\u007f]/u.test(input.evidence.metricEvent) &&
      (input.evidence.adverseDirection === 'increase' || input.evidence.adverseDirection === 'decrease') &&
      boundedInteger(input.evidence.thresholdBasisPoints, 1, 100_000) &&
      boundedInteger(input.evidence.minimumSamplePerVariant, 1, MAX_BREAKER_SAMPLE_PER_VARIANT) &&
      input.evidence.requiredIntegrity === 'valid'
    ) {
      evidence = {
        resolver: 'scenario_impact_v1',
        scenario: {
          key: scenario.key,
          definitionVersion: scenario.definitionVersion,
        },
        experiment: {
          key: experiment.key,
          definitionVersion: experiment.definitionVersion,
        },
        metricRole: input.evidence.metricRole,
        metricEvent: input.evidence.metricEvent,
        adverseDirection: input.evidence.adverseDirection,
        thresholdBasisPoints: input.evidence.thresholdBasisPoints,
        minimumSamplePerVariant: input.evidence.minimumSamplePerVariant,
        requiredIntegrity: 'valid',
      }
    }
  }

  if (!boundedInteger(input.windowSeconds, 1, MAX_BREAKER_WINDOW_SECONDS)) {
    errors.push(`definition.windowSeconds must be an integer from 1 to ${MAX_BREAKER_WINDOW_SECONDS}`)
  }
  if (!boundedInteger(input.cooldownSeconds, 1, MAX_BREAKER_COOLDOWN_SECONDS)) {
    errors.push(`definition.cooldownSeconds must be an integer from 1 to ${MAX_BREAKER_COOLDOWN_SECONDS}`)
  }
  if (!boundedInteger(input.maxTrips, 1, MAX_BREAKER_TRIPS)) {
    errors.push(`definition.maxTrips must be an integer from 1 to ${MAX_BREAKER_TRIPS}`)
  }
  if (input.riskClass !== 'standard' && input.riskClass !== 'money_auth_checkout') {
    errors.push('definition.riskClass must be standard or money_auth_checkout')
  }
  if (input.confirmationMode !== 'manual' && input.confirmationMode !== 'owner_preapproved_emergency') {
    errors.push('definition.confirmationMode must be manual or owner_preapproved_emergency')
  }

  if (
    errors.length > 0 ||
    flag === null ||
    evidence === null ||
    !boundedInteger(input.windowSeconds, 1, MAX_BREAKER_WINDOW_SECONDS) ||
    !boundedInteger(input.cooldownSeconds, 1, MAX_BREAKER_COOLDOWN_SECONDS) ||
    !boundedInteger(input.maxTrips, 1, MAX_BREAKER_TRIPS) ||
    (input.riskClass !== 'standard' && input.riskClass !== 'money_auth_checkout') ||
    (input.confirmationMode !== 'manual' && input.confirmationMode !== 'owner_preapproved_emergency')
  ) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    definition: {
      contractVersion: 1,
      flag,
      evidence,
      windowSeconds: input.windowSeconds,
      cooldownSeconds: input.cooldownSeconds,
      maxTrips: input.maxTrips,
      riskClass: input.riskClass,
      confirmationMode: input.confirmationMode,
    },
  }
}

export function breakerPolicyCanAutoTrip(definition: BreakerPolicyDefinition): boolean {
  return definition.confirmationMode === 'owner_preapproved_emergency'
}
