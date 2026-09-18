// The version constant and the manifest must agree, and the unit gate is where that is caught.
//
// `VERSION` is a literal because a runtime `require('../package.json')` resolves differently from
// `src/` and from `dist/`, and silently returns `undefined` on a packaging change — printing
// `gf undefined` to whoever asked which version they have. A literal cannot do that; what it CAN do
// is drift, so this is the assertion that stops it.
//
// ⚠️ It also pins the published `bin`. `gf` is the name the epic, the installer and every document
// promise, and a manifest that renamed it would ship a package whose one-line install instruction
// is wrong — with nothing else in the repo able to notice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION } from './version.ts'

const manifest = JSON.parse(
  readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json'), 'utf8')
) as { version: string; bin: Record<string, string>; name: string; files: string[] }

test('VERSION equals the published version in package.json', () => {
  assert.equal(VERSION, manifest.version)
})

test('the package publishes `gf`, from the built entry', () => {
  assert.equal(manifest.name, '@golden-frijoles/cli')
  assert.deepEqual(Object.keys(manifest.bin), ['gf'])
  assert.equal(manifest.bin.gf, './dist/bin.js')
})

test('only dist and the README are published — never src, never a token', () => {
  // `files` is an allow-list. Without it npm ships everything not in .npmignore, which on this
  // package would include `src/__golden__` and any stray local file in the directory at pack time.
  assert.deepEqual([...manifest.files].sort(), ['README.md', 'dist'])
})
