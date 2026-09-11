import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DISPLAY_NAME_MAX, actorLabel, displayNameFrom, parseDisplayName } from './display-name.ts'

// Every invisible character below is written as an ESCAPE, so this file contains none itself.
const NEWLINE_NAME = 'Dan\niel'
const ZERO_WIDTH_NAME = 'Dan\u200biel'
const RTL_OVERRIDE_NAME = 'Dan\u202eleinaD'
const BOM_NAME = '\ufeffDaniel'
const C1_NAME = 'Dani\u0085el'

test('an empty or absent name is "no name", not an error', () => {
  for (const raw of [undefined, null, '', '   ', '\t \n']) {
    assert.deepEqual(parseDisplayName(raw), { ok: true, value: null }, `raw=${JSON.stringify(raw)}`)
  }
})

test('whitespace is collapsed and trimmed, and the name is otherwise kept as typed', () => {
  assert.deepEqual(parseDisplayName('  Daniel   Vega  '), { ok: true, value: 'Daniel Vega' })
  assert.deepEqual(parseDisplayName('Jose Nunez'), { ok: true, value: 'Jose Nunez' })
  // A pasted newline is ordinary whitespace — collapsed, not refused.
  assert.deepEqual(parseDisplayName(NEWLINE_NAME), { ok: true, value: 'Dan iel' })
})

test('invisible and direction-changing characters are REFUSED, not silently stripped', () => {
  // The right-to-left override is the dangerous one: it can make one name in an audit read as a
  // different name. None of these is typed into a text field.
  for (const raw of [ZERO_WIDTH_NAME, RTL_OVERRIDE_NAME, BOM_NAME, C1_NAME]) {
    assert.equal(parseDisplayName(raw).ok, false, `accepted ${JSON.stringify(raw)}`)
  }
})

test('a name is bounded, counted in characters a reader sees', () => {
  assert.equal(parseDisplayName('a'.repeat(DISPLAY_NAME_MAX)).ok, true)
  assert.equal(parseDisplayName('a'.repeat(DISPLAY_NAME_MAX + 1)).ok, false)
  // Code points, not UTF-16 units: 80 emoji are 80 characters on screen, not 160.
  assert.equal(parseDisplayName('\u{1F32E}'.repeat(DISPLAY_NAME_MAX)).ok, true)
})

test('a non-string is refused rather than coerced', () => {
  for (const raw of [42, true, {}, ['Daniel']]) assert.equal(parseDisplayName(raw).ok, false)
})

test('metadata is read from display_name first, then the keys other writers use', () => {
  assert.equal(displayNameFrom({ display_name: 'Daniel', full_name: 'Other' }), 'Daniel')
  assert.equal(displayNameFrom({ full_name: 'Daniel Vega' }), 'Daniel Vega')
  assert.equal(displayNameFrom({ name: 'Dan' }), 'Dan')
  // A blank preferred key does not hide a real one behind it.
  assert.equal(displayNameFrom({ display_name: '  ', full_name: 'Daniel' }), 'Daniel')
})

test('metadata is INPUT: an invalid stored name is ignored, never rendered', () => {
  assert.equal(displayNameFrom({ display_name: RTL_OVERRIDE_NAME }), null)
  assert.equal(displayNameFrom({ display_name: 'x'.repeat(DISPLAY_NAME_MAX + 1) }), null)
  for (const metadata of [null, undefined, 'Daniel', 7, {}]) assert.equal(displayNameFrom(metadata), null)
})

test('the label is the name, else the email, else the id — never blank, never invented', () => {
  const id = '3f9c2a1e-0000-4000-8000-00000000b7d0'
  assert.equal(actorLabel({ name: 'Daniel', email: 'd@example.com' }, id), 'Daniel')
  assert.equal(actorLabel({ name: null, email: 'd@example.com' }, id), 'd@example.com')
  assert.equal(actorLabel({ name: null, email: null }, id), id)
  // A lookup that failed or was skipped leaves no entry at all — and the id is still an answer.
  assert.equal(actorLabel(undefined, id), id)
})
