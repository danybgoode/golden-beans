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
  drillAvailabilitySentence,
  surfaceBadgeLabel,
  type OpsGateReadings,
  type OpsSurface,
} from './maker-ops.ts'

const BOTH_GATES_ON: OpsGateReadings = {
  resilienceScenariosEnabled: true,
  securitySimulationsEnabled: true,
  destinationDeliveryEnabled: true,
}
const BOTH_GATES_OFF: OpsGateReadings = {
  resilienceScenariosEnabled: false,
  securitySimulationsEnabled: false,
  destinationDeliveryEnabled: false,
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
    resolveSurfaceStatus(sec, {
      resilienceScenariosEnabled: true,
      securitySimulationsEnabled: false,
      destinationDeliveryEnabled: true,
    }).status,
    'gated'
  )
  assert.equal(
    resolveSurfaceStatus(sec, {
      resilienceScenariosEnabled: false,
      securitySimulationsEnabled: true,
      destinationDeliveryEnabled: true,
    }).status,
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

// ── Round 3: DevOps advertised a gated capability as shipped ──────────────────────────────────
// "Destinations + replay" sat beside three unconditionally-live capabilities with no
// qualification, while DESTINATION_DELIVERY_ENABLED is born OFF. Stating a capability as live
// without reading its flag is CODE-QUALITY #9, and it is the exact defect the SecOps surface was
// already built to avoid — so the fix was to give DevOps the same treatment, not a caveat in prose.
test('the DevOps surface reads its own delivery gate', () => {
  const dev = getSurface('dev')

  const off = resolveSurfaceStatus(dev, BOTH_GATES_OFF)
  assert.equal(off.status, 'gated')
  assert.match(
    off.status === 'gated' ? off.note : '',
    /delivery/i,
    'the note must name what is actually switched off, not drills'
  )

  // The scenario gates must not move it: they are a different surface's flags entirely.
  assert.deepEqual(
    resolveSurfaceStatus(dev, {
      resilienceScenariosEnabled: false,
      securitySimulationsEnabled: false,
      destinationDeliveryEnabled: true,
    }),
    { status: 'live' }
  )
})

// The SecOps surface must not have picked up the delivery gate in the same change — each gated
// surface answers for its OWN flags. A resolver that ORs every gate together would pass the test
// above and quietly make both surfaces report each other's outages.
test('each gated surface answers only for the flags it names', () => {
  const sec = resolveSurfaceStatus(getSurface('sec'), {
    resilienceScenariosEnabled: true,
    securitySimulationsEnabled: true,
    destinationDeliveryEnabled: false,
  })
  assert.deepEqual(sec, { status: 'live' }, 'delivery being off says nothing about SecOps')
})

// ── Round 6: three views, three different words for one state ─────────────────────────────────
// The bag said "Next", the panel said "Next build", and the tab said nothing at all for a gated
// surface. One label function now serves all three, and this pins the contract it has to keep:
// every non-live state has exactly one non-empty label, and live has none.
test('every status has one badge label, and live has none', () => {
  assert.equal(surfaceBadgeLabel('live'), null, 'a live surface needs no badge')
  assert.equal(surfaceBadgeLabel('next'), 'Next build')
  assert.equal(surfaceBadgeLabel('gated'), 'Partly gated')

  // The two qualified states must stay DISTINGUISHABLE. Collapsing them to one word would make
  // "not built" and "built but switched off" look identical, which is the whole distinction the
  // page's honesty vocabulary rests on.
  assert.notEqual(surfaceBadgeLabel('next'), surfaceBadgeLabel('gated'))
})

// ── Round 8: the unknown-gate guard was unreachable in the case it exists for ──────────────────
// The check sat AFTER the per-gate branches, so a surface naming a known gate alongside an unknown
// one matched the known branch and returned before ever validating. A newly-gated capability would
// then have rendered under a sentence that says nothing about it. Validation now runs first, and
// this pins it — including the mixed case, which is the one that was actually broken.
test('a surface naming an undescribed gate fails loudly, even beside a known one', () => {
  // The casts are the point, not a workaround. Since round 11 `gates` is typed to a union derived
  // from GATE_NOTES, so an undescribed gate is a COMPILE error — which is the primary defence and
  // is asserted by the fact that these objects need a cast at all. What is tested here is the
  // SECOND layer: the runtime check that still has to hold for data the type system cannot reach.
  const withUnknownOnly = {
    ...getSurface('sec'),
    availability: { kind: 'gated' as const, gates: ['SOME_FUTURE_GATE'] },
  } as unknown as OpsSurface
  assert.throws(() => resolveSurfaceStatus(withUnknownOnly, BOTH_GATES_OFF), /No note is defined/)

  // The case the old ordering let through: an unknown gate hiding behind a known one.
  const mixed = {
    ...getSurface('sec'),
    availability: {
      kind: 'gated' as const,
      gates: ['RESILIENCE_SCENARIOS_ENABLED', 'SOME_FUTURE_GATE'],
    },
  } as unknown as OpsSurface
  assert.throws(
    () => resolveSurfaceStatus(mixed, BOTH_GATES_OFF),
    /SOME_FUTURE_GATE/,
    'an unknown gate beside a known one must still fail — this is the case that was broken'
  )
  // And it must fail whether or not the known gate happens to be open.
  assert.throws(() => resolveSurfaceStatus(mixed, BOTH_GATES_ON), /SOME_FUTURE_GATE/)
})

// The real surfaces must all pass that validation — otherwise the guard above is theatre.
test('every shipped surface names only describable gates', () => {
  for (const surface of MAKER_OPS_SURFACES) {
    assert.doesNotThrow(
      () => resolveSurfaceStatus(surface, BOTH_GATES_OFF),
      `${surface.id} names a gate with no sentence defined for it`
    )
  }
})

// ── Round 9: the allow-list did not guarantee a handler ───────────────────────────────────────
// `DESCRIBABLE_GATES` was a bare list of names, checked separately from the branches that describe
// them. A contributor could add a gate to the list, use it on a surface, forget the branch, and
// ship — validation passes (the name is listed) and the surface renders as fully LIVE with its
// gate closed. The list and the handlers are now one structure, so that is a type error.
//
// This asserts the property that structure buys: every gate any real surface names produces a
// non-empty sentence when it is off. A handler that returned '' unconditionally would pass the
// unknown-gate test and fail this one.
test('every gate a surface names produces a real sentence when it is closed', () => {
  const allOff: OpsGateReadings = {
    resilienceScenariosEnabled: false,
    securitySimulationsEnabled: false,
    destinationDeliveryEnabled: false,
  }

  for (const surface of MAKER_OPS_SURFACES) {
    if (surface.availability.kind !== 'gated') continue
    const resolved = resolveSurfaceStatus(surface, allOff)
    assert.equal(
      resolved.status,
      'gated',
      `${surface.id} names gates that are all off but does not report gated`
    )
    assert.ok(
      resolved.status === 'gated' && resolved.note.trim().length > 0,
      `${surface.id} reports gated with an empty sentence — the reader is told nothing`
    )
  }
})

// A surface naming BOTH scenario gates must not say the same sentence twice.
test('a surface naming two gates that share a sentence says it once', () => {
  const sec = resolveSurfaceStatus(getSurface('sec'), BOTH_GATES_OFF)
  assert.equal(sec.status, 'gated')
  const note = sec.status === 'gated' ? sec.note : ''
  assert.equal(note.split('Starting').length - 1, 1, `the note repeats itself: ${note}`)
})

// ── Round 12: the trailing clause contradicted the computed half ──────────────────────────────
// The panel rendered `{gatedDrillNote(...)}, so this shows the shape rather than a run you could
// start here today.` — first half computed, tail hardcoded. With exactly ONE gate open the tail
// said no drill was startable while one was.
//
// Codex also named why the existing test missed it: it asserted only that "switched off" appears,
// which is true in the partial case AND the total case. So these assert the DISTINCTION, which is
// the only thing that can fail on the bug.
test('the drills sentence does not deny a run that is actually startable', () => {
  const bothOff = drillAvailabilitySentence(BOTH_GATES_OFF)
  assert.match(bothOff, /switched off/)
  assert.match(bothOff, /rather than a run you could start here today/)

  for (const partial of [
    { resilienceScenariosEnabled: true, securitySimulationsEnabled: false },
    { resilienceScenariosEnabled: false, securitySimulationsEnabled: true },
  ]) {
    const sentence = drillAvailabilitySentence(partial)
    assert.match(sentence, /switched off/, 'the closed half must still be disclosed')
    assert.doesNotMatch(
      sentence,
      /rather than a run you could start here today/,
      `one drill IS startable in this state — saying otherwise is the defect: "${sentence}"`
    )
    assert.match(sentence, /the other one can be started/)
  }
})

test('with both drill gates open the panel says nothing at all', () => {
  assert.equal(drillAvailabilitySentence(BOTH_GATES_ON), '')
})
