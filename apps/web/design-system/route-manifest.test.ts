// The manifest's welds. Every assertion here exists because the manifest is a hand-written list,
// and a hand-written list of routes goes stale the first time somebody adds a page.
//
// So none of these trusts the list. They check it against the filesystem, against
// `PROJECT_ROUTE_INVENTORY`, and against the approved state ids — the three things it claims to
// agree with.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATE_IDS } from './approved-states.mjs'
import { PROJECT_ROUTE_INVENTORY } from '../lib/project-route-inventory.ts'
import { OUT_OF_SCOPE_PAGES, ROUTE_MANIFEST, coverage, liveRows, type Sprint } from './route-manifest.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(HERE, '..', 'app')

/**
 * Every `page.tsx` under `apps/web/app`, relative to it. The real route set.
 *
 * The walk returns ABSOLUTE paths and the caller relativises once. The first version relativised
 * inside the recursion, so every level re-relativised paths that were already relative and produced
 * `../../../../app/keys/[projectSlug]/page.tsx`. The test caught it immediately — which is the
 * argument for a fixture that reads the real filesystem rather than a list someone typed.
 */
function walkPages(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return walkPages(path)
    // Every extension Next's App Router accepts for a page, not just the one this repo uses today
    // (fresh reviewer). A `page.jsx` would otherwise be a route the manifest weld cannot see — and
    // "the manifest and the repository agree" is the assertion this whole file exists for.
    return /^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name) ? [path] : []
  })
}

function pageFiles(): string[] {
  return walkPages(APP_DIR)
    .map((path) => relative(APP_DIR, path))
    .sort()
}

test('the manifest and the repository agree about which routes exist', () => {
  // ⚠️ THE assertion this file exists for. A manifest that lists routes nobody maintains is how the
  // last epic ended up measuring one route of twenty-nine and not knowing it.
  const onDisk = new Set(pageFiles())
  const claimed = new Set(ROUTE_MANIFEST.map((row) => row.page))
  const outOfScope = new Set(OUT_OF_SCOPE_PAGES.map((entry) => entry.page))

  const unaccounted = [...onDisk].filter((page) => !claimed.has(page) && !outOfScope.has(page))
  assert.deepEqual(
    unaccounted,
    [],
    'these routes exist and are in neither the manifest nor OUT_OF_SCOPE_PAGES — a route with no ' +
      'coverage obligation is a route nobody has to make look right'
  )

  // ...and the other direction, in BOTH directions, which is the part that took a review round.
  //
  // A manifest row for a route that does not exist is a row that can never go green, quietly
  // lowering the percentage for a reason nobody can find. One row legitimately has no page yet —
  // `/app/scheduled`, added by Story 4.3 — and the first version of this test permitted it with
  // `landsIn <= 1`.
  //
  // ⚠️ **That comparison rots** (cross-family review, vibe). It is true today and stops being true
  // the day Sprint 2 opens: after Sprint 4 merges, a row with `landsIn: 4` and no page would still
  // have been permitted, so the assertion would silently stop asserting — the exact defect class
  // this epic exists to kill, in the test written to kill it.
  //
  // `notYetBuilt` replaces it, and is checked BOTH ways so it cannot be left behind: a row that
  // declares it must have no file, and a row that does not must have one. Neither needs to know
  // what day it is.
  const phantom = ROUTE_MANIFEST.filter((row) => !onDisk.has(row.page) && row.notYetBuilt !== true)
  assert.deepEqual(
    phantom.map((row) => row.route),
    [],
    'a manifest row points at a page.tsx that does not exist, and is not marked notYetBuilt'
  )

  const stale = ROUTE_MANIFEST.filter((row) => onDisk.has(row.page) && row.notYetBuilt === true)
  assert.deepEqual(
    stale.map((row) => row.route),
    [],
    'this route now exists — clear `notYetBuilt` on its manifest row, or the exemption outlives ' +
      'the reason for it and the next missing page goes unnoticed'
  )
})

test('every reference state is one of the 32 approved ids', () => {
  // "Adding a state without an approval line is the thing Rail 2 forbids." The inverse matters
  // just as much: citing a state id that was never approved gives a route a contract nobody agreed
  // to, and it fails as a typo rather than as a decision.
  const approved = new Set(STATE_IDS)
  for (const row of ROUTE_MANIFEST) {
    if (row.referenceState === null) continue
    assert.ok(
      approved.has(row.referenceState),
      `${row.route} cites "${row.referenceState}", which is not an approved state id`
    )
  }
})

test('the approved state list and APPROVED.md still describe the same 32 states', () => {
  // The weld between the code and the approval record. `APPROVED.md` lists the states in its batch
  // table; `approved-states.mjs` is what actually renders. Two lists that must agree get a test,
  // not a shared belief that they do.
  // ⚠️ Scoped to the BATCH TABLE, not the whole document (fresh reviewer). Matching any backticked
  // token anywhere meant an incidental mention — `today` in a sentence, a filename, a hash — counted
  // as an approval line, so the weld would have accepted a state nobody approved as long as the word
  // appeared somewhere in the file. The batch table IS the approval record; the rest is prose about
  // it.
  const approvedDoc = readFileSync(join(HERE, 'APPROVED.md'), 'utf8')
  const batchTable = approvedDoc.slice(
    approvedDoc.indexOf('| Batch | States | Approved |'),
    approvedDoc.indexOf('## Design decisions settled at approval')
  )
  assert.ok(batchTable.length > 200, 'APPROVED.md no longer contains the batch table')
  const documented = new Set([...batchTable.matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]))
  for (const id of STATE_IDS) {
    assert.ok(documented.has(id), `state "${id}" renders but has no approval line in APPROVED.md`)
  }
  assert.equal(STATE_IDS.length, 32, 'the approved set is 32 states — see APPROVED.md')
})

test('every navigable surface in the inventory has a manifest row', () => {
  // The "no second list" weld (epic D5-b). The inventory is the source of truth for what a member
  // can navigate to; this asserts that nothing can enter the navigation without also entering the
  // coverage denominator. A new nav surface with no reference state must make the manifest RED, not
  // silently reduce the percentage by one route nobody notices.
  const rows = new Set(ROUTE_MANIFEST.map((row) => row.surface).filter(Boolean))
  for (const { routeSegment: surface } of PROJECT_ROUTE_INVENTORY) {
    assert.ok(
      rows.has(surface),
      `"${surface}" is in PROJECT_ROUTE_INVENTORY and has no row in the design coverage manifest`
    )
  }
})

test('the denominator moves exactly as the D13 ledger says', () => {
  // 29 today; Story 4.5 retires three credential routes and Story 4.3 adds Scheduled changes.
  // Written as an assertion because "29" is quoted in four documents and a number in a document is
  // what this epic exists to stop trusting.
  const beforeSprint4 = liveRows(3)
  const atClose = liveRows(6)

  assert.equal(beforeSprint4.length, 30, 'every row is live before Story 4.5 retires three')
  assert.equal(atClose.length, 27, 'after Story 4.5: 30 rows minus the three retired')

  // ...and the row that does not exist yet is the one Daniel approved as a designed empty state.
  const scheduled = ROUTE_MANIFEST.find((row) => row.route === '/app/scheduled/[projectSlug]')
  assert.ok(scheduled, 'the Scheduled changes route is in the manifest')
  assert.equal(scheduled.landsIn, 4)

  const retired = ROUTE_MANIFEST.filter((row) => row.retiresIn !== null).map((row) => row.route)
  assert.deepEqual(retired.sort(), [
    '/app/agent-keys/[projectSlug]',
    '/app/flag-credentials/[projectSlug]',
    '/app/keys/[projectSlug]',
  ])
})

test('coverage counts a route only when BOTH booleans are true', () => {
  // A route with an approved picture of itself and no relationship to it is not covered. Counting
  // it would make the number measure intent rather than product, which is the failure the epic is
  // named after.
  const now = coverage(1)
  assert.equal(now.total, 30)
  assert.ok(now.hasReferenceState > now.complete, 'reference states exist ahead of the work')
  assert.equal(now.outstanding.length, now.total - now.complete)

  // ⚠️ **This used to assert `complete === 0`, "nothing renders from design-system/ in Sprint 1".**
  // It was never testing what its message said. `coverage(sprint)` filters by `retiresIn` — which
  // rows are LIVE at that sprint — and not by `landsIn`, so the number it returns is a fact about
  // the CODE at every argument: the moment Story 4.1 shipped, `coverage(1)` read 1 and this went
  // red on a correct build. The zero was a coincidence of nothing having landed yet, dressed as an
  // invariant.
  //
  // Two invariants replace it, and both survive every sprint. Deliberately NOT "no row past sprint
  // N claims coverage": N would be a number somebody types once per sprint and forgets, which is
  // the shape this epic exists to stop trusting.
  for (const row of ROUTE_MANIFEST) {
    if (!row.rendersFromDesignSystem) continue
    // 1. A page that does not exist cannot render from anything. This is the one that could
    //    actually be got wrong — `notYetBuilt` and this boolean are set by different hands.
    assert.equal(
      row.notYetBuilt,
      undefined,
      `${row.route} claims to render from design-system/ and its page.tsx does not exist yet`
    )
    // 2. ...and a route claiming the system with no approved state to be measured against is
    //    coverage of nothing. `coverage()` already refuses to COUNT it; this says it out loud, so
    //    the manifest cannot carry a claim nobody could ever check.
    assert.notEqual(
      row.referenceState,
      null,
      `${row.route} claims to render from design-system/ with no approved reference state`
    )
  }
})

test('a deferred row carries an owner and a date that has not passed', () => {
  // The last epic shipped five deferred rows at birth, each with a reason and none with an owner or
  // a date, so there was nothing to expire and nobody to ask. A deferral with no end is an
  // exemption wearing an apology.
  const today = new Date().toISOString().slice(0, 10)
  for (const row of ROUTE_MANIFEST) {
    if (row.deferred === null) continue
    assert.ok(row.deferred.owner.length > 0, `${row.route} is deferred with no owner`)
    assert.match(row.deferred.until, /^\d{4}-\d{2}-\d{2}$/, `${row.route}'s decay date is not a date`)
    assert.ok(
      row.deferred.until >= today,
      `${row.route}'s deferral expired on ${row.deferred.until} — close it or re-decide it with ${row.deferred.owner}`
    )
    assert.ok(row.deferred.why.length > 20, `${row.route} is deferred without a real reason`)
  }
})

test('every row names a seam, and the seam matches the frame', () => {
  // D6: one flag, two seams. `ProductShell` covers the console; `design-system/Frame.tsx` covers the
  // nine routes outside it. A row that claimed `product-shell` for `/login` would describe a
  // rollback that does not reach it.
  for (const row of ROUTE_MANIFEST) {
    if (row.frame === 'console') {
      assert.equal(row.seam, 'product-shell', `${row.route} renders in the console frame`)
      assert.ok(row.page.startsWith('app/'), `${row.route} is a console route`)
    } else {
      assert.equal(row.seam, 'frame', `${row.route} does not render through ProductShell`)
      assert.equal(row.page.startsWith('app/'), false, `${row.route} is not under /app`)
    }
  }

  const bySeam = (seam: string) => liveRows(3).filter((row) => row.seam === seam).length
  assert.equal(bySeam('product-shell'), 21, 'seam A: the 20 console routes today, plus Scheduled')
  assert.equal(bySeam('frame'), 9, 'seam B: four hub routes and five doors')
})

test('a sprint number is a sprint that exists, and a route lands before it retires', () => {
  const sprints: Sprint[] = [1, 2, 3, 4, 5, 6]
  for (const row of ROUTE_MANIFEST) {
    assert.ok(sprints.includes(row.landsIn), `${row.route} lands in sprint ${row.landsIn}`)
    if (row.retiresIn === null) continue
    assert.ok(sprints.includes(row.retiresIn), `${row.route} retires in sprint ${row.retiresIn}`)
    assert.ok(
      row.retiresIn >= row.landsIn,
      `${row.route} retires before it lands, which is a row nobody will ever build`
    )
  }
})
