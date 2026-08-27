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
import { readFileSync } from 'node:fs'
import {
  isConnectorEnabled,
  isSignupEnabled,
  isDestinationDeliveryEnabled,
  isJourneyProjectionsEnabled,
  isExperimentGovernanceEnabled,
  isReportSharesEnabled,
  isJourneyMcpToolEnabled,
  isExperimentGovernanceMcpToolEnabled,
  isSignalsEnabled,
  isConnectorWritesEnabled,
  isFlagServingEnabled,
  isFlagDefinitionSyncEnabled,
  isResilienceScenariosEnabled,
  isSecuritySimulationsEnabled,
  isAutomaticCircuitBreakersEnabled,
  isScenarioAuthoringEnabled,
  isAgentRailEnabled,
  isFlagRuleBuilderEnabled,
  isFlagConsoleEnabled,
  isConsoleShellEnabled,
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
  // ⚠️ NOT added by the epic that built it — added 2026-08-27 by console-ia-overhaul Story 1.1,
  // because the exhaustiveness test below went red on its FIRST run and named this flag. It had
  // been reading `process.env.REPORT_SHARES_ENABLED` since pod-report S3 while inheriting NONE of
  // the born-dark or near-miss assertions above.
  //
  // Of the seventeen gates in flags.ts this is the worst one to have missed, and its own comment
  // says why: it is "the only one whose OFF state is protecting data from ANONYMOUS readers rather
  // than protecting a feature from being used early" — while it is off, `/s/<token>` must 404 for
  // every token, valid or invented. `REPORT_SHARES_ENABLED=TRUE` opening that surface would have
  // been a data exposure, and nothing in the suite would have noticed.
  //
  // Now covered, and it passes — the gate was written correctly all along. What was missing was the
  // proof, which is the whole argument for a registry a checker walks rather than a list an author
  // remembers.
  ['REPORT_SHARES_ENABLED', isReportSharesEnabled],
  // signals-loop · Story 1.0. Added to the SHARED table rather than tested separately on purpose:
  // the contract is a property of every gate in the file, so a new flag should inherit the whole
  // near-miss matrix automatically instead of relying on whoever adds it remembering to. Same
  // structural reasoning as the AGY_MODELS_IN_USE registry (LEARNINGS: the fix for a
  // predicted-but-unguarded failure is one registry the checker walks, not a re-typing).
  ['SIGNALS_ENABLED', isSignalsEnabled],
  ['CONNECTOR_WRITES_ENABLED', isConnectorWritesEnabled],
  ['FLAG_SERVING_ENABLED', isFlagServingEnabled],
  ['FLAG_DEFINITION_SYNC_ENABLED', isFlagDefinitionSyncEnabled],
  ['RESILIENCE_SCENARIOS_ENABLED', isResilienceScenariosEnabled],
  ['SECURITY_SIMULATIONS_ENABLED', isSecuritySimulationsEnabled],
  ['AUTOMATIC_CIRCUIT_BREAKERS_ENABLED', isAutomaticCircuitBreakersEnabled],
  ['SCENARIO_AUTHORING_ENABLED', isScenarioAuthoringEnabled],
  ['AGENT_RAIL_ENABLED', isAgentRailEnabled],
  // flags-visual-rule-builder · Story 1.4 (D6). Added to the shared table, not tested
  // separately, for the reason the SIGNALS_ENABLED note above gives: the born-dark contract is a
  // property of every gate in this file, and a fifteenth one should inherit the whole near-miss
  // matrix automatically rather than depend on whoever added it remembering to re-type it.
  ['FLAG_RULE_BUILDER_ENABLED', isFlagRuleBuilderEnabled],
  ['FLAG_CONSOLE_ENABLED', isFlagConsoleEnabled],
  // console-ia-overhaul · Story 1.1 (epic README, D4). The eighteenth, added to the shared table
  // for the reason the two notes above give — and from this sprint on, membership of this table is
  // no longer a thing the next author has to remember. See the exhaustiveness test below.
  ['CONSOLE_SHELL_ENABLED', isConsoleShellEnabled],
]

// ── The table is now SELF-ENFORCING, and that is the point of adding it here ──────────────────
//
// `singleFlagGates` above gives every gate the whole born-dark + near-miss matrix for free. Until
// now, being IN the table was a thing each author had to remember, and LEARNINGS records exactly
// what that costs: "the fix for a predicted-but-unguarded failure is structural, not a re-typing —
// put every instance in ONE registry the checker walks, so a new consumer inherits the check
// instead of needing to remember it." Two comments in this file already predicted this hazard in
// prose; prose does not fail a build.
//
// Keyed on the ONE thing every env gate must contain — a `process.env.<NAME>` read in flags.ts —
// rather than on the shape of the function around it. A source scan keyed on syntax is an
// allow-list of shapes (LEARNINGS, site-url-preview-aware): a renamed binding, a different
// formatting, an early return or a `??` default would each dodge a function-shaped matcher, and
// none of them can dodge this. Adding a nineteenth gate turns this test red until it is registered.
//
// It asserts in BOTH directions on purpose. A discovery guard with only one assertion can shrink
// its own coverage to nothing and still report success — that is precisely how the
// site-url-preview-aware sweep silently dropped a durable call site.
test('every env gate in flags.ts is registered in singleFlagGates, and vice versa', () => {
  const source = readFileSync(new URL('./flags.ts', import.meta.url), 'utf8')
  const readInSource = new Set(Array.from(source.matchAll(/process\.env\.([A-Z0-9_]+)/g), (m) => m[1]))
  const registered = new Set(singleFlagGates.map(([envKey]) => envKey))

  const unregistered = [...readInSource].filter((key) => !registered.has(key)).sort()
  assert.deepEqual(
    unregistered,
    [],
    `flags.ts reads these env vars but singleFlagGates does not cover them, so they inherit none of ` +
      `the born-dark/near-miss assertions: ${unregistered.join(', ')}`
  )

  const orphaned = [...registered].filter((key) => !readInSource.has(key)).sort()
  assert.deepEqual(
    orphaned,
    [],
    `singleFlagGates names env vars flags.ts no longer reads, so the table is testing nothing for ` +
      `them: ${orphaned.join(', ')}`
  )

  // A bare count, so a future refactor that made BOTH sets empty (a regex that stops matching, a
  // table that gets cleared) fails loudly instead of passing two vacuous deepEquals.
  assert.ok(registered.size >= 18, `expected at least 18 registered gates, found ${registered.size}`)
})

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
