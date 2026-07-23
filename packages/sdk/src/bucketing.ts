// Growth Engine v1 — Sprint 4, Story 4.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md).
// Deterministic client-side hash bucketing: same userId + experimentKey always resolves to the
// same variant, computed synchronously with zero network I/O and zero imports — this is
// experiment ASSIGNMENT, not flag serving (Decision 1 stands: on/off gating stays with the
// client's own flags, isEnabled()). Pure so it's trivially unit-testable and portable to any JS
// runtime (browser or Node) with no polyfill.

export interface BucketVariant {
  key: string
  /** Relative weight, defaults to 1 (equal split) if omitted. Must be a positive number. */
  weight?: number
}

// FNV-1a 32-bit — small, fast, deterministic, and dependency-free. Not cryptographic; bucketing
// doesn't need that, just a good enough uniform spread across the [0, 2^32) range.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Deterministically resolves a userId + experimentKey to one of the given variants, weighted.
 * Returns `null` if `variants` is empty or every weight resolves to <= 0 — callers decide how to
 * surface that (see `bucket()` in index.ts, which wraps this in the SDK's envelope convention).
 * Variants are sorted by key before the cumulative-weight walk so the result never depends on the
 * order the caller happened to pass them in.
 */
export function resolveVariant(userId: string, experimentKey: string, variants: BucketVariant[]): string | null {
  return resolveVariantForAssignment(`${userId}:${experimentKey}`, variants)
}

/**
 * Governance-aware assignment uses a collision-safe tuple encoding and remains entirely local.
 * Keep the legacy colon-joined seed above unchanged: existing callers must retain exact buckets.
 */
export function resolveGovernedVariant(
  assignmentEntityType: string,
  assignmentEntityId: string,
  experimentKey: string,
  definitionVersion: number,
  variants: BucketVariant[],
): string | null {
  return resolveVariantForAssignment(
    JSON.stringify([assignmentEntityType, assignmentEntityId, experimentKey, definitionVersion]),
    variants,
  )
}

function resolveVariantForAssignment(assignmentKey: string, variants: BucketVariant[]): string | null {
  const normalized = [...variants]
    .map((v) => ({ key: v.key, weight: v.weight ?? 1 }))
    .filter((v) => v.key.length > 0 && v.weight > 0)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  const totalWeight = normalized.reduce((sum, v) => sum + v.weight, 0)
  if (normalized.length === 0 || totalWeight <= 0) return null

  const hash = fnv1a(assignmentKey)
  // Map the hash into [0, totalWeight) and walk cumulative weights to find the bucket. Divide by
  // 2^32 (not 2^32 - 1) so `point` never reaches `totalWeight` even for the max hash value —
  // otherwise it falls out of every `point < cumulative` check and has to be caught by the
  // post-loop fallback instead of resolving through the loop like every other hash does.
  const point = (hash / 0x100000000) * totalWeight
  let cumulative = 0
  for (const variant of normalized) {
    cumulative += variant.weight
    if (point < cumulative) return variant.key
  }
  return normalized[normalized.length - 1].key
}
