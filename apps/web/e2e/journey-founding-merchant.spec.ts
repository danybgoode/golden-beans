import { expect, test } from '@playwright/test'
import {
  MIYAGI_FOUNDING_MERCHANT_EVENT_NAMES,
  MIYAGI_FOUNDING_MERCHANT_JOURNEY,
} from '@/lib/founding-merchant-journey'
import { parseJourneyDefinition } from '@/lib/journey-definition'
import { computeJourneyCohort, type JourneyCohortOptions } from '@/lib/journey-cohort'
import {
  projectJourneySubject,
  type JourneyProjectionEvent,
} from '@/lib/journey-projection'
import { fixturesDigest, lifecycleFixtures } from './_fixtures/merchant-lifecycle'

const FIXTURES_SHA256 = 'b53f300bdd967bfe21dadbc7543655ccf36f95d27e643625fbb68df5739f3671'
const SUBJECT_ID = '11111111-1111-4111-8111-111111111111'

function journeyFacts(): JourneyProjectionEvent[] {
  const stageFixtures = lifecycleFixtures.filter((fixture) =>
    MIYAGI_FOUNDING_MERCHANT_EVENT_NAMES.has(fixture.envelope.type ?? ''),
  )
  return stageFixtures.map((fixture, index) => ({
    id: fixture.envelope.id!,
    event: fixture.envelope.type!,
    tags: fixture.envelope.data?.tags ?? {},
    occurredAt: fixture.envelope.occurredAt!,
    // Receipt order is deliberately the reverse of lifecycle order. The projector must use the
    // source fact time and definition order, while freshness still reports the late receipt.
    createdAt: new Date(Date.UTC(2026, 7, 25, 0, stageFixtures.length - index)).toISOString(),
    subjectId: fixture.envelope.data?.subject?.id ?? '',
  }))
}

test.describe('Miyagi founding-merchant journey contract', () => {
  test('the two repos pin byte-identical lifecycle fixtures and the definition is valid', () => {
    expect(fixturesDigest()).toBe(FIXTURES_SHA256)
    expect(parseJourneyDefinition(MIYAGI_FOUNDING_MERCHANT_JOURNEY)).toEqual({
      ok: true,
      definition: MIYAGI_FOUNDING_MERCHANT_JOURNEY,
    })

    const fixtureEvents = lifecycleFixtures.map((fixture) => fixture.envelope.type)
    const stageEvents = MIYAGI_FOUNDING_MERCHANT_JOURNEY.stages.map((stage) => stage.event)
    expect(fixtureEvents).toHaveLength(14)
    expect(stageEvents).toHaveLength(13)
    expect(new Set(stageEvents).size).toBe(13)
    expect(stageEvents.every((event) => fixtureEvents.includes(event))).toBe(true)
    // Preview approval is a valid delivery signal, not a separate analytical lifecycle stage.
    expect(fixtureEvents).toContain('merchant.preview_approved')
    expect(stageEvents).not.toContain('merchant.preview_approved')
  })

  test('out-of-order and replayed contract facts converge on all 13 stages and 30-day retention', () => {
    const facts = journeyFacts()
    const replayedAndShuffled = [
      ...facts.slice().reverse(),
      facts[6],
      facts[6],
      facts[11],
    ]
    const projection = projectJourneySubject(
      MIYAGI_FOUNDING_MERCHANT_JOURNEY,
      SUBJECT_ID,
      replayedAndShuffled,
    )

    expect(projection.currentStage).toEqual({
      key: 'retained_30d',
      enteredAt: '2026-08-23T18:45:00.000Z',
    })
    expect(projection.history.map((stage) => stage.key)).toEqual(
      MIYAGI_FOUNDING_MERCHANT_JOURNEY.stages.map((stage) => stage.key),
    )
    expect(projection.history).toHaveLength(13)

    const options: JourneyCohortOptions = {
      definitionVersion: 1,
      from: '2026-07-22T00:00:00Z',
      to: '2026-07-23T00:00:00Z',
      asOf: '2026-08-25T23:59:59Z',
      timezone: 'UTC',
      staleAfterHours: 72,
      pageSize: 25,
    }
    const cohort = computeJourneyCohort(
      MIYAGI_FOUNDING_MERCHANT_JOURNEY,
      replayedAndShuffled,
      options,
    )
    expect(cohort.cohort.subjectCount).toBe(1)
    expect(cohort.stages.every((stage) => stage.satisfiedCount === 1)).toBe(true)
    expect(cohort.retention).toMatchObject({
      anchorStageKey: 'first_sale',
      stageKey: 'retained_30d',
      withinDays: 30,
      eligibleCount: 1,
      maturedCount: 1,
      metCount: 1,
      missedCount: 0,
      pendingCount: 0,
      rate: 1,
    })
    // The evaluator de-duplicates the three at-least-once replays by canonical event id.
    expect(cohort.diagnostics.relevantEventCount).toBe(13)
  })

  test('the shared fixture and journey contract carry no merchant PII or copied workflow state', () => {
    const serialized = JSON.stringify({
      journey: MIYAGI_FOUNDING_MERCHANT_JOURNEY,
      fixtures: lifecycleFixtures,
    }).toLowerCase()
    for (const forbidden of [
      'business_name',
      'contact_name',
      'phone',
      'email',
      'instagram',
      'whatsapp',
      'objection',
      'fit_note',
      'consent_body',
      'order_id',
      'payment_id',
      'product_id',
    ]) {
      expect(serialized, `${forbidden} must stay outside Golden Beans`).not.toContain(forbidden)
    }
    expect(serialized).toContain(SUBJECT_ID)
  })
})
