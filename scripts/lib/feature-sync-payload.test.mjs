import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFeatureSyncEntry, buildFeatureSyncPayload } from './feature-sync-payload.mjs'

test('buildFeatureSyncEntry maps a flag row + config into a sync entry, omitting unset fields', () => {
  const entry = buildFeatureSyncEntry(
    { key: 'growth.telemetry_enabled', enabled: true },
    {
      featureKey: 'setup_guide',
      targetEvent: 'setup_guide_viewed',
      adoptedEvent: 'setup_guide_step_completed',
      retainedEvent: 'setup_guide_share_tapped',
    },
  )
  assert.deepEqual(entry, {
    key: 'setup_guide',
    enabled: true,
    targetEvent: 'setup_guide_viewed',
    adoptedEvent: 'setup_guide_step_completed',
    retainedEvent: 'setup_guide_share_tapped',
  })
})

test('buildFeatureSyncEntry omits optional fields entirely when the config has none', () => {
  const entry = buildFeatureSyncEntry({ key: 'pdp_redesign', enabled: false }, { featureKey: 'pdp_redesign' })
  assert.deepEqual(entry, { key: 'pdp_redesign', enabled: false })
})

test('buildFeatureSyncEntry reflects the live flag value, not a default', () => {
  const enabledEntry = buildFeatureSyncEntry({ key: 'growth.telemetry_enabled', enabled: true }, { featureKey: 'setup_guide' })
  const disabledEntry = buildFeatureSyncEntry({ key: 'growth.telemetry_enabled', enabled: false }, { featureKey: 'setup_guide' })
  assert.equal(enabledEntry.enabled, true)
  assert.equal(disabledEntry.enabled, false)
})

test('buildFeatureSyncPayload skips flags with no matching feature config', () => {
  const rows = [
    { key: 'growth.telemetry_enabled', enabled: true },
    { key: 'checkout.stripe_enabled', enabled: true }, // no config for this one — must be skipped
  ]
  const featureMap = {
    'growth.telemetry_enabled': { featureKey: 'setup_guide', targetEvent: 'setup_guide_viewed' },
  }
  const payload = buildFeatureSyncPayload(rows, featureMap)
  assert.equal(payload.length, 1)
  assert.equal(payload[0].key, 'setup_guide')
})

test('buildFeatureSyncPayload returns an empty array when nothing matches', () => {
  const payload = buildFeatureSyncPayload([{ key: 'unrelated.flag', enabled: true }], {})
  assert.deepEqual(payload, [])
})
