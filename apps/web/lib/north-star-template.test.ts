import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { northStarSyncSchema } from './north-star-schema.ts'

// think-skills D3: the `north-star` skill's template carries the sync payload a workshop leaves in
// `Roadmap/00-strategy/north-star.md`. The engine validates that payload with `northStarSyncSchema`, and the plugin
// lives in `skills/`, which is mirrored to a repo that cannot import this app. So the ONE check that the template's
// example is something the engine would accept runs here, against the real schema, not a copy of it.

const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../skills/plugins/golden-frijoles/skills/north-star/templates/north-star.md'
)

function syncFences(markdown: string): string[] {
  return [...markdown.matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map((match) => match[1])
}

test('the north-star template carries exactly one json fence, under ## Sync payload', () => {
  const markdown = readFileSync(TEMPLATE, 'utf8')
  const fences = syncFences(markdown)
  assert.equal(fences.length, 1)
  const section = markdown.slice(markdown.indexOf('\n## Sync payload\n'))
  assert.ok(section.includes('```json\n'), 'the json fence sits under ## Sync payload')
})

test("the template's sync payload is one the engine accepts", () => {
  const [fence] = syncFences(readFileSync(TEMPLATE, 'utf8'))
  const parsed = northStarSyncSchema.safeParse(JSON.parse(fence))
  assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.flatten()))
  // Both input shapes are shown, so the skill has an example of each rule the route enforces.
  const sources = new Set(parsed.data.inputs.map((input) => input.valueSource))
  assert.deepEqual([...sources].sort(), ['external_push', 'telemetry_event'])
})
