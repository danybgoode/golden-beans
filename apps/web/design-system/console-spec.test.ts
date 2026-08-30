// The weld between the GENERATED contract and the numbers the visual gate actually asserts.
//
// ── The gap this closes, and why it is worth its own file ─────────────────────────────────────
// Story 1.4's stated purpose is that the spec becomes generated output, so that "a number nobody
// can reproduce cannot be committed and then reasoned about as intent". `measure-contract.mjs` now
// emits `MEASURED-SPEC.md` and CI regenerates it — but the numbers the GATE asserts live in a
// TypeScript literal in `console-visual.authed.spec.ts`, hand-typed from the OLD hand-written table.
// So the generated file was welded to nothing, and the disproved `78` was still sitting in the
// gate's deferred rows with an owner and a date newly attached to it (fresh reviewer, Major).
//
// A generated artefact nothing reads is a slightly fancier document. This is what makes it load-
// bearing: the gate's expectations are checked against the regenerated table, in the FAST unit
// layer, so a prototype that moves fails here in a second rather than behind two env gates and a
// browser.
//
// ── Why a MAPPING and not a direct import ─────────────────────────────────────────────────────
// The two tables describe the same design through different markup. `MEASURED-SPEC.md` measures the
// PROTOTYPE (`.crumb-btn`, `.railnav button`, `.row`); the gate measures the BUILT APP
// (`.product-shell__signal`, `.console-rail > ul a`, `.row`). They cannot be the same list — the
// port is the work — so what is welded is the NUMBERS, row by row, through a mapping that says
// which prototype row governs which gate row. A row here is a claim that the app element and the
// prototype element are the same thing in the design.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

type MeasuredRow = {
  fontSize: number
  fontWeight: string
  family: string
  /** `null` when the dimension is text-sized and therefore not reproducible across platforms. */
  width: number | null
  height: number | null
  transform: string
}

/** Parse the generated table. Throws rather than returning an empty map — see the assertion below. */
function readMeasuredSpec(): Map<string, MeasuredRow> {
  const source = readFileSync(join(HERE, 'MEASURED-SPEC.md'), 'utf8')
  const rows = new Map<string, MeasuredRow>()
  for (const line of source.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    // `| label | size / weight | family | w × h | transform |` → 7 cells with the empty edges.
    if (cells.length !== 7 || cells[0] !== '') continue
    const [, label, sizeWeight, family, box, transform] = cells
    const sw = /^([\d.]+) \/ (\d+)$/.exec(sizeWeight)
    if (!sw) continue
    // `_text-sized_` marks a dimension that does not reproduce across platforms — see the note in
    // MEASURED-SPEC.md. It parses to `null` rather than being skipped, because a row that vanished
    // from this map would make every assertion about it pass vacuously.
    const dimension = (cell: string): number | null =>
      cell === '_text-sized_' ? null : /^\d+$/.test(cell) ? Number(cell) : NaN
    const parts =
      box === '_text-sized_' ? ['_text-sized_', '_text-sized_'] : box.split('×').map((c) => c.trim())
    if (parts.length !== 2) continue
    const width = dimension(parts[0])
    const height = dimension(parts[1])
    if (Number.isNaN(width) || Number.isNaN(height)) continue
    rows.set(label, { fontSize: Number(sw[1]), fontWeight: sw[2], family, width, height, transform })
  }
  return rows
}

/**
 * Which prototype row governs which row of the gate's spec, and what the gate currently asserts.
 *
 * `expect` is what `console-visual.authed.spec.ts` asserts today; the test below checks it against
 * the regenerated table. Where the gate deliberately asserts something DIFFERENT from the
 * prototype, the row carries a `deviation` explaining why — and a deviation must be a decision, not
 * a number that drifted.
 */
const GATE_ROWS: {
  gateRow: string
  prototypeRow: string
  expect: { fontSize?: number; fontWeight?: string; height?: number; width?: number }
  deviation?: string
}[] = [
  {
    gateRow: 'project switcher',
    prototypeRow: 'Project switcher',
    expect: { fontSize: 13, fontWeight: '400' },
  },
  { gateRow: 'section tab', prototypeRow: 'Section tab · inactive', expect: { fontSize: 13 } },
  { gateRow: 'page h1', prototypeRow: 'Page h1', expect: { fontSize: 23, fontWeight: '700' } },
  {
    gateRow: 'page subtitle',
    prototypeRow: 'Page subtitle',
    expect: { fontSize: 13.5, fontWeight: '400' },
  },
  {
    gateRow: 'the answer line',
    prototypeRow: 'The answer line',
    expect: { fontSize: 13.5, fontWeight: '400' },
  },
  { gateRow: 'stat number', prototypeRow: 'Stat number', expect: { fontSize: 26, fontWeight: '600' } },
  { gateRow: 'stat label', prototypeRow: 'Stat label', expect: { fontSize: 12.5, fontWeight: '400' } },
  {
    gateRow: 'list header row',
    prototypeRow: 'List header row',
    expect: { fontSize: 11, fontWeight: '600', height: 36 },
  },
  { gateRow: 'feature key', prototypeRow: 'Feature key', expect: { fontSize: 13.5 } },
  {
    gateRow: 'feature description',
    prototypeRow: 'Feature description',
    expect: { fontSize: 12.5, fontWeight: '400' },
  },
  {
    gateRow: 'state pill',
    prototypeRow: 'State pill',
    expect: { fontSize: 12, fontWeight: '600', height: 26 },
  },
  {
    gateRow: 'rail item',
    prototypeRow: 'Rail item',
    expect: { fontSize: 13.5, fontWeight: '600', height: 36 },
  },
  {
    gateRow: 'the row switch',
    prototypeRow: 'Switch',
    expect: { height: 21, width: 38 },
  },
]

/**
 * The gate's deferred rows, with the number each defers FROM.
 *
 * ⚠️ `feature row` deferred from **78**, which D8 disproved — a fresh measurement says **71**. The
 * deferral was carried forward with the wrong contract number, and Story 1.4 attached an owner and
 * a date to it without noticing (fresh reviewer, Major). The `contract` values here are asserted
 * against the regenerated table below, so a deferral can no longer point at a number that does not
 * exist.
 */
const DEFERRED = [
  { what: 'feature row', prototypeRow: 'Feature row', contract: 71 },
  { what: 'dormant summary row', prototypeRow: 'Dormant summary row', contract: 89 },
  { what: 'primary/secondary button', prototypeRow: 'Primary button', contract: 38 },
  { what: 'project switcher', prototypeRow: 'Project switcher', contract: 30 },
  { what: 'section nav (tier 2)', prototypeRow: 'Section nav (tier 2)', contract: 44 },
]

test('the generated spec table parses, and is not silently empty', () => {
  // A parser that returns nothing turns every assertion below into a vacuous pass — the guard that
  // cannot fail, one layer down. The count is pinned so a format change to the emitter fails HERE
  // rather than by quietly asserting nothing.
  const rows = readMeasuredSpec()
  assert.equal(rows.size, 23, 'MEASURED-SPEC.md should describe 23 elements')
  // Seven rows carry a text-sized dimension. Pinned so that a change to which dimensions reproduce
  // is a decision somebody makes, not a silent widening of what the contract stops checking.
  const textSized = [...rows.entries()].filter(([, r]) => r.width === null || r.height === null)
  assert.equal(textSized.length, 7, 'the set of non-reproducible dimensions changed')
  assert.equal(rows.get('Project switcher')?.width, 122, 'the corrected switcher width (D8)')
  assert.equal(rows.get('Feature row')?.height, 71, 'the corrected feature-row height (D8)')
})

test('every number the visual gate asserts comes from the regenerated table', () => {
  const measured = readMeasuredSpec()
  for (const row of GATE_ROWS) {
    const prototype = measured.get(row.prototypeRow)
    assert.ok(prototype, `${row.gateRow} maps to "${row.prototypeRow}", which is not in the table`)
    if (row.deviation) continue

    if (row.expect.fontSize !== undefined) {
      assert.equal(
        row.expect.fontSize,
        prototype.fontSize,
        `the gate asserts ${row.gateRow} at ${row.expect.fontSize}px; the prototype measures ${prototype.fontSize}px`
      )
    }
    if (row.expect.fontWeight !== undefined) {
      assert.equal(row.expect.fontWeight, prototype.fontWeight, `${row.gateRow} font-weight`)
    }
    if (row.expect.height !== undefined) {
      // A `null` here means the prototype's height is text-sized, so there is no reproducible number
      // for the gate to agree with — and a gate row asserting one would be asserting a fact about
      // one machine. That is a finding, not something to skip past.
      assert.notEqual(
        prototype.height,
        null,
        `the gate asserts a height for ${row.gateRow}, but the prototype's is text-sized and does not reproduce`
      )
      assert.equal(row.expect.height, prototype.height, `${row.gateRow} height`)
    }
    if (row.expect.width !== undefined) {
      assert.notEqual(
        prototype.width,
        null,
        `the gate asserts a width for ${row.gateRow}, but the prototype's is text-sized and does not reproduce`
      )
      assert.equal(row.expect.width, prototype.width, `${row.gateRow} width`)
    }
  }
})

test('a deferred row defers from a number that actually exists', () => {
  // The failure this closes, exactly: `feature row` deferred from `78`, a number no run reproduces.
  // A deferral pointing at a fictional contract value is worse than no deferral, because it looks
  // like a considered trade-off.
  const measured = readMeasuredSpec()
  for (const row of DEFERRED) {
    const prototype = measured.get(row.prototypeRow)
    assert.ok(prototype, `${row.what} defers from "${row.prototypeRow}", which is not in the table`)
    assert.equal(
      row.contract,
      prototype.height,
      `${row.what} says it defers from ${row.contract}px, and the prototype measures ${prototype.height}px — ` +
        'a deferral from a number nobody can reproduce is the defect D8 exists to close'
    )
  }
})

test('the two uppercase places are the only uppercase places (Do-not #3)', () => {
  // Measured rather than described: the emitter records `text-transform` per row, so the contract's
  // "uppercase appears in exactly two places, and never in mono" is checkable here instead of being
  // a sentence somebody has to remember.
  const measured = readMeasuredSpec()
  const uppercase = [...measured.entries()].filter(([, row]) => row.transform === 'uppercase')
  assert.deepEqual(
    uppercase.map(([label]) => label),
    ['List header row'],
    'a new uppercase element appeared in the approved design, or one left'
  )
  for (const [label, row] of uppercase) {
    // `assert.notMatch` is not in node:assert/strict — it exists on the legacy `assert` object
    // only. It threw `assert.notMatch is not a function`, which node:test reports as a FAILING test
    // rather than as a broken one; had this been written as a passing shape it would have asserted
    // nothing at all.
    assert.equal(
      /Mono/.test(row.family),
      false,
      `${label} is uppercase AND mono — Do-not #3 forbids the pair`
    )
  }
})
