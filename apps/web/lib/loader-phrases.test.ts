import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOADER_PHRASES } from './loader-phrases.ts'

test('the loader ships the complete approved phrase pack without duplicates', () => {
  assert.equal(LOADER_PHRASES.length, 20)
  assert.equal(new Set(LOADER_PHRASES).size, LOADER_PHRASES.length)
  for (const phrase of LOADER_PHRASES) assert.ok(phrase.endsWith('…'), phrase)
  assert.ok(LOADER_PHRASES.includes('Fee-fi-fo-fumbling…'))
  assert.ok(LOADER_PHRASES.includes('North-Star-gazing…'))
  assert.ok(LOADER_PHRASES.includes('Spilling the beans…'))
})
