import {
  EXACT_SEGMENT_TAG_FIELDS,
  MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS,
  type ExactSegmentScalar,
  type ExactSegmentTagField,
} from './entity-contract'
import type { ExperimentAnalysisSegment } from './experiment-analysis'
import { compareJourneyTimestamps, parseJourneyTimestamp } from './journey-timestamp'

export type ExperimentAnalysisRequest = {
  version: number
  asOf: string
  segment?: ExperimentAnalysisSegment
}

export type ExperimentAnalysisRequestInput = {
  version: unknown
  asOf?: unknown
  segmentField?: unknown
  segmentValue?: unknown
}

const SEGMENT_FIELDS = new Set<string>(EXACT_SEGMENT_TAG_FIELDS)
const MAX_SEGMENT_STRING_LENGTH = 64
const MAX_VERSION = 1_000_000

function parseVersion(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[0-9]+$/.test(value)
      ? Number(value)
      : Number.NaN
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_VERSION ? parsed : null
}

function parseSegmentScalar(value: unknown): ExactSegmentScalar | null {
  let candidate = value
  if (typeof candidate === 'string' && candidate.startsWith('json:')) {
    try {
      candidate = JSON.parse(candidate.slice('json:'.length))
    } catch {
      return null
    }
  }
  if (typeof candidate === 'string') {
    return Array.from(candidate).length <= MAX_SEGMENT_STRING_LENGTH && !candidate.includes('\0')
      ? candidate
      : null
  }
  if (typeof candidate === 'boolean') return candidate
  if (
    typeof candidate === 'number' &&
    Number.isSafeInteger(candidate) &&
    Math.abs(candidate) <= MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS
  ) {
    return candidate
  }
  return null
}

export function parseExperimentAnalysisRequest(
  input: ExperimentAnalysisRequestInput,
  now = new Date().toISOString(),
): { ok: true; request: ExperimentAnalysisRequest } | { ok: false; error: string } {
  const version = parseVersion(input.version)
  if (version === null) {
    return { ok: false, error: `version must be an integer from 1 to ${MAX_VERSION}` }
  }

  let asOf: string
  try {
    const parsedNow = parseJourneyTimestamp(now)
    const suppliedAsOf = input.asOf === undefined || input.asOf === null || input.asOf === ''
      ? null
      : input.asOf
    if (suppliedAsOf !== null && typeof suppliedAsOf !== 'string') {
      return { ok: false, error: 'asOf must be a real timestamp with an explicit offset' }
    }
    const parsedAsOf = suppliedAsOf === null
      ? parsedNow
      : parseJourneyTimestamp(suppliedAsOf)
    if (compareJourneyTimestamps(parsedAsOf, parsedNow) > 0) {
      return { ok: false, error: 'asOf must not be in the future' }
    }
    asOf = parsedAsOf.canonical
  } catch {
    return { ok: false, error: 'asOf must be a real timestamp with an explicit offset' }
  }

  const hasField = input.segmentField !== undefined && input.segmentField !== null && input.segmentField !== ''
  const hasValue = input.segmentValue !== undefined && input.segmentValue !== null
  if (hasField !== hasValue) {
    return { ok: false, error: 'segmentField and segmentValue must be provided together' }
  }
  if (!hasField) return { ok: true, request: { version, asOf } }
  if (typeof input.segmentField !== 'string' || !SEGMENT_FIELDS.has(input.segmentField)) {
    return { ok: false, error: 'segmentField is not allow-listed' }
  }
  const value = parseSegmentScalar(input.segmentValue)
  if (value === null) {
    return {
      ok: false,
      error: `segmentValue must be a string up to ${MAX_SEGMENT_STRING_LENGTH} characters, or json:<scalar> for a boolean/bounded safe integer`,
    }
  }
  return {
    ok: true,
    request: {
      version,
      asOf,
      segment: { field: input.segmentField as ExactSegmentTagField, value },
    },
  }
}
