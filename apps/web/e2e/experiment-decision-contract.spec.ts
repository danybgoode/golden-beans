import { expect, test } from '@playwright/test'
import type { ExperimentAnalysisResult } from '@/lib/experiment-analysis'
import {
  ExperimentDecisionResourceLimitError,
  mapExperimentDecisionRows,
  parseExperimentDecisionCommand,
  prepareExperimentDecisionSnapshot,
  type ExperimentDecisionRow,
} from '@/lib/experiment-decision-contract'
import type { ExperimentDefinition } from '@/lib/experiment-definition'

const DEFINITION: ExperimentDefinition = {
  hypothesis: 'A clearer promise increases completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: { description: 'Consented applicants.', tags: { region: 'mx' } },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'new-copy', weight: 1 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'application_completed', direction: 'increase' },
  guardrailMetrics: [],
  segmentFields: ['region'],
  plannedWindow: {
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-08-01T00:00:00.000Z',
  },
  minimumSamplePerVariant: 10,
}

const SNAPSHOT = {
  decisionReady: true,
  integrityReady: true,
  blockers: [],
  diagnostics: { srm: { status: 'clear' }, integrity: [] },
  primaryMetric: { event: 'application_completed' },
  guardrailMetrics: [],
} as unknown as ExperimentAnalysisResult

function row(overrides: Partial<ExperimentDecisionRow> = {}): ExperimentDecisionRow {
  return {
    id: crypto.randomUUID(),
    ordinal: 1,
    definition_version: 1,
    record_kind: 'decision',
    outcome: 'ship_treatment',
    chosen_variant_key: 'new-copy',
    rationale: 'The declared metric improved without an integrity blocker.',
    analysis_snapshot: { ...SNAPSHOT },
    integrity_snapshot: {
      integrityReady: true,
      decisionReady: true,
      blockers: [],
      srm: { status: 'clear' },
      diagnostics: [],
    },
    actor_user_id: crypto.randomUUID(),
    created_at: '2026-08-01T00:00:00.000Z',
    supersedes_record_id: null,
    ...overrides,
  }
}

test('human command parser closes lifecycle, correction-chain, and chosen-variant states', () => {
  const initial = parseExperimentDecisionCommand({
    recordKind: 'decision',
    outcome: 'ship_treatment',
    chosenVariantKey: 'new-copy',
    rationale: '  Primary improved and trust checks are clear.  ',
    supersedesRecordId: null,
    idempotencyKey: crypto.randomUUID(),
  }, {
    definition: DEFINITION,
    lifecycle: 'stopped',
    currentDecisionId: null,
  })
  expect(initial).toMatchObject({
    ok: true,
    command: {
      recordKind: 'decision',
      outcome: 'ship_treatment',
      chosenVariantKey: 'new-copy',
      rationale: 'Primary improved and trust checks are clear.',
      supersedesRecordId: null,
    },
  })

  expect(parseExperimentDecisionCommand({
    recordKind: 'decision',
    outcome: 'ship_treatment',
    chosenVariantKey: 'control',
    rationale: 'Control is not a treatment.',
    supersedesRecordId: null,
    idempotencyKey: crypto.randomUUID(),
  }, {
    definition: DEFINITION,
    lifecycle: 'stopped',
    currentDecisionId: null,
  }).ok).toBe(false)

  const current = crypto.randomUUID()
  expect(parseExperimentDecisionCommand({
    recordKind: 'correction',
    outcome: 'inconclusive',
    chosenVariantKey: null,
    rationale: 'Late-arriving evidence changed the interpretation.',
    supersedesRecordId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  }, {
    definition: DEFINITION,
    lifecycle: 'decided',
    currentDecisionId: current,
  }).ok).toBe(false)

  expect(parseExperimentDecisionCommand({
    recordKind: 'correction',
    outcome: 'inconclusive',
    chosenVariantKey: null,
    rationale: 'Late-arriving evidence changed the interpretation.',
    supersedesRecordId: current,
    idempotencyKey: crypto.randomUUID(),
  }, {
    definition: DEFINITION,
    lifecycle: 'decided',
    currentDecisionId: current,
  }).ok).toBe(true)
})

test('server snapshot boundary rejects raw subject/tag payloads and oversized evidence', () => {
  const capturedAt = '2026-08-01T00:00:00.000Z'
  expect(prepareExperimentDecisionSnapshot(SNAPSHOT, capturedAt)).toMatchObject({
    contractVersion: 1,
    capturedAt,
    decisionReady: true,
    integrityReady: true,
  })
  expect(() => prepareExperimentDecisionSnapshot({
    ...SNAPSHOT,
    leaked: { subjectId: 'merchant-123' },
  } as unknown as ExperimentAnalysisResult, capturedAt)).toThrow(/raw event identity/)
  expect(() => prepareExperimentDecisionSnapshot({
    ...SNAPSHOT,
    leaked: { tags: { contact_email: 'private@example.test' } },
  } as unknown as ExperimentAnalysisResult, capturedAt)).toThrow(/raw event identity/)
  expect(() => prepareExperimentDecisionSnapshot({
    ...SNAPSHOT,
    oversized: 'x'.repeat(256 * 1024),
  } as unknown as ExperimentAnalysisResult, capturedAt)).toThrow(
    ExperimentDecisionResourceLimitError,
  )
})

test('shared read model exposes actor/time and current correction without idempotency or raw facts', () => {
  const first = row()
  const second = row({
    id: crypto.randomUUID(),
    ordinal: 2,
    record_kind: 'correction',
    outcome: 'inconclusive',
    chosen_variant_key: null,
    rationale: 'Late evidence made the result inconclusive.',
    supersedes_record_id: first.id,
    created_at: '2026-08-02T00:00:00.000Z',
  })
  const result = mapExperimentDecisionRows([second, first])
  expect(result).toMatchObject({
    state: 'decided',
    current: {
      id: second.id,
      ordinal: 2,
      outcome: 'inconclusive',
      actorUserId: second.actor_user_id,
      createdAt: second.created_at,
      definitionVersion: 1,
    },
  })
  expect(result.history.map((decision) => decision.ordinal)).toEqual([1, 2])
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('idempotency')
  expect(serialized).not.toContain('subjectId')
  expect(serialized).not.toContain('"tags"')
  expect(serialized).not.toContain('rollout')
  expect(serialized).not.toContain('flag')
})

test('shared read model fails closed before serializing cumulative decision evidence over its bound', () => {
  const payload = 'x'.repeat(235_000)
  const rows = Array.from({ length: 21 }, (_, index) => row({
    id: crypto.randomUUID(),
    ordinal: index + 1,
    record_kind: index === 0 ? 'decision' : 'correction',
    outcome: 'inconclusive',
    chosen_variant_key: null,
    supersedes_record_id: index === 0 ? null : '00000000-0000-4000-8000-000000000001',
    analysis_snapshot: { ...SNAPSHOT, boundedPayload: payload },
  }))
  expect(() => mapExperimentDecisionRows(rows)).toThrow(ExperimentDecisionResourceLimitError)
})
