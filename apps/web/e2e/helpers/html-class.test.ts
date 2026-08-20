// A guard for a guard. `withClass`/`elementsByClass` decide what the HTML-level specs can SEE, so a
// matcher that quietly stops matching turns their assertions into questions nobody is asking — and
// its own first draft was wrong in two ways that no caller would have surfaced (see the module's
// header). Both are pinned below, in both directions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elementsByClass, withClass } from './html-class.ts'

const matches = (html: string, name: string) => new RegExp(withClass(name)).test(html)

test('a class is matched wherever it sits in the attribute', () => {
  assert.ok(matches('class="target"', 'target'))
  assert.ok(matches('class="target trailing"', 'target'))
  assert.ok(matches('class="leading target"', 'target'))
  assert.ok(matches('class="leading target trailing"', 'target'))
})

// The bug the first draft had: `\b` treats `-` as a boundary, so a hyphenated NEIGHBOUR matched.
test('a hyphenated neighbour is NOT the class you asked for', () => {
  assert.ok(!matches('class="target-header"', 'target'))
  assert.ok(!matches('class="old-target"', 'target'))
  assert.ok(!matches('class="a old-target-b"', 'target'))
  // ...while the real thing still matches when a hyphenated sibling is present.
  assert.ok(matches('class="target-header target"', 'target'))
})

test('a partial word is not a match either', () => {
  assert.ok(!matches('class="targeted"', 'target'))
  assert.ok(!matches('class="untarget"', 'target'))
})

test('hyphenated class names — the real shape used in this app — behave the same', () => {
  assert.ok(matches('class="methodology-lede"', 'methodology-lede'))
  assert.ok(matches('class="measure methodology-lede"', 'methodology-lede'))
  assert.ok(!matches('class="methodology-lede-wide"', 'methodology-lede'))
})

// The second bug: `class` was required to be the element's only attribute.
test('elementsByClass tolerates other attributes on either side of class', () => {
  const inner = (html: string, tag: string, name: string) =>
    [...html.matchAll(elementsByClass(tag, name))].map((m) => m[1])

  assert.deepEqual(inner('<ol class="chapters">A</ol>', 'ol', 'chapters'), ['A'])
  assert.deepEqual(inner('<ol id="x" class="chapters">A</ol>', 'ol', 'chapters'), ['A'])
  assert.deepEqual(inner('<ol class="chapters" data-k="v">A</ol>', 'ol', 'chapters'), ['A'])
  assert.deepEqual(inner('<ol id="x" class="a chapters b" aria-label="l">A</ol>', 'ol', 'chapters'), ['A'])
})

test('elementsByClass finds every match, and none of the wrong tag or class', () => {
  const html =
    '<ol class="chapters">one</ol><ul class="chapters">skip</ul><ol class="other">no</ol><ol class="chapters">two</ol>'
  assert.deepEqual(
    [...html.matchAll(elementsByClass('ol', 'chapters'))].map((m) => m[1]),
    ['one', 'two']
  )
})

test('a name containing regex metacharacters cannot break the pattern', () => {
  assert.ok(matches('class="a.b"', 'a.b'))
  assert.ok(!matches('class="axb"', 'a.b'))
})
