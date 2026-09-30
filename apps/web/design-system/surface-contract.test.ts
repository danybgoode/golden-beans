import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseSurface } from '../../../scripts/lib/surface.mjs'
import { ALL_STATE_IDS } from './approved-states.mjs'
import { BLOCK_KINDS } from './state-contract-core.mjs'
import {
  approvalHash,
  checkApprovals,
  readSurfaces,
  specContract,
  surfaceEntry,
} from './surface-contract.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP = JSON.parse(readFileSync(join(HERE, 'surface.map.json'), 'utf8'))
const LIVE_APPROVED = readFileSync(join(HERE, 'APPROVED.md'), 'utf8')

const NEW_STATE =
  'state: orders-empty\nroute: /app/orders/[projectSlug]\n- head "Orders" action "Share  your SHOP"\n- empty "No orders yet"\n'
const TABLE_HEAD =
  '## Approved surfaces\n\n| State | File | SHA-256 (first 16) | Approved by | Approved |\n|---|---|---|---|---|\n'
const approved = (...rows: string[]) =>
  `# Approved\n\n${TABLE_HEAD}${rows.join('\n')}\n\n## Next section\n| not | a | row |\n`
const row = (state: string, file: string, hash: string) =>
  `| ${state} | \`${file}\` | \`${hash}\` | Daniel | 2026-09-30 |`

/** A temp `surfaces/` folder holding these files. */
function folder(files: Record<string, string>) {
  const dir = join(mkdtempSync(join(tmpdir(), 'surface-contract-')), 'surfaces')
  mkdirSync(dir)
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

const run = (files: Record<string, string>, approvedMd: string) =>
  specContract(folder(files), { approvedMd, map: MAP, kinds: BLOCK_KINDS, prototypeIds: ALL_STATE_IDS })

test('an approved surface becomes an entry with the exact bytes extractSignature would give', () => {
  const { entries, problems } = run(
    { 'orders-empty.surface': NEW_STATE },
    approved(row('orders-empty', 'surfaces/orders-empty.surface', approvalHash(NEW_STATE)))
  )
  assert.deepEqual(problems, [])
  assert.equal(
    JSON.stringify(entries),
    JSON.stringify({
      'orders-empty': {
        missing: false,
        blocks: [{ kind: 'head', action: 'share your shop' }, { kind: 'empty' }],
        disclosures: 0,
        annotations: 0,
        unknown: [],
        source: 'spec',
      },
    })
  )
})

test('approval refusals: no line, a changed file, a line for a missing file, a line twice, a wrong state', () => {
  const hash = approvalHash(NEW_STATE)
  const none = run({ 'orders-empty.surface': NEW_STATE }, approved())
  assert.equal(none.problems.length, 1)
  assert.match(none.problems[0], /`surfaces\/orders-empty\.surface` has no APPROVED\.md line/)
  assert.ok(
    none.problems[0].includes(`| orders-empty | \`surfaces/orders-empty.surface\` | \`${hash}\` |`),
    'prints the line it needs'
  )

  const edited = run(
    { 'orders-empty.surface': NEW_STATE.replace('No orders', 'Nothing') },
    approved(row('orders-empty', 'surfaces/orders-empty.surface', hash))
  )
  assert.equal(edited.problems.length, 1)
  assert.match(
    edited.problems[0],
    new RegExp(`hashes to \`[0-9a-f]{16}\` and its APPROVED\\.md line says \`${hash}\``)
  )

  const ghost = run({}, approved(row('gone', 'surfaces/gone.surface', hash)))
  assert.deepEqual(ghost.problems, ['APPROVED.md approves `surfaces/gone.surface`, which does not exist'])

  const twice = run(
    { 'orders-empty.surface': NEW_STATE },
    approved(
      row('orders-empty', 'surfaces/orders-empty.surface', hash),
      row('orders-empty', 'surfaces/orders-empty.surface', hash)
    )
  )
  assert.deepEqual(twice.problems, [
    'APPROVED.md approves `surfaces/orders-empty.surface` twice — one line per approved surface',
  ])

  const wrongState = run(
    { 'orders-empty.surface': NEW_STATE },
    approved(row('orders', 'surfaces/orders-empty.surface', hash))
  )
  assert.match(wrongState.problems.join('\n'), /approves `surfaces\/orders-empty\.surface` as `orders`/)

  assert.deepEqual(checkApprovals([], '# no section'), [
    'APPROVED.md has no `## Approved surfaces` section, so no surface can be approved',
  ])
})

test('one source per state id: a prototype id, two files with one id, a mis-named file', () => {
  const activity = 'state: ship-activity\nroute: /r\n- head\n'
  const dup = run(
    { 'ship-activity.surface': activity },
    approved(row('ship-activity', 'surfaces/ship-activity.surface', approvalHash(activity)))
  )
  assert.deepEqual(dup.entries, {})
  assert.deepEqual(dup.problems, [
    '`surfaces/ship-activity.surface`: `ship-activity` is already defined by the approved prototype — one source per state id',
  ])

  const a = 'state: orders-empty\nroute: /r\n- head\n'
  const b = 'state: orders-empty\nroute: /r\n- note\n'
  const two = run(
    { 'orders-empty.surface': a, 'orders-too.surface': b },
    approved(
      row('orders-empty', 'surfaces/orders-empty.surface', approvalHash(a)),
      row('orders-empty', 'surfaces/orders-too.surface', approvalHash(b))
    )
  )
  assert.deepEqual(Object.keys(two.entries), ['orders-empty'])
  assert.ok(
    two.problems.includes(
      '`surfaces/orders-too.surface`: `orders-empty` is defined by two surface files — one source per state id'
    )
  )
  assert.ok(two.problems.some((p) => p.includes('the file is named for its state')))
})

test('vocabulary refusals: a fact this repo does not record, a count left out, an unmapped kind', () => {
  const steps = parseSurface('state: s\nroute: /r\n- head\n- steps count 3', 's.surface')
  assert.throws(
    () => surfaceEntry(steps, MAP, BLOCK_KINDS),
    /^SurfaceError: s\.surface:4: `steps` does not record a `count` in this project/
  )
  assert.throws(
    () => surfaceEntry(steps, MAP, BLOCK_KINDS),
    (e: Error) => e.name === 'SurfaceError'
  )

  const tiles = parseSurface('state: s\nroute: /r\n- tiles', 's.surface')
  assert.throws(() => surfaceEntry(tiles, MAP, BLOCK_KINDS), /s\.surface:3: `tiles` needs a `count` here/)

  const unmapped = { kinds: { ...MAP.kinds } }
  delete unmapped.kinds.note
  const note = parseSurface('state: s\nroute: /r\n- note "x"', 's.surface')
  assert.throws(() => surfaceEntry(note, unmapped, BLOCK_KINDS), /maps no `note`/)
})

test('a file that does not parse is a problem reported with the rest, not a crash', () => {
  const bad = 'state: orders-empty\nroute: /r\n- lsit\n'
  const { problems } = run(
    { 'orders-empty.surface': bad },
    approved(row('orders-empty', 'surfaces/orders-empty.surface', approvalHash(bad)))
  )
  assert.deepEqual(problems, [
    'surfaces/orders-empty.surface:3: unknown kind `lsit` — did you mean `list`? Known kinds: head, answer, summary, tiles, toolbar, list, empty, card, steps, field, tabs, note.',
  ])
})

test('THE LIVE FOLDER: every surface in surfaces/ is approved exactly as it stands (D12, in the static job)', () => {
  // The same call `state-contract.mjs` makes, over the committed files — so the approval check runs without Chromium.
  const { problems } = specContract(join(HERE, 'surfaces'), {
    approvedMd: LIVE_APPROVED,
    map: MAP,
    kinds: BLOCK_KINDS,
    prototypeIds: ALL_STATE_IDS,
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(readSurfaces(join(HERE, 'no-such-folder')), [])
})
