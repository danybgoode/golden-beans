// Unit layer for the four operating surfaces.
//
// Three of these tests guard a property the drift guard cannot see. `check-design-drift` enforces
// the house rules over JSX *literals*; every string in `maker-ops.ts` reaches the page through a
// `{surface.title}` expression, so the guard reads it as an expression and moves on. That is not a
// hole in the guard — it cannot follow a value across a module boundary — it is the reason the data
// module has to carry its own checks. Otherwise the rule holds everywhere except the one file that
// supplies most of the page's headings.

// There is deliberately NO test that each `capability.icon` exists in the icon map. It would be a
// test that cannot fail (CODE-QUALITY #5): `IconName` is derived from `ICON_NAMES`, and `Icon`'s
// map is typed `Record<IconName, LucideIcon>` — so an unknown name and an unmapped name are both
// already compile errors. A runtime assertion here would restate the type system and give the next
// reader a reason to stop looking.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAKER_OPS_SURFACES,
  gatedDrillNote,
  getSurface,
  resolveSurfaceStatus,
  type OpsGateReadings,
} from './maker-ops.ts'

const BOTH_GATES_ON: OpsGateReadings = {
  resilienceScenariosEnabled: true,
  securitySimulationsEnabled: true,
}
const BOTH_GATES_OFF: OpsGateReadings = {
  resilienceScenariosEnabled: false,
  securitySimulationsEnabled: false,
}

test('every surface heading is a title, not a sentence', () => {
  for (const surface of MAKER_OPS_SURFACES) {
    assert.equal(
      surface.title.endsWith('.'),
      false,
      `"${surface.title}" renders as an <h3>; headings do not end in a full stop (epic D7)`
    )
  }
})

test('every surface answers real questions and lists real capabilities', () => {
  for (const surface of MAKER_OPS_SURFACES) {
    assert.ok(surface.questions.length > 0, `${surface.id} answers no questions`)
    assert.ok(surface.capabilities.length > 0, `${surface.id} lists no capabilities`)
    for (const question of surface.questions) {
      assert.ok(question.trim().length > 0, `${surface.id} has an empty question`)
    }
  }
})

test('a shipped surface is live regardless of the scenario gates', () => {
  const product = getSurface('product')
  assert.deepEqual(resolveSurfaceStatus(product, BOTH_GATES_OFF), { status: 'live' })
  assert.deepEqual(resolveSurfaceStatus(product, BOTH_GATES_ON), { status: 'live' })
})

// The property epic D3 exists for: the SecOps badge is COMPUTED. This is the test that would have
// caught the page claiming a capability whose flag is off — the failure CODE-QUALITY #9 names.
test('the gated surface reports gated while a gate it names is off, and clears when both are on', () => {
  const sec = getSurface('sec')

  const off = resolveSurfaceStatus(sec, BOTH_GATES_OFF)
  assert.equal(off.status, 'gated')
  assert.ok(off.status === 'gated' && off.note.length > 0, 'a gated badge must say which part')

  // One on, one off is still gated — the surface names two flags and claims neither individually.
  assert.equal(
    resolveSurfaceStatus(sec, { resilienceScenariosEnabled: true, securitySimulationsEnabled: false }).status,
    'gated'
  )
  assert.equal(
    resolveSurfaceStatus(sec, { resilienceScenariosEnabled: false, securitySimulationsEnabled: true }).status,
    'gated'
  )

  assert.deepEqual(resolveSurfaceStatus(sec, BOTH_GATES_ON), { status: 'live' })
})

// Epic D4's structural half. FinOps is not gated-off, it is absent — so no flag position can make
// it live, and this asserts that rather than trusting the comment that says so.
test('the unbuilt surface is next under every gate reading', () => {
  const fin = getSurface('fin')
  assert.equal(resolveSurfaceStatus(fin, BOTH_GATES_OFF).status, 'next')
  assert.equal(resolveSurfaceStatus(fin, BOTH_GATES_ON).status, 'next')
})

test('an unknown surface id fails loudly', () => {
  // @ts-expect-error — the point of the test is the runtime guard behind the type.
  assert.throws(() => getSurface('marketing'), /Unknown ops surface id/)
})

// ── The partial-gate defect Codex found in PR #100 ────────────────────────────────────────────
// The note used to be a constant, shown whenever either gate was off: "Running a drill is switched
// off in this deployment". True with both gates off, FALSE the moment one opens on its own — the
// page would tell a reader nothing can run while a resilience drill ran. These pin the property
// that replaced it: the sentence names the drills that are actually unavailable, and nothing else.
test('the gated note names only the drills that are actually switched off', () => {
  const bothOff = gatedDrillNote(BOTH_GATES_OFF)
  assert.match(bothOff, /resilience drills/)
  assert.match(bothOff, /security scenarios/)

  const securityOnly = gatedDrillNote({
    resilienceScenariosEnabled: true,
    securitySimulationsEnabled: false,
  })
  assert.match(securityOnly, /security scenarios/)
  assert.doesNotMatch(
    securityOnly,
    /resilience/,
    'resilience drills CAN be started in this state — saying otherwise is the defect'
  )

  const resilienceOnly = gatedDrillNote({
    resilienceScenariosEnabled: false,
    securitySimulationsEnabled: true,
  })
  assert.match(resilienceOnly, /resilience drills/)
  assert.doesNotMatch(resilienceOnly, /security/)
})

// Empty string is the "nothing is gated" signal `resolveSurfaceStatus` branches on, so it must stay
// empty rather than becoming a cheerful sentence — a non-empty note here would paint a "partly
// gated" badge over a fully-open deployment.
test('with both gates open the note is empty, and the surface reads live', () => {
  assert.equal(gatedDrillNote(BOTH_GATES_ON), '')
  assert.deepEqual(resolveSurfaceStatus(getSurface('sec'), BOTH_GATES_ON), { status: 'live' })
})
