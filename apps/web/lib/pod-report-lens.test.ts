import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyLens,
  lensPolicy,
  parseLens,
  POD_REPORT_LENSES,
  type LensableView,
  type PodReportLens,
} from './pod-report-lens.ts'

// The lens is the policy Sprint 3 hands to people outside the company. Its one non-negotiable
// property — a lens narrows DETAIL, never HONESTY — is asserted here across EVERY lens rather than
// against the one that happens to be interesting, because the lens most likely to be quietly
// flattered is the investor one and a test that only checks `team` would never notice.

function view(): LensableView {
  return {
    speed: [{ key: 'epic_lead_time', value: '7.1 d' }],
    composition: [{ key: 'authorship_2026-07', value: '91%' }],
    notInstrumented: [{ key: 'change_failure_rate', label: 'Change failure rate' }],
    caveats: ['Every number here is computed from real history.'],
    benchmarks: [{ id: 'dora-2025' }],
    source: { repo: 'medusa-bonsai', commits: 841 },
    maturity: {
      ladder: { title: 'Steps of AI Adoption', author: 'Boris Cherny', date: '2026-07-16' },
      verdict: { step: 1, stepLabel: 'Assisted', metCriteria: 4, totalCriteria: 7, notInstrumentedCount: 6 },
      rows: [
        {
          id: 'code_quality_enforcement',
          status: 'met',
          isProxy: true,
          proxyNote: 'A named CI check is a proxy, not proof.',
          evidence: { pointerType: 'ci_check', ref: 'guards', detail: '83 of 98 PRs' },
        },
      ],
      notInstrumented: [{ key: 'auto_mode_state' }],
    },
  }
}

test('parseLens refuses an unknown value instead of defaulting to the widest audience', () => {
  assert.equal(parseLens('investor'), 'investor')
  assert.equal(parseLens('team'), 'team')
  // Every one of these must be null. A lens that falls back to `team` on a typo hands internal
  // detail to whoever mistyped it.
  for (const bad of ['TEAM', 'admin', '', null, undefined, 7, {}, ['team']]) {
    assert.equal(parseLens(bad), null, `parseLens(${JSON.stringify(bad)}) must be null`)
  }
})

// ── The invariant, checked on every lens ──────────────────────────────────────────────────────
for (const lens of POD_REPORT_LENSES) {
  test(`the ${lens} lens keeps every not-instrumented row and caveat`, () => {
    const out = applyLens(view(), lens)
    assert.deepEqual(out.notInstrumented, view().notInstrumented)
    assert.deepEqual(out.caveats, view().caveats)
    assert.deepEqual(out.benchmarks, view().benchmarks)
  })

  test(`the ${lens} lens keeps the verdict's not-instrumented count beside the verdict`, () => {
    const out = applyLens(view(), lens)
    assert.ok(out.maturity?.verdict, `${lens} lost the verdict`)
    assert.equal(out.maturity!.verdict!.notInstrumentedCount, 6)
    // Story 2.4 names this explicitly for the investor lens, which is also the lens that hides the
    // rows — so the count must come from the verdict and not be inferred from the rows on screen.
    assert.deepEqual(out.maturity!.notInstrumented, view().maturity!.notInstrumented)
  })

  test(`the ${lens} lens never narrows the speed rows`, () => {
    assert.deepEqual(applyLens(view(), lens).speed, view().speed)
  })
}

test('the investor lens hides per-criterion rows and composition, and nothing else', () => {
  const out = applyLens(view(), 'investor')
  assert.deepEqual(out.maturity!.rows, [])
  assert.deepEqual(out.composition, [])
  // Still present: the verdict, its count, the gaps, the caveats. Asserted above; restated here so
  // this test reads as "hides these two, keeps the rest" rather than only "hides these two".
  assert.equal(out.maturity!.verdict!.step, 1)
  assert.equal(out.notInstrumented.length, 1)
})

test('the client lens withholds the evidence pointer but keeps the proxy note', () => {
  const out = applyLens(view(), 'client')
  const row = out.maturity!.rows[0]
  assert.equal(row.evidence, null)
  assert.equal(row.evidenceWithheld, true)
  // The claim must still arrive qualified. Dropping the pointer AND the proxy note would upgrade a
  // hedged statement into a bare one purely by changing who is reading it.
  assert.equal(row.proxyNote, 'A named CI check is a proxy, not proof.')
  assert.equal(row.status, 'met')
})

test('the team lens is the identity on detail', () => {
  const out = applyLens(view(), 'team')
  assert.deepEqual(out.composition, view().composition)
  assert.deepEqual(out.maturity!.rows, view().maturity!.rows)
  assert.deepEqual(out.source, view().source)
})

test('applyLens does not mutate the view it was given', () => {
  const original = view()
  applyLens(original, 'investor')
  assert.equal(original.composition.length, 1)
  assert.equal(original.maturity!.rows.length, 1)
  assert.notEqual(original.maturity!.rows[0].evidence, null)
})

test('an artifact with no maturity section survives every lens as null', () => {
  for (const lens of POD_REPORT_LENSES) {
    const out = applyLens({ ...view(), maturity: null }, lens)
    assert.equal(out.maturity, null)
    assert.equal(out.caveats.length, 1)
  }
})

test('every declared lens has a policy and an audience note', () => {
  for (const lens of POD_REPORT_LENSES) {
    const p = lensPolicy(lens as PodReportLens)
    assert.ok(p.audienceNote.length > 0, `${lens} has no audience note`)
    assert.equal(typeof p.showComposition, 'boolean')
  }
})
