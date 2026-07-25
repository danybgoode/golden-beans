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
