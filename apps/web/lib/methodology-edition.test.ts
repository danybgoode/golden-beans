import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMethodologyEdition } from './methodology-edition.ts'
import {
  METHODOLOGY_CHAPTERS,
  METHODOLOGY_CHECKPOINT,
  METHODOLOGY_PHASES,
  METHODOLOGY_PREFLIGHT,
  WORK_LABELS,
} from './methodology-chapters.ts'

// The REAL module, exactly as the route passes it — not a fixture. A fixture here would test that
// the generator agrees with a fake, which is the one thing nobody needs to know.
const SOURCE = {
  chapters: METHODOLOGY_CHAPTERS,
  phases: METHODOLOGY_PHASES,
  preflight: METHODOLOGY_PREFLIGHT,
  checkpoint: METHODOLOGY_CHECKPOINT,
  workLabels: WORK_LABELS,
}

const SITE = 'https://example.test'
const edition = renderMethodologyEdition(SITE, SOURCE)

// The property D5 actually asks for: the edition is DERIVED, so it cannot drift. These assertions
// are written against the module rather than against expected strings — an expected-string test
// would itself become a second copy of the prose, which is the defect this file exists to avoid.

test('every chapter appears, in order, with its title, lede and URL', () => {
  let cursor = 0
  for (const chapter of METHODOLOGY_CHAPTERS) {
    const heading = `## ${String(chapter.number).padStart(2, '0')}. ${chapter.title}`
    const at = edition.indexOf(heading)
    assert.ok(at > -1, `${chapter.id} is missing from the edition`)
    assert.ok(at > cursor, `${chapter.id} is out of reading order`)
    cursor = at
    assert.ok(edition.includes(chapter.lede), `${chapter.id}'s lede is missing`)
    assert.ok(
      edition.includes(`${SITE}/methodology/${chapter.id}`),
      `${chapter.id} does not link back to its page`
    )
  }
})

test('§0 and the checkpoint are in the edition too, not just the chapters', () => {
  assert.ok(edition.includes(`## ${METHODOLOGY_PREFLIGHT.title}`))
  assert.ok(edition.includes(`## ${METHODOLOGY_CHECKPOINT.title}`))
  assert.ok(edition.includes('Do not create a tutorial project'))
  assert.ok(edition.includes('Better operation is'))
})

test('every agent prompt is fenced, so it can be copied without its surroundings', () => {
  const prompts = METHODOLOGY_CHAPTERS.flatMap((chapter) =>
    chapter.blocks.filter((b) => b.kind === 'work' && b.variant === 'agent')
  )
  assert.ok(prompts.length > 0, 'no prompts to check — the extractor found nothing')

  for (const block of prompts) {
    assert.ok(block.kind === 'work' && block.variant === 'agent')
    const fenced = `\`\`\`text\n${block.prompt}\n\`\`\``
    assert.ok(edition.includes(fenced), 'an agent prompt is not fenced verbatim')
  }
})

test('every work block keeps its label, so the taxonomy survives the conversion', () => {
  const used = new Set(
    METHODOLOGY_CHAPTERS.flatMap((chapter) =>
      chapter.blocks.filter((b) => b.kind === 'work').map((b) => (b as { variant: string }).variant)
    )
  )
  assert.ok(used.size >= 4, 'expected the four-way taxonomy to be present in the content')
  for (const variant of used) {
    const label = WORK_LABELS[variant as keyof typeof WORK_LABELS]
    assert.ok(edition.includes(`**${label}**`), `the "${label}" label is missing from the edition`)
  }
})

// The defect the whole epic keeps guarding against, in its newest surface.
test('no rendered lede or block leaks a template literal or a pandoc artifact', () => {
  assert.ok(!edition.includes('{1:'), 'the mockup’s object literal reached the edition')
  assert.ok(!/^-{10,}$/m.test(edition), 'a pandoc horizontal rule reached the edition')
  assert.ok(!edition.includes(' --- '), 'a pandoc em-dash reached the edition')
})

test('the edition says what it is — a snapshot, with the live version named', () => {
  assert.ok(edition.includes(`${SITE}/methodology`), 'the edition must name where the live one is')
  assert.ok(/snapshot/i.test(edition), 'the edition must say it is a snapshot')
})

test('the URLs are the CALLER’s site, never a hardcoded host', () => {
  const other = renderMethodologyEdition('https://other.test', SOURCE)
  assert.ok(other.includes('https://other.test/methodology'))
  assert.ok(!other.includes(SITE), 'a hardcoded host leaked into the generated edition')
})

test('the document is markdown-shaped: one h1, no runs of blank lines, trailing newline', () => {
  const h1s = edition.split('\n').filter((line) => /^# /.test(line))
  assert.equal(h1s.length, 1, 'the edition must have exactly one top-level heading')
  assert.ok(!/\n{3,}/.test(edition), 'runs of blank lines survived the join')
  assert.ok(edition.endsWith('\n'), 'a text document ends with a newline')
})
