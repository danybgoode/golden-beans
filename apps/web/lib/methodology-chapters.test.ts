// methodology-experience · Sprint 2, Story 2.1 — the content module's own gate.
//
// This is a pure module with no imports that reach a database, which is the whole point of it being
// unit-testable here rather than only through a rendered route: the properties below are true of
// the CONTENT, and a route spec would only observe them second-hand through HTML.
//
// The defect these mostly exist for is mockup defect 1 — six chapters that rendered a raw
// JavaScript object literal as their opening paragraph because a templating step never ran. That
// shipped in the mockup and nothing complained, because a lede is prose and prose has no type. It
// can only ever regress silently, so it gets an assertion rather than a reviewer's attention.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  METHODOLOGY_CHAPTERS,
  METHODOLOGY_PHASES,
  WORK_LABELS,
  chapterNeighbours,
  chaptersInPhase,
  getChapter,
  type MethodologyBlock,
  type WorkVariant,
} from './methodology-chapters.ts'

/** Every block in a chapter, including the ones nested inside a work block's body. */
function allBlocks(blocks: MethodologyBlock[]): MethodologyBlock[] {
  return blocks.flatMap((block) =>
    block.kind === 'work' && block.variant !== 'agent'
      ? [block, ...(block.body as MethodologyBlock[])]
      : [block]
  )
}

test('there are exactly six chapters, numbered 1-6, in phase order', () => {
  assert.equal(METHODOLOGY_CHAPTERS.length, 6)
  assert.deepEqual(
    METHODOLOGY_CHAPTERS.map((chapter) => chapter.number),
    [1, 2, 3, 4, 5, 6]
  )

  // Phase order is the loop's order, and reading order must not interleave them — a reader who
  // works straight down the index must never go Consider → Operate → Consider.
  const phaseOrder = METHODOLOGY_PHASES.map((phase) => phase.id)
  const seen = METHODOLOGY_CHAPTERS.map((chapter) => phaseOrder.indexOf(chapter.phase))
  assert.deepEqual(
    seen,
    [...seen].sort((a, b) => a - b),
    'chapters are not in phase order'
  )
  assert.ok(
    seen.every((index) => index >= 0),
    'a chapter carries a phase that METHODOLOGY_PHASES does not declare'
  )
})

test('every id is unique and URL-safe — these are route segments, not labels', () => {
  const ids = METHODOLOGY_CHAPTERS.map((chapter) => chapter.id)
  assert.equal(new Set(ids).size, ids.length, 'two chapters share an id')

  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${id} is not a kebab route segment`)
    assert.equal(encodeURIComponent(id), id, `${id} would not survive a URL`)
  }
})

// Mockup defect 1. The literal the mockup rendered began with `{`, so that one character is the
// whole assertion — and it is a stronger check than comparing against the known-bad string, which
// would only catch that exact literal returning.
test('every chapter has its OWN lede, and no lede is a rendered object literal', () => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    assert.ok(chapter.lede.length > 0, `${chapter.id} has no lede`)
    assert.ok(!chapter.lede.includes('{'), `${chapter.id}'s lede contains a template literal`)
    assert.ok(!chapter.summary.includes('{'), `${chapter.id}'s summary contains a template literal`)
  }

  const ledes = METHODOLOGY_CHAPTERS.map((chapter) => chapter.lede)
  assert.equal(
    new Set(ledes).size,
    ledes.length,
    'two chapters share a lede — the mockup gave all six the same one'
  )
})

// Mockup defect 2 and the em-dash half of the same conversion failure. Asserted across EVERY block
// including nested work bodies, because the horizontal rules lived at the bottom of "What you just
// learned" blocks specifically — the deepest place in the tree.
test('no pandoc artifact survives anywhere in the content', () => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    for (const block of allBlocks(chapter.blocks)) {
      const texts =
        block.kind === 'list'
          ? block.items
          : block.kind === 'work'
            ? block.variant === 'agent'
              ? [block.prompt]
              : []
            : [block.text]

      for (const text of texts) {
        assert.ok(!text.includes('---'), `${chapter.id}: "${text.slice(0, 50)}…" carries a pandoc dash`)
        assert.ok(
          !/^-{10,}$/.test(text.trim()),
          `${chapter.id} still ends a block with a markdown horizontal rule`
        )
      }
    }
  }
})

// Mockup defect 3. Chapter 3's questions were one hyphenated paragraph; chapter 6's judgments had
// the same shape. Asserting the LISTS EXIST is what makes the restoration checkable — a prose block
// containing " - " would pass a "no artifacts" check and still be the defect.
test('the flattened lists are real lists again', () => {
  const questions = allBlocks(getChapter('place-the-bet').blocks).find((block) => block.kind === 'list')
  assert.ok(questions, 'chapter 3 has no list — the collapsed "Ask: - …" paragraph is back')
  assert.equal(questions.kind === 'list' && questions.items.length, 7)

  const judgments = allBlocks(getChapter('decide-what-happens-next').blocks).find(
    (block) => block.kind === 'list'
  )
  assert.ok(judgments, 'chapter 6 has no list of judgments')
  assert.equal(judgments.kind === 'list' && judgments.items.length, 5)

  // No block anywhere may be a list wearing prose clothes.
  for (const chapter of METHODOLOGY_CHAPTERS) {
    for (const block of allBlocks(chapter.blocks)) {
      if (block.kind !== 'prose') continue
      assert.ok(
        !/\s-\s.+\s-\s/.test(block.text),
        `${chapter.id}: a prose block still reads as a flattened list`
      )
    }
  }
})

// Epic D3. The rename reaches this content; it must not have missed a line, and it must not have
// been applied by `sed` to the internal vocabulary the module never uses anyway.
test('chapter 2 is "Design it" and no chapter still names the move "Shape"', () => {
  const chapter = getChapter('design-it')
  assert.equal(chapter.title, 'Design it')
  assert.equal(chapter.number, 2)

  for (const entry of METHODOLOGY_CHAPTERS) {
    for (const block of allBlocks(entry.blocks)) {
      const texts =
        block.kind === 'list'
          ? block.items
          : block.kind === 'work'
            ? block.variant === 'agent'
              ? [block.prompt]
              : []
            : [block.text]

      for (const text of texts) {
        assert.ok(
          !/\bshap(e|es|ed|ing)\b/i.test(text),
          `${entry.id}: "${text.slice(0, 60)}…" still names the move Shape`
        )
      }
    }
  }
})

// Epic D3 again, and the reason it is a copy pass rather than a swap: the source's own "learned"
// line was "Fix the investment before designing the solution", which after the rename would use the
// move's name for the thing the move is not.
test('the rename did not leave "Design" describing the solution', () => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    for (const block of allBlocks(chapter.blocks)) {
      const text = block.kind === 'prose' || block.kind === 'blockquote' ? block.text : ''
      assert.ok(
        !/design(ing)? the solution/i.test(text),
        `${chapter.id}: "Design" is being used for the solution, not for the move`
      )
    }
  }
})

// Titles are `<h1>`s on their routes, and `check-design-drift`'s `heading-period` rule reads the
// final character. Decided once (Story 2.3) and asserted here rather than special-cased in the
// guard.
test('no chapter title ends in a full stop', () => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    assert.ok(chapter.title.length > 0, `${chapter.id} has no title`)
    assert.ok(!chapter.title.endsWith('.'), `${chapter.id}'s title is a sentence, not a title`)
  }
})

test('getChapter throws on an unknown id rather than returning undefined', () => {
  assert.equal(getChapter('prove-it').number, 5)
  assert.throws(() => getChapter('shape-it'), /Unknown methodology chapter id: shape-it/)
  assert.throws(() => getChapter(''), /Unknown methodology chapter id/)
})

test('chapterNeighbours returns null at both ends and never wraps', () => {
  const first = chapterNeighbours('bring-an-idea')
  assert.equal(first.previous, null)
  assert.equal(first.next?.id, 'design-it')

  const last = chapterNeighbours('decide-what-happens-next')
  assert.equal(last.next, null, 'chapter 6 wraps to chapter 1 — the guide never ends')
  assert.equal(last.previous?.id, 'prove-it')

  // The round trip: following `next` from the first chapter must reach every chapter exactly once.
  const walked: string[] = []
  let cursor = METHODOLOGY_CHAPTERS[0]!
  for (;;) {
    walked.push(cursor.id)
    const next = chapterNeighbours(cursor.id).next
    if (!next) break
    cursor = next
  }
  assert.deepEqual(
    walked,
    METHODOLOGY_CHAPTERS.map((chapter) => chapter.id)
  )

  assert.throws(() => chapterNeighbours('not-a-chapter'), /Unknown methodology chapter id/)
})

test('chaptersInPhase partitions the chapters — every one belongs to exactly one phase', () => {
  const grouped = METHODOLOGY_PHASES.flatMap((phase) => chaptersInPhase(phase.id))
  assert.deepEqual(
    grouped.map((chapter) => chapter.id),
    METHODOLOGY_CHAPTERS.map((chapter) => chapter.id)
  )
  assert.deepEqual(
    chaptersInPhase('consider').map((c) => c.number),
    [1, 2, 3]
  )
  assert.deepEqual(
    chaptersInPhase('operate').map((c) => c.number),
    [4, 5]
  )
  assert.deepEqual(
    chaptersInPhase('exit').map((c) => c.number),
    [6]
  )
})

// Epic D8. The agent block carries a prompt and nothing else — the TYPE makes a stray `body`
// unrepresentable, so what is left to assert is that the prompt is real and that it is a plain
// string rather than something with markup a reader's agent would receive.
test('every agent block carries a non-empty plain prompt, and every chapter that has one has one', () => {
  const agentBlocks = METHODOLOGY_CHAPTERS.flatMap((chapter) =>
    chapter.blocks
      .filter((block) => block.kind === 'work' && block.variant === 'agent')
      .map((block) => ({ chapter: chapter.id, block }))
  )
  assert.ok(agentBlocks.length > 0, 'no chapter hands the reader a prompt at all')

  for (const { chapter, block } of agentBlocks) {
    assert.ok(block.kind === 'work' && block.variant === 'agent')
    const prompt = block.prompt
    assert.ok(prompt.trim().length > 0, `${chapter}'s agent prompt is empty`)
    assert.ok(!/<[a-z/]/i.test(prompt), `${chapter}'s agent prompt contains markup`)
    // The prompt is copied verbatim into someone else's model. Leading or trailing whitespace is
    // what `CopyPromptCard` trims; interior placeholders are deliberate and must survive.
    assert.equal(prompt, prompt.trim(), `${chapter}'s agent prompt has surrounding whitespace`)
  }
})

test('every work variant has a label, and no label is written down twice', () => {
  const variants: WorkVariant[] = ['do', 'agent', 'look', 'yours', 'learned']
  assert.deepEqual(Object.keys(WORK_LABELS).sort(), [...variants].sort())

  const labels = Object.values(WORK_LABELS)
  assert.equal(new Set(labels).size, labels.length, 'two variants share a label')
  for (const label of labels) assert.ok(label.length > 0)

  // Every variant used in the content is one the label map knows about. A variant with no label
  // would render an unlabelled card, which is the taxonomy silently losing a member.
  for (const chapter of METHODOLOGY_CHAPTERS) {
    for (const block of chapter.blocks) {
      if (block.kind !== 'work') continue
      assert.ok(
        Object.hasOwn(WORK_LABELS, block.variant),
        `${chapter.id} uses work variant "${block.variant}" with no label`
      )
    }
  }
})

test('no chapter is a stub — every one carries real blocks and a summary', () => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    assert.ok(chapter.blocks.length >= 5, `${chapter.id} has almost no content`)
    assert.ok(chapter.summary.length > 0, `${chapter.id} has no summary for its index card`)
    assert.ok(
      chapter.blocks.some((block) => block.kind === 'work' && block.variant === 'learned'),
      `${chapter.id} never tells the reader what they just learned`
    )
  }
})
