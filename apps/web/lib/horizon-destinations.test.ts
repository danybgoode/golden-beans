import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveHorizon, HORIZON_DESTINATIONS, type HorizonEpicInput } from './horizon-destinations.ts'

// pod-report · Sprint 1, Story 1.3 — the destination badge rule.
//
// This module decides what the horizon view CLAIMS is delivered, so the case that matters most is
// the one where it must refuse to claim: `lit` has to be unreachable unless every contributing epic
// is genuinely shipped. Over-claiming ✅ is the single failure the poster rule forbids outright
// (under-claiming is merely untidy), and here it would mean showing an investor a destination as
// reached when it is not.

const epic = (slug: string, shipped: boolean): HorizonEpicInput => ({ slug, name: slug, shipped })

/** A destination from the real registry with more than one contributing epic — for partial states. */
const multi = HORIZON_DESTINATIONS.find((d) => d.epics.length > 1)!
/** A destination with exactly one contributing epic — for the simple lit/coming cases. */
const single = HORIZON_DESTINATIONS.find((d) => d.epics.length === 1)!

test('the registry itself is coherent: unique ids, and every destination names at least one epic', () => {
  // A duplicate id would render two cards claiming the same destination; an empty epic list would
  // create a destination nothing could ever light, which reads as permanent failure to a viewer.
  const ids = HORIZON_DESTINATIONS.map((d) => d.id)
  assert.equal(new Set(ids).size, ids.length, 'destination ids must be unique')
  for (const d of HORIZON_DESTINATIONS) {
    assert.ok(d.epics.length > 0, `${d.id} names no epics`)
    assert.ok(d.title.trim().length > 0, `${d.id} has no title`)
    assert.ok(d.description.trim().length > 0, `${d.id} has no description`)
  }
})

test('a destination whose every contributing epic is shipped is LIT', () => {
  const view = deriveHorizon(single.epics.map((s) => epic(s, true)))
  assert.equal(view.find((d) => d.id === single.id)!.status, 'lit')
})

test('a destination with some but not all epics shipped is PARTIAL, never lit', () => {
  const [first, ...rest] = multi.epics
  const view = deriveHorizon([epic(first, true), ...rest.map((s) => epic(s, false))])
  const d = view.find((x) => x.id === multi.id)!
  assert.equal(d.status, 'partial')
  assert.notEqual(d.status, 'lit')
})

test('a destination with no shipped epics is COMING', () => {
  const view = deriveHorizon(single.epics.map((s) => epic(s, false)))
  assert.equal(view.find((d) => d.id === single.id)!.status, 'coming')
})

test('an epic MISSING from the artifact is exactly as unshipped as one in flight', () => {
  // A destination whose epics have not been pushed at all must read `coming`, not `lit`. An
  // implementation that treated "no contributing epics found" as vacuously satisfied would light
  // every unbuilt destination on an empty roadmap — the worst possible default.
  const view = deriveHorizon([])
  for (const d of view) {
    assert.equal(d.status, 'coming', `${d.id} must be coming on an empty roadmap`)
    assert.deepEqual(d.litBy, [], `${d.id} must list no contributing epics`)
  }
})

test('an UNREGISTERED epic lights nothing, silently — a renamed or ungroomed slug is not a claim', () => {
  const view = deriveHorizon([epic('some-epic-nobody-registered', true)])
  for (const d of view) {
    assert.equal(d.status, 'coming')
    assert.ok(
      !d.litBy.some((e) => e.slug === 'some-epic-nobody-registered'),
      'an unregistered epic must never appear as contributing'
    )
  }
})

test('litBy reports only MATCHED epics, in registry order, carrying their real shipped flag', () => {
  const [first, ...rest] = multi.epics
  const view = deriveHorizon([epic(first, true), ...rest.map((s) => epic(s, false))])
  const d = view.find((x) => x.id === multi.id)!
  assert.deepEqual(
    d.litBy.map((e) => e.slug),
    multi.epics,
    'litBy must follow registry order so the card reads consistently'
  )
  assert.equal(d.litBy.find((e) => e.slug === first)!.shipped, true)
})

test('every destination is returned on every call — a card never silently disappears', () => {
  // The horizon shows the DESTINATION, not the backlog. Dropping an unlit destination would turn
  // the view back into a list of what happens to be done — the exact failure the story names.
  assert.equal(deriveHorizon([]).length, HORIZON_DESTINATIONS.length)
  assert.equal(deriveHorizon([epic('growth-engine-v1', true)]).length, HORIZON_DESTINATIONS.length)
})

test('deriveHorizon is pure — calling it twice yields equal results and mutates no input', () => {
  const input = [epic('growth-engine-v1', true)]
  const a = deriveHorizon(input)
  const b = deriveHorizon(input)
  assert.deepEqual(a, b)
  assert.deepEqual(input, [epic('growth-engine-v1', true)], 'input must not be mutated')
})
