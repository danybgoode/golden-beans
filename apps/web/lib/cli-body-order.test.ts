import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// think-skills #216 (cross-family review, Codex): the CLI gate must come before the request BODY as well as before the
// credential. Three POST routes parsed first, so with CLI_WRITE_API_ENABLED off a malformed body answered 400
// instead of the uniform 404. They read their body through `readCliBody` now.
//
// The e2e server always runs with the gate ON (born ON, `cli-api.spec.ts`), so the gate-off answer can't be asserted
// end to end. This pins it structurally instead: no CLI route reads a body itself, and the one reader gates first.

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ROUTES = join(HERE, '..', 'app', 'api', 'v1', 'cli')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? routeFiles(full) : name === 'route.ts' ? [full] : []
  })
}

test('no CLI route parses a request body itself — every body goes through readCliBody', () => {
  const files = routeFiles(CLI_ROUTES)
  assert.ok(files.length >= 5, `found only ${files.length} CLI routes — the walk is wrong`)
  const offenders = files.filter((file) =>
    /\b(?:req|request)\.(?:json|text|formData|arrayBuffer)\(/.test(readFileSync(file, 'utf8'))
  )
  assert.deepEqual(offenders, [])
})

test('readCliBody checks the gate before it touches the body', () => {
  const source = readFileSync(join(HERE, 'cli-auth.ts'), 'utf8')
  const fn = source.slice(source.indexOf('export async function readCliBody'))
  const gate = fn.indexOf('if (!isCliWriteApiEnabled()) return gateClosed()')
  const parse = fn.indexOf('await req.json()')
  assert.ok(gate !== -1 && parse !== -1, 'readCliBody must gate and then parse')
  assert.ok(gate < parse, 'the gate must come first')
})
