import { test, expect } from '@playwright/test'
import { UNKNOWN_UTC_TIME, formatUtc } from '@/lib/format-utc'
import {
  MAX_JOURNEY_DEFINITION_BYTES,
  createJourneyVersionAfterGate,
  postgresJsonbTextByteLength,
  type JourneyCreateCommandDependencies,
} from '@/lib/journey-create-command'
import {
  canActivateJourneyVersion,
  type JourneyRegistryView,
} from '@/lib/journey-registry-view'

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

  expect((await createJourneyVersionAfterGate(
    'project-one',
    'merchant_activation',
    '🚀'.repeat(MAX_JOURNEY_DEFINITION_BYTES),
    dependencies,
  )).result).toEqual({
    ok: false,
    error: 'Definition is too large (maximum 32 KiB).',
  })

  // A compact, schema-valid definition can fit inside the raw request envelope while PostgreSQL's
  // JSONB text representation crosses 32 KiB because it adds separator spaces. The command mirrors
  // that database measurement and returns the friendly size error before invoking the RPC.
  const emoji = '🚀'
  const nearLimit = JSON.stringify({
    entityType: 'merchant',
    description: emoji.repeat(446),
    stages: Array.from({ length: 20 }, (_, index) => ({
      key: `stage_${index}`,
      event: emoji.repeat(128),
      tags: {
        source: emoji.repeat(46),
        channel: emoji.repeat(46),
        campaign: emoji.repeat(46),
        plan: emoji.repeat(46),
        region: emoji.repeat(46),
      },
    })),
  })
  expect(Buffer.byteLength(nearLimit, 'utf8')).toBeLessThanOrEqual(MAX_JOURNEY_DEFINITION_BYTES)
  expect(postgresJsonbTextByteLength(JSON.parse(nearLimit))).toBeGreaterThan(MAX_JOURNEY_DEFINITION_BYTES)
  expect((await createJourneyVersionAfterGate(
    'project-one',
    'merchant_activation',
    nearLimit,
    dependencies,
  )).result).toEqual({
    ok: false,
    error: 'Definition is too large (maximum 32 KiB).',
  })

  for (const invalidKey of [null, undefined, 42, {}]) {
    expect((await createJourneyVersionAfterGate('project-one', invalidKey, VALID_DEFINITION, dependencies)).result)
      .toEqual({ ok: false, error: 'Journey key must be lower_snake_case (1-64 characters).' })
  }
  for (const invalidDefinition of [null, undefined, 42, {}]) {
    expect((await createJourneyVersionAfterGate('project-one', 'merchant_activation', invalidDefinition, dependencies)).result)
      .toEqual({ ok: false, error: 'Definition must be a JSON string.' })
  }

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

test('only drafts newer than the active journey version remain actionable', () => {
  const definition = { entityType: 'merchant', stages: [{ key: 'signed_up', event: 'merchant_signed_up' }] }
  const registry: JourneyRegistryView = {
    id: 'journey-1',
    key: 'merchant_activation',
    activeVersionId: 'version-3',
    createdBy: 'owner-1',
    createdAt: '2026-07-22T00:00:00.000Z',
    versions: [
      { id: 'version-4', version: 4, definition, createdBy: 'owner-1', createdAt: '2026-07-22T04:00:00.000Z', activatedBy: null, activatedAt: null, state: 'draft' },
      { id: 'version-3', version: 3, definition, createdBy: 'owner-1', createdAt: '2026-07-22T03:00:00.000Z', activatedBy: 'owner-1', activatedAt: '2026-07-22T03:30:00.000Z', state: 'active' },
      { id: 'version-2', version: 2, definition, createdBy: 'owner-1', createdAt: '2026-07-22T02:00:00.000Z', activatedBy: null, activatedAt: null, state: 'draft' },
    ],
  }
  expect(canActivateJourneyVersion(registry, registry.versions[0])).toBe(true)
  expect(canActivateJourneyVersion(registry, registry.versions[1])).toBe(false)
  expect(canActivateJourneyVersion(registry, registry.versions[2])).toBe(false)
})

test('formatUtc is timezone-stable and malformed timestamps render a safe placeholder', () => {
  expect(formatUtc('2026-07-22T12:34:56+02:00')).toBe('2026-07-22 10:34 UTC')
  expect(() => formatUtc('not-a-timestamp')).not.toThrow()
  expect(formatUtc('not-a-timestamp')).toBe(UNKNOWN_UTC_TIME)
  expect(formatUtc('')).toBe(UNKNOWN_UTC_TIME)
})
