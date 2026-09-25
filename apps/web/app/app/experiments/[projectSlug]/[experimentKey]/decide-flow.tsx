'use client'

import type { ReadoutAction } from '@/lib/experiment-readout'

// experiments-for-humans · Story 4.2 (D8) — the verdict card's actions: stop → decide (chips) → roll
// out, each its own write with its own result, and a 10-second undo. Built by the architect; the
// Results tab renders this INSIDE the verdict card and passes it the readout's actions.
export type DecideFlowProps = {
  slug: string
  experimentKey: string
  experimentId: string
  versionId: string
  version: number
  lifecycle: 'running' | 'stopped' | 'decided'
  controlKey: string
  /** Every version of the test, in definition order, with its human label. */
  variants: Array<{ key: string; label: string }>
  currentDecisionId: string | null
  /** The decided outcome and chosen variant, when decided (for the roll-out after a decision). */
  decision: { outcome: string; chosenVariantKey: string | null } | null
  actions: ReadoutAction[]
}

export function DecideFlow(props: DecideFlowProps) {
  void props
  return null
}
