// golden-frijoles-cli · Sprint 3, Story 3.4 — the parity claim, made testable.
//
// ── What D4 actually promises, and how a test can hold it ─────────────────────────────────────
// "Both the CLI and any MCP write tool call the same pure core, so parity is structural, not a
// review checklist." That is a claim about SHAPE, and the honest way to test it is not to run two
// surfaces and compare outputs — it is to show that the decision each surface makes comes from one
// place, and that neither surface contains a second copy of it.
//
// So there are two kinds of assertion here:
//
//   1. **Plan equality.** For the same input, the planner the CLI's route reaches and the planner
//      the MCP tool reaches produce an identical plan. This is deliberately a near-tautology — and
//      saying so is the point: it is only true BECAUSE there is one implementation, and it is the
//      assertion that goes red the day someone adds a second.
//
//   2. **Absence.** Neither `lib/mcp-flag-tools.ts` nor the CLI write route contains the decisions
//      — no polarity branch, no variant lookup, no rollout arithmetic. That is the assertion with
//      teeth: plan equality would survive a copy-paste of the planner, and this would not.
//
// A test that only did (1) would be the "guard that cannot fail" this repo keeps finding.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  planFlagCreate,
  planFlagKill,
  planFlagRollout,
  planFlagSet,
  type FlagDefinition,
} from '@golden-frijoles/sdk'

const ROOT = join(import.meta.dirname, '..')

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

const BOOLEAN: FlagDefinition = {
  valueType: 'boolean',
  description: 'Checkout demo.',
  defaultVariantKey: 'on',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 1000 }, variantKey: 'on' }],
}

const ALL = ['development', 'preview', 'production'] as const

test('the CLI verb and the MCP tool produce the SAME plan for the same input', () => {
  // Both surfaces hand these exact arguments to these exact functions — `executeCliFlagWrite` is
  // the one caller, and both routes go through it. Running the planner twice is therefore the same
  // thing as running each surface once, without a database or a transport.
  const cases = [
    planFlagCreate({ key: 'a.b', polarity: 'kill-switch', description: 'x', environments: ALL }),
    planFlagCreate({ key: 'a.b', polarity: 'enablement', description: 'x', environments: ALL }),
    planFlagSet({ current: BOOLEAN, variantKey: 'off', environments: ALL }),
    planFlagRollout({ current: BOOLEAN, percent: 25, environments: ALL }),
    planFlagKill({ current: BOOLEAN, environments: ALL }),
  ]
  for (const first of cases) {
    assert.equal(first.ok, true)
  }
  // Determinism, which is what "the same plan" means for a pure function: the same input twice is
  // the same output. A planner that reached for `Date.now()` or a random id would fail here.
  assert.deepEqual(
    planFlagKill({ current: BOOLEAN, environments: ALL }),
    planFlagKill({ current: BOOLEAN, environments: ALL })
  )
})

test('⚠️ NEITHER surface contains a decision — the assertion plan equality cannot make', () => {
  // This is the one with teeth. Plan equality survives someone copy-pasting the planner into a
  // route; this does not. It is keyed on the things the planners own: the polarity words, the
  // variant keys, the basis-points arithmetic and the rule-clearing.
  const surfaces = {
    'lib/mcp-flag-tools.ts': read('lib/mcp-flag-tools.ts'),
    'app/api/v1/cli/flags/write/route.ts': read('app/api/v1/cli/flags/write/route.ts'),
    'lib/cli-flag-write.ts': read('lib/cli-flag-write.ts'),
  }

  for (const [name, source] of Object.entries(surfaces)) {
    // Comments legitimately DISCUSS these ideas at length — that is how the decisions are explained
    // where they are used. Only executable lines are searched.
    const code = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
      })
      .join('\n')

    // `rules: []` — clearing the rule list is `planFlagKill`'s job and the whole value of `kill`.
    assert.doesNotMatch(code, /rules:\s*\[\s*\]/, `${name} clears a rule list — that is planFlagKill's decision`)
    // Basis points — the one conversion seam lives in the SDK (`percentToBasisPoints`).
    assert.doesNotMatch(code, /basisPoints\s*:/, `${name} computes basis points — that is the SDK's seam`)
    assert.doesNotMatch(code, /\bpercent\s*\*/, `${name} does rollout arithmetic`)
    // Choosing a default variant FROM a polarity. The word appears as a parsed value on both
    // surfaces, which is correct; assigning a variant key from it is the decision.
    assert.doesNotMatch(
      code,
      /polarity\s*===\s*'kill-switch'\s*\?/,
      `${name} derives a default variant from polarity — that is planFlagCreate's decision`
    )
    assert.doesNotMatch(
      code,
      /variants\s*:\s*\[\s*\{\s*key/,
      `${name} builds a variant list — that is the planner's decision`
    )
  }
})

test('the mutation check for the guard above: the patterns DO match the planner itself', () => {
  // ⚠️ Without this, the assertions above pass on any file that happens not to contain those
  // strings — including an empty one. Proving the patterns match where the decisions REALLY live is
  // what separates this from a guard that is green because it is looking at nothing
  // (CODE-QUALITY #5b).
  const core = readFileSync(join(ROOT, '..', '..', 'packages/sdk/src/flag-commands.ts'), 'utf8')
  assert.match(core, /rules:\s*\[\s*\]/, 'the planner should clear rules — the guard is looking for the wrong thing')
  assert.match(core, /polarity\s*===\s*'kill-switch'\s*\?/, 'the planner should derive from polarity')
  assert.match(core, /variants\s*:\s*\[\s*\{\s*key/, 'the planner should build the variant list')
})

test('every MCP flag WRITE tool is registered behind the actor, and every READ tool is not', () => {
  // The registration gate is the authorization: a tool that exists has already passed it. So the
  // property to assert is structural — the write registrations must all sit AFTER the early return.
  const source = read('lib/mcp-flag-tools.ts')
  const gate = source.indexOf('if (!writeActor) return')
  assert.ok(gate > 0, 'the write gate is gone')

  const registrations = [...source.matchAll(/registerTool\(\s*\n?\s*'([a-z_]+)'/g)].map((match) => ({
    name: match[1],
    index: match.index ?? 0,
  }))
  assert.ok(registrations.length >= 6, `expected the six flag tools, found ${registrations.length}`)

  const reads = ['list_flags', 'get_flag']
  for (const registration of registrations) {
    const isRead = reads.includes(registration.name)
    assert.equal(
      registration.index < gate,
      isRead,
      `${registration.name} is on the wrong side of the write gate`
    )
  }
})
