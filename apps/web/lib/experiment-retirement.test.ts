// experiments-for-humans · Story 4.3 (epic README D9) — the JSON authoring box stays retired.
//
// The builder is the one way in; JSON is an API/agent format only. This walks every source file under
// `app/app/experiments` and fails on a `<textarea` or the words "Definition JSON" — mutation-checked
// by planting a textarea (it fails) and removing it (it passes).

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const ROOT = join(process.cwd(), 'apps/web/app/app/experiments')

function sources(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const full = join(path, entry)
    return statSync(full).isDirectory()
      ? sources(full)
      : full.endsWith('.ts') || full.endsWith('.tsx')
        ? [full]
        : []
  })
}

test('the guided builder is the only experiment authoring surface', () => {
  const violations = sources(ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return ['<textarea', 'Definition JSON']
      .filter((forbidden) => source.includes(forbidden))
      .map((forbidden) => `${file}: ${forbidden}`)
  })
  assert.deepEqual(violations, [])
})
