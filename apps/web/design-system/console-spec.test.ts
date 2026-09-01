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
// (`.ds-shell-signal`, `.console-rail > ul a`, `.row`). They cannot be the same list — the
// port is the work — so what is welded is the NUMBERS, row by row, through a mapping that says
// which prototype row governs which gate row. A row here is a claim that the app element and the
// prototype element are the same thing in the design.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME_BUDGET_PX, MEASURED_SPEC, DEFERRED_SPEC_ROWS } from './console-gate-spec.ts'

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
/**
 * Which PROTOTYPE row governs which row of the gate's spec.
 *
 * ⚠️ This is the ONLY hand-written half, and deliberately so. The two tables describe the same
 * design through different markup — `MEASURED-SPEC.md` measures the prototype (`.crumb-btn`,
 * `.railnav button`), the gate measures the built app (`.ds-shell-signal`,
 * `.console-rail > ul a`) — and nothing can derive that correspondence. A row here is a claim that
 * an app element and a prototype element are the same thing in the design.
 *
 * The NUMBERS are not here. They are read from the real `MEASURED_SPEC`, imported above. An earlier
 * version retyped them, which meant this file checked its own copy and passed while the gate
 * carried a disproved value (fresh reviewer, round 2, proven by mutation).
 */
const GOVERNED_BY: Record<string, string> = {
  'project switcher': 'Project switcher',
  'section tab': 'Section tab · inactive',
  // The two chrome tiers, added by Story 3.2 — and the names on the right are what makes the gate
  // rows traceable: the numbers 54 and 44 come from the regenerated table, never from this file.
  'top bar (tier 1)': 'Top bar (tier 1)',
  'section nav (tier 2)': 'Section nav (tier 2)',
  'page h1': 'Page h1',
  'page subtitle': 'Page subtitle',
  'the answer line': 'The answer line',
  'stat number': 'Stat number',
  'stat label': 'Stat label',
  'list header row': 'List header row',
  'feature key': 'Feature key',
  'feature description': 'Feature description',
  'state pill': 'State pill',
  'rail item': 'Rail item',
  'the row switch': 'Switch',
  // Closed as a deferral by Story 4.1 and asserted here instead.
  'feature row': 'Feature row',
}

/** Which prototype row each DEFERRED row defers from. Same rule: mapping here, numbers imported. */
const DEFERRAL_GOVERNED_BY: Record<string, string> = {
  'dormant summary row': 'Dormant summary row',
  'primary/secondary button': 'Primary button',
  'project switcher': 'Project switcher',
}

test('the deferral mapping does not outlive the deferrals it maps', () => {
  // ⚠️ `GOVERNED_BY` has had a both-directions check since **Sprint 1** (#128, "a stale mapping reads
  // as coverage"); `DEFERRAL_GOVERNED_BY` never got the same one. (I first wrote "Sprint 2" here —
  // `git log -S` says #128. Checking my own citation because the last round caught three claims I
  // had asserted without re-deriving.) So when Story 3.2 built the second
  // tier, its mapping stayed behind pointing at a deferral that no longer exists, and every suite
  // stayed green — the same class the sibling check was written to prevent, in the sibling that
  // did not get it (fresh reviewer, Major).
  for (const what of Object.keys(DEFERRAL_GOVERNED_BY)) {
    assert.ok(
      DEFERRED_SPEC_ROWS.some((row) => row.what === what),
      `"${what}" is mapped as a deferral but nothing defers it any more — a stale mapping reads as coverage`
    )
  }
  for (const row of DEFERRED_SPEC_ROWS) {
    assert.ok(
      DEFERRAL_GOVERNED_BY[row.what],
      `"${row.what}" is deferred and no prototype row governs the number it defers from`
    )
  }
})

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

/**
 * The chrome table's rows — `| \`state\` | chrome | height | fits |`.
 *
 * Parsed rather than trusted, for the same reason the element table is: a constant the gate asserts
 * must be derived from a regenerated measurement, or it is a number somebody typed.
 */
function readChromeBudget(): { state: string; chrome: number | null; height: number }[] {
  const source = readFileSync(join(HERE, 'MEASURED-SPEC.md'), 'utf8')
  const rows: { state: string; chrome: number | null; height: number }[] = []
  for (const line of source.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length !== 6 || cells[0] !== '') continue
    const state = /^`([a-z-]+)`$/.exec(cells[1])?.[1]
    if (!state) continue
    if (!/^\d+$/.test(cells[3])) continue
    rows.push({
      state,
      chrome: /^\d+$/.test(cells[2]) ? Number(cells[2]) : null,
      height: Number(cells[3]),
    })
  }
  return rows
}

test("the chrome budget is the approved design's own maximum, not a number in a spec file", () => {
  const rows = readChromeBudget()
  // A parser that returns nothing makes every assertion below vacuous — the guard that cannot fail,
  // one layer down. Pinned to the state count so an emitter change fails HERE.
  assert.equal(rows.length, 32, 'the chrome table should describe all 32 approved states')

  const measured = rows.filter((row) => row.chrome !== null).map((row) => row.chrome as number)
  assert.ok(measured.length > 20, 'almost every console state should have a chrome measurement')
  const worst = Math.max(...measured)

  // ⚠️ **A BOUND, not an equality — and the equality is what went red on CI.** These are text-layout
  // positions: `ship-features` measures 458 on macOS and 459 on `ubuntu-latest`, and `today` 223 and
  // 202, because a lede wraps differently under different font metrics. Welding the constant to the
  // maximum byte for byte made a correct page fail on one platform.
  //
  // Both directions are still asserted, which is what keeps this derived rather than chosen:
  assert.ok(
    worst <= CHROME_BUDGET_PX,
    `the approved design's worst chrome is ${worst}px and CHROME_BUDGET_PX is ${CHROME_BUDGET_PX}px — ` +
      'the budget must be at least what the design itself spends, or the gate fails on a correct page'
  )
  assert.ok(
    CHROME_BUDGET_PX - worst <= 40,
    `CHROME_BUDGET_PX is ${CHROME_BUDGET_PX - worst}px above the design's worst case (${worst}px). ` +
      'A budget that drifts far above what the design spends stops being a budget — regenerate ' +
      'MEASURED-SPEC.md and bring the constant back down, never the other way round.'
  )
})

test('the no-scroll assertion this replaced was asserting a property the design does not have', () => {
  // ⚠️ **The evidence, kept in the suite rather than only in a commit message.** The gate required
  // every covered route to fit 1440x960 without scrolling. If the approved design met that, the
  // right fix would have been to make the pages fit — so this asserts the finding itself, and it
  // goes red the day the design changes enough to make the old rule reasonable again.
  const rows = readChromeBudget()
  const scrolling = rows.filter((row) => row.chrome !== null && row.height > 960)
  assert.ok(
    scrolling.length > 5,
    `only ${scrolling.length} approved console states scroll at 960px — if the design now mostly ` +
      'fits, revisit whether the chrome budget should go back to being a page-height assertion'
  )
  // Named, so the finding is legible rather than a count: `today` is the route this sprint builds
  // and the tallest approved state in the product.
  assert.ok(
    scrolling.some((row) => row.state === 'today'),
    'the approved `today` state no longer scrolls — the premise of CHROME_BUDGET_PX has changed'
  )
})

test('every number the visual gate asserts comes from the regenerated table', () => {
  const measured = readMeasuredSpec()

  // Every gate row must be mapped. An unmapped row is a number nothing checks — which is the state
  // this whole file exists to end.
  for (const row of MEASURED_SPEC) {
    assert.ok(GOVERNED_BY[row.what], `the gate asserts "${row.what}" and no prototype row governs it`)
  }
  for (const what of Object.keys(GOVERNED_BY)) {
    assert.ok(
      MEASURED_SPEC.some((row) => row.what === what),
      `"${what}" is mapped but the gate no longer asserts it — a stale mapping reads as coverage`
    )
  }

  for (const row of MEASURED_SPEC) {
    const prototype = measured.get(GOVERNED_BY[row.what])
    assert.ok(prototype, `"${row.what}" maps to a row that is not in the generated table`)

    if (row.fontSize !== undefined) {
      assert.equal(
        Number(row.fontSize.replace('px', '')),
        prototype.fontSize,
        `the gate asserts ${row.what} at ${row.fontSize}; the prototype measures ${prototype.fontSize}px`
      )
    }
    if (row.fontWeight !== undefined) {
      assert.equal(row.fontWeight, prototype.fontWeight, `${row.what} font-weight`)
    }
    if (row.height !== undefined) {
      assert.notEqual(
        prototype.height,
        null,
        `the gate asserts a height for ${row.what}, but the prototype's is text-sized and does not reproduce`
      )
      assert.equal(row.height, prototype.height, `${row.what} height`)
    }
    if (row.width !== undefined) {
      assert.notEqual(
        prototype.width,
        null,
        `the gate asserts a width for ${row.what}, but the prototype's is text-sized and does not reproduce`
      )
      assert.equal(row.width, prototype.width, `${row.what} width`)
    }
  }
})

test('a deferred row defers from a number that actually exists', () => {
  // The failure this closes, exactly: the gate deferred `feature row` from `78`, a number no run
  // reproduces. A deferral pointing at a fictional contract value is worse than no deferral,
  // because it looks like a considered trade-off.
  const measured = readMeasuredSpec()
  for (const row of DEFERRED_SPEC_ROWS) {
    const prototypeRow = DEFERRAL_GOVERNED_BY[row.what]
    assert.ok(prototypeRow, `"${row.what}" is deferred and no prototype row governs it`)
    const prototype = measured.get(prototypeRow)
    assert.ok(prototype, `"${row.what}" defers from "${prototypeRow}", which is not in the table`)
    assert.equal(
      row.contract,
      prototype.height,
      `${row.what} says it defers from ${row.contract}px, and the prototype measures ${prototype.height}px — ` +
        'a deferral from a number nobody can reproduce is the defect D8 exists to close'
    )
  }

  // ...and every deferred row still carries an owner and a date that has not passed. Asserted HERE
  // as well as in the Playwright spec, because this layer runs on every PR and that one runs behind
  // two env gates and a browser.
  const today = new Date().toISOString().slice(0, 10)
  for (const row of DEFERRED_SPEC_ROWS) {
    assert.ok(row.owner.length > 0, `${row.what} is deferred with no owner`)
    assert.match(row.until, /^\d{4}-\d{2}-\d{2}$/, `${row.what}'s decay date is not a date`)
    assert.ok(
      row.until >= today,
      `${row.what}'s deferral expired on ${row.until} — close it, or re-decide it with ${row.owner}`
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
