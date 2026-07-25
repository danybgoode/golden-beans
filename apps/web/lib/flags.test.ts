// Fast unit layer for the enablement gates.
//
// Every gate in this file shares one contract, stated in the module's own comments: born
// unset/OFF, and `=== 'true'` EXACTLY — not a truthiness check. `SIGNUP_ENABLED=false`, `=0`,
// `=TRUE`, `=1` and an accidental trailing space must ALL read as OFF, because a gate that opens on
// a typo isn't a gate. That's the property worth pinning here, for every flag, rather than assuming
// the pattern holds just because one flag was reviewed carefully.
//
// process.env is global mutable state, so each test restores exactly what it changed — this file
// must never leak an env var into another test file running in the same process.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isConnectorEnabled,
  isSignupEnabled,
  isDestinationDeliveryEnabled,
  isJourneyProjectionsEnabled,
  isExperimentGovernanceEnabled,
  isJourneyMcpToolEnabled,
  isExperimentGovernanceMcpToolEnabled,
} from './flags.ts'

function withEnv(key: string, value: string | undefined, fn: () => void) {
  const original = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
  try {
    fn()
  } finally {
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }
}

const singleFlagGates: Array<[string, () => boolean]> = [
  ['CONNECTOR_ENABLED', isConnectorEnabled],
  ['SIGNUP_ENABLED', isSignupEnabled],
  ['DESTINATION_DELIVERY_ENABLED', isDestinationDeliveryEnabled],
  ['JOURNEY_PROJECTIONS_ENABLED', isJourneyProjectionsEnabled],
  ['EXPERIMENT_GOVERNANCE_ENABLED', isExperimentGovernanceEnabled],
]

for (const [envKey, gate] of singleFlagGates) {
  test(`${envKey}: unset reads as OFF (born-dark default)`, () => {
    withEnv(envKey, undefined, () => {
      assert.equal(gate(), false)
    })
  })

  test(`${envKey}: exactly 'true' reads as ON`, () => {
    withEnv(envKey, 'true', () => {
      assert.equal(gate(), true)
    })
  })

  for (const nearMiss of ['false', '0', 'TRUE', 'True', '1', 'yes', ' true', 'true ', '']) {
    test(`${envKey}: near-miss value ${JSON.stringify(nearMiss)} reads as OFF, not ON`, () => {
      withEnv(envKey, nearMiss, () => {
        assert.equal(gate(), false)
      })
    })
  }
}

test('isJourneyMcpToolEnabled requires BOTH the connector gate and the journey-projections gate', () => {
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('JOURNEY_PROJECTIONS_ENABLED', undefined, () => {
      assert.equal(isJourneyMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', undefined, () => {
    withEnv('JOURNEY_PROJECTIONS_ENABLED', 'true', () => {
      assert.equal(isJourneyMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('JOURNEY_PROJECTIONS_ENABLED', 'true', () => {
      assert.equal(isJourneyMcpToolEnabled(), true)
    })
  })
})

test('isExperimentGovernanceMcpToolEnabled requires BOTH the connector gate and the governance gate', () => {
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('EXPERIMENT_GOVERNANCE_ENABLED', undefined, () => {
      assert.equal(isExperimentGovernanceMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', undefined, () => {
    withEnv('EXPERIMENT_GOVERNANCE_ENABLED', 'true', () => {
      assert.equal(isExperimentGovernanceMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('EXPERIMENT_GOVERNANCE_ENABLED', 'true', () => {
      assert.equal(isExperimentGovernanceMcpToolEnabled(), true)
    })
  })
})

test('flags are read fresh per call, not captured once at module load', () => {
  withEnv('SIGNUP_ENABLED', undefined, () => {
    assert.equal(isSignupEnabled(), false)
    process.env.SIGNUP_ENABLED = 'true'
    assert.equal(isSignupEnabled(), true)
    process.env.SIGNUP_ENABLED = 'false'
    assert.equal(isSignupEnabled(), false)
  })
})
