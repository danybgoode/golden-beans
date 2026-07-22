// Shared entity/segment vocabulary for projections and experiment governance.
//
// This module is deliberately neutral: journeys are the first consumer, not the owner. Keep it
// free of framework/runtime imports so any evaluator or governance validator can reuse the same
// vocabulary in pure specs.

/** A tenant-scoped entity is identified by BOTH fields. Neither value is globally meaningful. */
export type EntityKey = { type: string; id: string }

/** Canonical ordering inputs: effective time is occurredAt ?? createdAt; eventId breaks ties. */
export type CanonicalFactClock = {
  occurredAt: string | null
  createdAt: string
  eventId: string
}

/** Freshness keeps event-time and receipt-time separate; neither is a substitute for the other. */
export type SourceFreshness = {
  latestEffectiveFactAt: string | null
  latestReceiptAt: string | null
}

// Exact-match dimensions are a controlled, low-cardinality vocabulary. Never widen this list just
// because a caller has another tag: it is also the boundary that keeps PII/high-cardinality values
// out of saved segment definitions.
export const EXACT_SEGMENT_TAG_FIELDS = ['source', 'channel', 'campaign', 'plan', 'region'] as const
export type ExactSegmentTagField = (typeof EXACT_SEGMENT_TAG_FIELDS)[number]
export type ExactSegmentScalar = string | number | boolean

// Deliberately below Number.MAX_SAFE_INTEGER: abs <= 1e15 round-trips predictably across JSON,
// JavaScript and Postgres while rejecting exponent bombs / meaningless extreme segment values.
export const MAX_EXACT_SEGMENT_NUMBER_ABS = 1_000_000_000_000_000
