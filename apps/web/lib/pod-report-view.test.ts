import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPodReportView, isHonest } from './pod-report-view.ts'

// The renderer's honesty contract. The computation went to some trouble to attach caveats to every
// number that needs one; this layer is where they could quietly get dropped, and a dropped caveat
// turns a careful artifact into the speed-only vendor-ware the epic exists to avoid.

const artifact = {
  generatedAt: '2026-07-25T00:00:00.000Z',
  source: { repo: 'medusa-bonsai', commits: 839, windowDays: 49 },
  benchmarks: [{ id: 'dora-2025', label: 'DORA 2025', url: 'https://dora.dev/', note: 'cited' }],
  caveats: ['Every number is computed from real history.'],
  delivery: {
    cycleTime: {
      count: 98,
      medianHours: 0.16,
      comparableToDora: false,
      interpretation: 'Review-and-merge latency — NOT comparable to DORA change lead time.',
    },
    epicLeadTime: {
      count: 47,
      medianDays: 7.2,
      retroactivelyDocumented: 83,
      interpretation: 'Excludes 83 retro-documented epics.',
    },
    deployFrequency: { isProxy: true, proxyNote: 'Merged PRs per week — a proxy.', perWeek: 14 },
    epicThroughput: { shipped: 130, perWeek: 18.57 },
    authorship: [{ month: '2026-07', total: 497, agentCoAuthored: 453, agentShare: 0.911 }],
    notInstrumented: [
      {
        key: 'change_failure_rate',
        label: 'Change failure rate',
        reason: 'No rollback signal.',
        guardrail: 'Record deploy outcomes.',
      },
    ],
  },
}

test('a full artifact produces speed, composition, gaps and citations together', () => {
  const v = buildPodReportView(artifact)
  assert.equal(v.empty, false)
  assert.ok(v.speed.length >= 4)
  assert.equal(v.composition.length, 1)
  assert.equal(v.notInstrumented.length, 1)
  assert.equal(v.benchmarks.length, 1)
  assert.ok(v.caveats.length > 0)
})

test('sub-hour latency is formatted in MINUTES, so nobody misreads 0.16 as sixteen minutes', () => {
  const v = buildPodReportView(artifact)
  const row = v.speed.find((r) => r.key === 'review_latency')!
  assert.equal(row.value, '10 min')
})

test('review latency carries its disclaimer and is offered NO benchmark to be read against', () => {
  // The computation ruled it not-DORA-comparable. Attaching a benchmark here would quietly
  // reintroduce the comparison through the back door.
  const row = buildPodReportView(artifact).speed.find((r) => r.key === 'review_latency')!
  assert.match(row.interpretation!, /NOT comparable to DORA/i)
  assert.equal(row.benchmarkId, undefined)
})

test('the deploy-frequency proxy flag and note both survive into the view', () => {
  const row = buildPodReportView(artifact).speed.find((r) => r.key === 'deploy_frequency')!
  assert.equal(row.isProxy, true)
  assert.match(row.interpretation!, /proxy/i)
})

test('the epic lead-time exclusion note survives — the 83 excluded epics are not silently gone', () => {
  const row = buildPodReportView(artifact).speed.find((r) => r.key === 'epic_lead_time')!
  assert.match(row.interpretation!, /83/)
})

test('authorship is labelled a COMPOSITION fact, never a productivity claim', () => {
  const row = buildPodReportView(artifact).composition[0]
  assert.equal(row.value, '91%')
  assert.match(row.interpretation!, /not a measure of how much value/i)
})

test('a missing metric renders as NULL, so the page can say "not measured" instead of 0', () => {
  const v = buildPodReportView({
    ...artifact,
    delivery: { ...artifact.delivery, cycleTime: { count: 0, medianHours: null, interpretation: 'x' } },
  })
  assert.equal(v.speed.find((r) => r.key === 'review_latency')!.value, null)
})

test('a missing or malformed artifact yields an EMPTY view, never a zeroed one', () => {
  for (const bad of [null, undefined, {}, { generatedAt: 'x' }, 'nonsense', 42]) {
    const v = buildPodReportView(bad)
    assert.equal(v.empty, true, `expected empty for ${JSON.stringify(bad)}`)
    assert.deepEqual(v.notInstrumented, [])
    // And it must not throw — a broken payload is a render decision, not a crash.
  }
})

// ── isHonest: the refuse-to-render guard ────────────────────────────────────────────────────

test('an artifact with numbers AND its caveats is honest', () => {
  assert.equal(isHonest(buildPodReportView(artifact)), true)
})

test('numbers WITHOUT not-instrumented rows is dishonest — the page must refuse it', () => {
  // This is the failure the whole epic is designed against: speed rendered alone. If the caveats
  // are lost anywhere upstream, the page should decline to present the numbers rather than show a
  // flattering half-truth.
  const stripped = buildPodReportView({
    ...artifact,
    delivery: { ...artifact.delivery, notInstrumented: [] },
  })
  assert.equal(isHonest(stripped), false)
})

test('numbers without top-level caveats is also dishonest', () => {
  const stripped = buildPodReportView({ ...artifact, caveats: [] })
  assert.equal(isHonest(stripped), false)
})

test('an EMPTY view is honest — it claims nothing, so it cannot mislead', () => {
  assert.equal(isHonest(buildPodReportView(null)), true)
})

// ── Regressions from cross-review round 2 (PR #32) ──────────────────────────────────────────

test('a NON-OBJECT delivery payload is empty, not a report with nothing in it', () => {
  // `{ delivery: "invalid" }` is truthy, so a plain `!p.delivery` reported non-empty while every
  // metric resolved to null — a malformed payload slipping past the empty state.
  for (const bad of ['invalid', 42, true, ['a']]) {
    const v = buildPodReportView({ delivery: bad, caveats: ['x'] })
    assert.equal(v.empty, true, `expected empty for delivery=${JSON.stringify(bad)}`)
  }
  // …and a real delivery object is still non-empty.
  assert.equal(buildPodReportView(artifact).empty, false)
})

test('isHonest counts COMPOSITION numbers too, not just speed', () => {
  // The hole: a view whose speed rows are all null but whose composition carries real percentages
  // passed the guard with its caveats stripped. An authorship share shown without context is
  // precisely what this guard exists to prevent.
  const compositionOnly = buildPodReportView({
    generatedAt: 'x',
    caveats: [],
    delivery: {
      cycleTime: { medianHours: null },
      epicLeadTime: { medianDays: null },
      deployFrequency: {},
      epicThroughput: {},
      authorship: [{ month: '2026-07', agentShare: 0.911 }],
      notInstrumented: [],
    },
  })
  assert.equal(compositionOnly.empty, false)
  assert.ok(compositionOnly.composition.some((r) => r.value !== null))
  assert.equal(isHonest(compositionOnly), false, 'composition numbers without caveats must be refused')
})

// ── Sprint 2.5c — the maturity section (Story 2.4's output, finally given somewhere to land) ──

const ladder = { title: 'Steps of AI Adoption', author: 'Boris Cherny', date: '2026-07-16' }

const maturityArtifact = {
  ...artifact,
  maturity: {
    ladder,
    verdict: { step: 1, stepLabel: 'Assisted', metCriteria: 4, totalCriteria: 7, notInstrumentedCount: 6 },
    rows: [
      {
        id: 'code_quality_enforcement',
        criterion: 'Automatic code-quality enforcement',
        ladderStep: 2,
        status: 'met',
        isProxy: true,
        proxyNote: 'A named CI check is a proxy, not proof the check was strict.',
        evidence: { pointerType: 'ci_check', ref: 'guards', detail: '83 of 98 PRs' },
      },
      {
        id: 'agent_sandboxing',
        criterion: 'Agent sandboxing',
        ladderStep: 3,
        status: 'not_instrumented',
        evidence: null,
        reason: 'Never written into a commit or a PR.',
      },
    ],
    notInstrumented: [
      { key: 'auto_mode_state', label: 'Auto-mode state', reason: 'local setting', guardrail: 'OTel export' },
    ],
  },
}

test('the maturity section rides through with its ladder citation and verdict', () => {
  const m = buildPodReportView(maturityArtifact).maturity
  assert.ok(m)
  assert.equal(m!.verdict!.step, 1)
  assert.equal(m!.verdict!.stepLabel, 'Assisted')
  assert.equal(m!.ladder!.author, 'Boris Cherny')
  assert.equal(m!.rows.length, 2)
  assert.equal(m!.rows[0].proxyNote, 'A named CI check is a proxy, not proof the check was strict.')
})

test('an artifact with no maturity section reads as null, not as an empty score', () => {
  // An OLD artifact is immutable and genuinely predates the lens. "Scored nothing" and "was never
  // scored" must not render alike.
  assert.equal(buildPodReportView(artifact).maturity, null)
  assert.equal(buildPodReportView({ ...artifact, maturity: 'nope' }).maturity, null)
})

test('a MET row with no resolvable evidence pointer is downgraded, never rendered as a claim', () => {
  const broken = {
    ...maturityArtifact,
    maturity: {
      ...maturityArtifact.maturity,
      rows: [{ ...maturityArtifact.maturity.rows[0], evidence: null }],
    },
  }
  const row = buildPodReportView(broken).maturity!.rows[0]
  assert.equal(row.status, 'not_instrumented')
  assert.match(row.reason!, /no resolvable evidence pointer/)
})

test('the downgrade is toward the LESS flattering answer — the row is kept, not dropped', () => {
  // Dropping it would shrink the denominator and inflate the coverage the verdict reports.
  const broken = {
    ...maturityArtifact,
    maturity: {
      ...maturityArtifact.maturity,
      verdict: { ...maturityArtifact.maturity.verdict, notInstrumentedCount: 6 },
      rows: maturityArtifact.maturity.rows.map((r) => ({ ...r, evidence: null })),
    },
  }
  const m = buildPodReportView(broken).maturity!
  assert.equal(m.rows.length, 2, 'no row may disappear')
  assert.ok(m.rows.every((r) => r.status === 'not_instrumented'))
  assert.ok(m.verdict!.notInstrumentedCount >= 2)
})

test('a partial evidence pointer does not count as evidence', () => {
  for (const ev of [
    { pointerType: 'pr' },
    { ref: 92 },
    { pointerType: '', ref: 92 },
    { pointerType: 'pr', ref: '' },
  ]) {
    const broken = {
      ...maturityArtifact,
      maturity: {
        ...maturityArtifact.maturity,
        rows: [{ ...maturityArtifact.maturity.rows[0], evidence: ev }],
      },
    }
    assert.equal(
      buildPodReportView(broken).maturity!.rows[0].status,
      'not_instrumented',
      `evidence ${JSON.stringify(ev)} must not count`
    )
  }
})

test('isHonest refuses a verdict whose ladder is not version-pinned', () => {
  // A score floating free of the rubric it was scored against. An old report must stay
  // interpretable, which means title + author + date, not just a name.
  assert.equal(isHonest(buildPodReportView(maturityArtifact)), true)
  for (const partial of [
    { title: 'x', author: 'y' },
    { title: 'x', date: 'z' },
    { author: 'y', date: 'z' },
    {},
  ]) {
    const v = buildPodReportView({
      ...maturityArtifact,
      maturity: { ...maturityArtifact.maturity, ladder: partial },
    })
    assert.equal(isHonest(v), false, `ladder ${JSON.stringify(partial)} must be refused`)
  }
})

test('a maturity section with rows but NO verdict is honest — it claims nothing', () => {
  const v = buildPodReportView({
    ...maturityArtifact,
    maturity: { ...maturityArtifact.maturity, ladder: {}, verdict: null },
  })
  assert.equal(isHonest(v), true)
})

test('a downgraded row lowers metCriteria too — the verdict cannot outrun its own table', () => {
  // Cross-review round 3 (Agy, PR #33). notInstrumentedCount was recomputed after the
  // evidence-downgrade; metCriteria was copied. So one evidence-less `met` row produced a verdict
  // claiming more met criteria than the table below it showed, and metCriteria +
  // notInstrumentedCount could exceed totalCriteria. Both counts now describe the same rows.
  const broken = {
    ...maturityArtifact,
    maturity: {
      ...maturityArtifact.maturity,
      verdict: { step: 2, stepLabel: 'Adopted', metCriteria: 2, totalCriteria: 2, notInstrumentedCount: 0 },
      rows: [
        { ...maturityArtifact.maturity.rows[0], id: 'a', evidence: null },
        { ...maturityArtifact.maturity.rows[0], id: 'b' },
      ],
    },
  }
  const m = buildPodReportView(broken).maturity!
  const actuallyMet = m.rows.filter((r) => r.status === 'met').length
  assert.equal(actuallyMet, 1, 'the evidence-less row must have been downgraded')
  assert.equal(m.verdict!.metCriteria, 1, 'the verdict must agree with the table')
  assert.ok(
    m.verdict!.metCriteria + m.verdict!.notInstrumentedCount <= m.verdict!.totalCriteria,
    'the parts cannot exceed the whole'
  )
})

test('metCriteria can only be LOWERED, never raised above the artifact’s own claim', () => {
  // A stored verdict more conservative than its rows stays conservative: this layer's job is to
  // refuse flattery, not to award credit the computation declined to give.
  const modest = {
    ...maturityArtifact,
    maturity: {
      ...maturityArtifact.maturity,
      verdict: { step: 1, stepLabel: 'Assisted', metCriteria: 0, totalCriteria: 2, notInstrumentedCount: 1 },
    },
  }
  assert.equal(buildPodReportView(modest).maturity!.verdict!.metCriteria, 0)
})
