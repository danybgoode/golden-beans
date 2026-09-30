import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseSurface } from '../../../scripts/lib/surface.mjs'
import { BLOCK_KINDS } from './state-contract-core.mjs'
import { surfaceEntry } from './surface-contract.mjs'

/**
 * sketch-specs 2.2 / D14 — proof the format loses nothing, BEFORE a new state depends on it.
 *
 * Each fixture is an approved prototype state written as a surface. Its entry is compared with the entry
 * `extractSignature` actually read out of the prototype (`STATE-CONTRACT.json`, which CI regenerates and diffs), so
 * this also pins the one rule `surface-contract.mjs` had to copy from inside a browser function (how words are
 * normalised). Only three states qualify byte for byte (lock C6): every block one of the twelve kinds, and no
 * designer annotation, which a spec by construction cannot contain.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const MAP = JSON.parse(readFileSync(join(HERE, 'surface.map.json'), 'utf8'))
const CONTRACT = JSON.parse(readFileSync(join(HERE, 'STATE-CONTRACT.json'), 'utf8')).states

const fixture = (state: string) =>
  surfaceEntry(
    parseSurface(readFileSync(join(HERE, 'surface-parity', `${state}.surface`), 'utf8'), `surface-parity/${state}.surface`),
    MAP,
    BLOCK_KINDS
  )

for (const state of ['ship-features', 'ship-features-dormant', 'ship-activity']) {
  test(`parity, byte for byte: ${state}`, () => {
    const { source, ...entry } = fixture(state)
    assert.equal(source, 'spec')
    assert.ok(CONTRACT[state], `${state} is not in STATE-CONTRACT.json`)
    assert.equal(JSON.stringify(entry), JSON.stringify(CONTRACT[state]))
  })
}

// Three states the byte-for-byte set misses — a trailing unlabelled column, a tile count, a glyph in an action — each
// carrying ONE designer annotation, which is the only thing a spec cannot say. So the blocks must still agree exactly.
const BLOCKS_ONLY: Record<string, string> = {
  'setup-keys': '- head "API keys" action "+ New key"\n- list columns "Key | What it may do | Where · expires |"',
  'measure-journeys':
    '- head "Journeys" action "+ New journey"\n- answer "a"\n- tiles count 4\n- list columns "Journey | State | People |"',
  'measure-scenarios':
    '- head "Scenarios" action "▸ Run a drill"\n- answer "a"\n- tiles count 4\n- list columns "Drill | Kind | Last run |"',
}
for (const [state, blocks] of Object.entries(BLOCKS_ONLY)) {
  test(`parity, blocks only (one annotation apart): ${state}`, () => {
    const entry = surfaceEntry(parseSurface(`state: ${state}\nroute: /r\n${blocks}`), MAP, BLOCK_KINDS)
    assert.equal(CONTRACT[state].annotations, 1, 'the premise: exactly one annotation is the difference')
    assert.equal(JSON.stringify(entry.blocks), JSON.stringify(CONTRACT[state].blocks))
  })
}
