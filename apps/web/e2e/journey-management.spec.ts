import { test, expect } from '@playwright/test'
import { UNKNOWN_UTC_TIME, formatUtc } from '@/lib/format-utc'
import {
  MAX_JOURNEY_DEFINITION_BYTES,
  createJourneyVersionAfterGate,
  type JourneyCreateCommandDependencies,
} from '@/lib/journey-create-command'

// entity-journeys-projections · PR #17 review fixes.
// These are pure command/display checks: no Next runtime, session fixture or brittle source-text
// assertion is needed to prove that authorization precedes validation and bad timestamps fail safe.
// Mutation evidence (2026-07-22): moving requireOwnership below payload parsing made the focused
// non-owner test fail 1/1 because the invalid key resolved to its validation error instead of the
// common owner-boundary rejection. The mutation was reverted before the restored run.

const VALID_DEFINITION = JSON.stringify({
  entityType: 'merchant',
  stages: [{ key: 'signed_up', event: 'merchant_signed_up' }],
})

test('non-owners cannot distinguish valid from malformed journey create payloads', async () => {
  const denied = new Error('owner boundary')
  let ownershipChecks = 0
  let creates = 0
  const dependencies: JourneyCreateCommandDependencies = {
    requireOwnership: async () => {
      ownershipChecks += 1
      throw denied
    },
    createVersion: async () => {
      creates += 1
      return { ok: true, journeyId: 'j', versionId: 'v', version: 1 }
    },
  }

  const payloads: Array<[unknown, unknown]> = [
    ['merchant_activation', VALID_DEFINITION],
    ['Not-A-Key', VALID_DEFINITION],
    ['merchant_activation', '{'],
    ['merchant_activation', 'x'.repeat(MAX_JOURNEY_DEFINITION_BYTES + 1)],
    ['merchant_activation', JSON.stringify({ entityType: 'merchant', stages: [] })],
    [null, null],
  ]
  for (const [key, definition] of payloads) {
    await expect(createJourneyVersionAfterGate('project-one', key, definition, dependencies))
      .rejects.toBe(denied)
  }
  expect(ownershipChecks).toBe(payloads.length)
  expect(creates).toBe(0)
})

test('an authorized owner reaches validation and the resolved identity scopes creation', async () => {
  const calls: unknown[][] = []
  const dependencies: JourneyCreateCommandDependencies = {
    requireOwnership: async (slug) => {
      expect(slug).toBe('project-one')
      return { projectId: 'project-1', userId: 'owner-1' }
    },
    createVersion: async (...args) => {
      calls.push(args)
      return { ok: true, journeyId: 'journey-1', versionId: 'version-1', version: 1 }
    },
  }

  const malformed = await createJourneyVersionAfterGate('project-one', 'Not-A-Key', '{', dependencies)
  expect(malformed.result).toEqual({
    ok: false,
    error: 'Journey key must be lower_snake_case (1-64 characters).',
  })

  const created = await createJourneyVersionAfterGate(
    'project-one',
    'merchant_activation',
    VALID_DEFINITION,
    dependencies,
  )
  expect(created.result).toMatchObject({ ok: true, version: 1 })
  expect(calls).toEqual([[
    'project-1',
    'merchant_activation',
    { entityType: 'merchant', stages: [{ key: 'signed_up', event: 'merchant_signed_up' }] },
    'owner-1',
  ]])
})

test('formatUtc is timezone-stable and malformed timestamps render a safe placeholder', () => {
  expect(formatUtc('2026-07-22T12:34:56+02:00')).toBe('2026-07-22 10:34 UTC')
  expect(() => formatUtc('not-a-timestamp')).not.toThrow()
  expect(formatUtc('not-a-timestamp')).toBe(UNKNOWN_UTC_TIME)
  expect(formatUtc('')).toBe(UNKNOWN_UTC_TIME)
})
