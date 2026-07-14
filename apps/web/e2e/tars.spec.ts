import { test, expect } from '@playwright/test'
import { computeTars, type TarsEvent, type TarsFeature } from '@/lib/tars'

// Story 2.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md) — TARS aggregation
// against a synthetic fixture event stream. Pure function, no network/DB — still runs
// under the `api` Playwright project per house convention (one spec per testable story).

const DAY_MS = 24 * 60 * 60 * 1000
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

const setupGuideFeature: TarsFeature = {
  enabled: true,
  targetEvent: 'setup_guide_viewed',
  adoptedEvent: 'setup_guide_step_completed',
  retainedEvent: 'setup_guide_share_tapped',
  retentionDays: 7,
}

// alice: viewed -> completed a step -> shared within the window -> fully retained.
// bob: viewed -> completed a step, but never shared -> adopted, not retained.
// carol: only ever viewed -> targeted, never adopted.
// dave: viewed -> completed -> shared, but 10 days later (outside a 7-day window) -> not retained.
const fixtureEvents: TarsEvent[] = [
  { userId: 'alice', event: 'setup_guide_viewed', createdAt: day(0) },
  { userId: 'alice', event: 'setup_guide_step_completed', createdAt: day(1) },
  { userId: 'alice', event: 'setup_guide_share_tapped', createdAt: day(3) },

  { userId: 'bob', event: 'setup_guide_viewed', createdAt: day(0) },
  { userId: 'bob', event: 'setup_guide_step_completed', createdAt: day(2) },

  { userId: 'carol', event: 'setup_guide_viewed', createdAt: day(0) },

  { userId: 'dave', event: 'setup_guide_viewed', createdAt: day(0) },
  { userId: 'dave', event: 'setup_guide_step_completed', createdAt: day(1) },
  { userId: 'dave', event: 'setup_guide_share_tapped', createdAt: day(10) },
]

test('computeTars: declared target/adopted/retained events produce a realistic narrowing funnel', () => {
  const result = computeTars(fixtureEvents, setupGuideFeature)
  expect(result).toEqual({ targeted: 4, adopted: 3, retained: 1 })
})

test('computeTars: Targeted is zeroed when the registry declares the feature disabled', () => {
  const result = computeTars(fixtureEvents, { ...setupGuideFeature, enabled: false })
  expect(result.targeted).toBe(0)
  // Adopted/Retained are observed facts about past events, independent of the current gate.
  expect(result.adopted).toBe(3)
  expect(result.retained).toBe(1)
})

test('computeTars: with no declared event mapping, Targeted/Adopted fall back to "any event" (v1 honest boundary)', () => {
  const genericFeature: TarsFeature = {
    enabled: true,
    targetEvent: null,
    adoptedEvent: null,
    retainedEvent: null,
    retentionDays: 7,
  }
  const events: TarsEvent[] = [
    { userId: 'erin', event: 'some_event', createdAt: day(0) },
    { userId: 'erin', event: 'some_event', createdAt: day(2) }, // repeat within window -> retained
    { userId: 'frank', event: 'some_event', createdAt: day(0) }, // no repeat -> adopted, not retained
  ]
  const result = computeTars(events, genericFeature)
  expect(result).toEqual({ targeted: 2, adopted: 2, retained: 1 })
})

test('computeTars: a repeat exactly at the retention window boundary still counts as retained', () => {
  const events: TarsEvent[] = [
    { userId: 'gina', event: 'setup_guide_viewed', createdAt: new Date(0).toISOString() },
    {
      userId: 'gina',
      event: 'setup_guide_step_completed',
      createdAt: new Date(0).toISOString(),
    },
    {
      userId: 'gina',
      event: 'setup_guide_share_tapped',
      createdAt: new Date(7 * DAY_MS).toISOString(), // exactly 7 days later, retentionDays = 7
    },
  ]
  const result = computeTars(events, setupGuideFeature)
  expect(result.retained).toBe(1)
})

test('computeTars: the retention window is anchored to the ADOPTING event, not an earlier target/view event', () => {
  // heidi: viewed on day 0 (targeted), but didn't actually adopt until day 20 — then shared
  // 2 days after adopting. Retained relative to her real adoption, even though 22 days
  // separate her view from her share (which would wrongly fail a window anchored to day 0).
  const events: TarsEvent[] = [
    { userId: 'heidi', event: 'setup_guide_viewed', createdAt: day(0) },
    { userId: 'heidi', event: 'setup_guide_step_completed', createdAt: day(20) },
    { userId: 'heidi', event: 'setup_guide_share_tapped', createdAt: day(22) },
  ]
  const result = computeTars(events, setupGuideFeature)
  expect(result).toEqual({ targeted: 1, adopted: 1, retained: 1 })
})
