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
  isSignalsEnabled,
  isConnectorWritesEnabled,
  isFlagServingEnabled,
  isResilienceScenariosEnabled,
  isSecuritySimulationsEnabled,
  isAutomaticCircuitBreakersEnabled,
  isTaskMcpToolEnabled,
  isConnectorWriteToolEnabled,
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
  // signals-loop · Story 1.0. Added to the SHARED table rather than tested separately on purpose:
  // the contract is a property of every gate in the file, so a new flag should inherit the whole
  // near-miss matrix automatically instead of relying on whoever adds it remembering to. Same
  // structural reasoning as the AGY_MODELS_IN_USE registry (LEARNINGS: the fix for a
  // predicted-but-unguarded failure is one registry the checker walks, not a re-typing).
  ['SIGNALS_ENABLED', isSignalsEnabled],
  ['CONNECTOR_WRITES_ENABLED', isConnectorWritesEnabled],
  ['FLAG_SERVING_ENABLED', isFlagServingEnabled],
  ['RESILIENCE_SCENARIOS_ENABLED', isResilienceScenariosEnabled],
  ['SECURITY_SIMULATIONS_ENABLED', isSecuritySimulationsEnabled],
  ['AUTOMATIC_CIRCUIT_BREAKERS_ENABLED', isAutomaticCircuitBreakersEnabled],
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

test('isTaskMcpToolEnabled requires BOTH the connector gate and the signals gate', () => {
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('SIGNALS_ENABLED', undefined, () => {
      assert.equal(isTaskMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', undefined, () => {
    withEnv('SIGNALS_ENABLED', 'true', () => {
      assert.equal(isTaskMcpToolEnabled(), false)
    })
  })
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('SIGNALS_ENABLED', 'true', () => {
      assert.equal(isTaskMcpToolEnabled(), true)
    })
  })
})

// The engine's first public MUTATION surface. This is the assertion that matters most in the file:
// it enumerates all eight combinations rather than the three the other predicates check, because
// "the write tools exist" must be false for every arrangement except the single all-on one, and a
// predicate that got two of three conditions right would pass a three-case test.
test('isConnectorWriteToolEnabled is ON for exactly one of the eight flag combinations', () => {
  const values = [undefined, 'true'] as const
  let onCount = 0
  for (const connector of values) {
    for (const signals of values) {
      for (const writes of values) {
        withEnv('CONNECTOR_ENABLED', connector, () => {
          withEnv('SIGNALS_ENABLED', signals, () => {
            withEnv('CONNECTOR_WRITES_ENABLED', writes, () => {
              const allOn = connector === 'true' && signals === 'true' && writes === 'true'
              assert.equal(
                isConnectorWriteToolEnabled(),
                allOn,
                `connector=${connector} signals=${signals} writes=${writes}`
              )
              if (isConnectorWriteToolEnabled()) onCount += 1
            })
          })
        })
      }
    }
  }
  assert.equal(onCount, 1)
})

// The write gate must not be reachable through the READ gate. If someone later "simplified"
// isConnectorWriteToolEnabled to delegate to isTaskMcpToolEnabled and forgot the writes flag, the
// combination test above would catch it — but this states the property in the form a reader would
// actually reason about: turning writes off leaves reads working.
test('turning CONNECTOR_WRITES_ENABLED off leaves the task READ tools enabled', () => {
  withEnv('CONNECTOR_ENABLED', 'true', () => {
    withEnv('SIGNALS_ENABLED', 'true', () => {
      withEnv('CONNECTOR_WRITES_ENABLED', undefined, () => {
        assert.equal(isTaskMcpToolEnabled(), true)
        assert.equal(isConnectorWriteToolEnabled(), false)
      })
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
