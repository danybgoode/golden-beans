import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { SURFACE_KINDS, validateMap } from '../../../scripts/lib/surface.mjs'
import { BLOCK_KINDS } from './state-contract-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP = JSON.parse(readFileSync(join(HERE, 'surface.map.json'), 'utf8'))

/**
 * sketch-specs 1.2 / D11 — the project half of the map check. The kit can say a key is one of its twelve kinds; only
 * this repo can say a value is one of ITS kinds. A map naming a kind `BLOCK_KINDS` lacks would turn an approved
 * surface into a contract entry the gate can never match (`extractSignature` never emits that kind), which reads as
 * a page defect on a correct page — the `.ds-crumbrow` / `.ds-rail-label` failure in `state-contract-core.mjs`.
 */
test('surface.map.json: a usable map whose every value is a BLOCK_KINDS kind', () => {
  assert.deepEqual(validateMap(MAP), [])
  const known = new Set(BLOCK_KINDS.map((entry) => entry.kind))
  for (const [generic, target] of Object.entries(MAP.kinds as Record<string, string>)) {
    assert.ok(
      known.has(target),
      `surface.map.json maps \`${generic}\` to \`${target}\`, which BLOCK_KINDS does not have`
    )
  }
})

test('surface.map.json maps every generic kind — none is silently unreachable', () => {
  assert.deepEqual(Object.keys(MAP.kinds).sort(), Object.keys(SURFACE_KINDS).sort())
})
