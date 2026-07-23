import assert from 'node:assert/strict'
import test from 'node:test'
import { countStories } from './roadmap-to-notion.mjs'

test('story count recognizes status emoji before canonical Story headings', () => {
  const body = [
    '## Stories',
    '### ✅ Story 1.1 — complete',
    '### ✅ Story 1.2 — complete',
    '### Story 1.3 — planned',
    '### Story 1.4 — planned',
  ].join('\n')

  assert.deepEqual(countStories(body), { total: 4, done: 2 })
})

test('story count retains legacy heading variants without treating section headings as stories', () => {
  const body = [
    '## QA',
    '## ✅ US-1 shipped',
    '### 🟦 S2.1 (API) in review',
    '## C.3 planned',
  ].join('\n')

  assert.deepEqual(countStories(body), { total: 3, done: 1 })
})
