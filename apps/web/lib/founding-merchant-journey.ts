import type { JourneyDefinition } from './journey-definition'

// Entity journeys · Sprint 3, Story 3.1 — Miyagi's founding-merchant lifecycle as
// an analytics contract. These are event names only: Golden Beans receives opaque
// lifecycle facts and never imports contacts, tasks, consent bodies or commerce state.
export const MIYAGI_FOUNDING_MERCHANT_JOURNEY = {
  entityType: 'merchant',
  description: 'Miyagi founding-merchant activation from scouting through retained commerce.',
  stages: [
    { key: 'scouted', event: 'merchant.scouted' },
    { key: 'qualified', event: 'merchant.qualified' },
    { key: 'permission_granted', event: 'merchant.permission_granted' },
    { key: 'preview_in_preparation', event: 'merchant.preview_in_preparation' },
    { key: 'preview_delivered', event: 'merchant.preview_delivered' },
    { key: 'activation_scheduled', event: 'merchant.activation_scheduled' },
    { key: 'claimed', event: 'merchant.claimed' },
    { key: 'payments_ready', event: 'merchant.payments_ready' },
    { key: 'three_products_live', event: 'merchant.three_products_live' },
    { key: 'shared_externally', event: 'merchant.shared_externally' },
    { key: 'first_inquiry', event: 'merchant.first_inquiry' },
    { key: 'first_sale', event: 'merchant.first_sale' },
    { key: 'retained_30d', event: 'merchant.retained_30d' },
  ],
  cohortEntry: { stageKey: 'scouted' },
  retention: {
    stageKey: 'retained_30d',
    anchorStageKey: 'first_sale',
    withinDays: 30,
  },
} as const satisfies JourneyDefinition

export const MIYAGI_FOUNDING_MERCHANT_EVENT_NAMES = new Set<string>(
  MIYAGI_FOUNDING_MERCHANT_JOURNEY.stages.map((stage) => stage.event),
)
