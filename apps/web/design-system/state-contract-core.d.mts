// Types for the PURE half of the structural state contract, so `console-visual.authed.spec.ts` can
// import it under `tsc --noEmit`. `allowJs` is false, which is why this file exists at all — same
// reason as `approved-states.d.mts` beside it.

/** One block of a state's content column. Only the facts that survive a change of dataset. */
export type Block = {
  kind: string
  /** Tiles, stats or small plots — how many, never which. */
  count?: number
  /** A list's column words, lowercased. `null` when the list renders no header row. */
  columns?: string[] | null
  /** The primary action's label, lowercased. `null` when the head draws no primary action. */
  action?: string | null
}

export type Signature = {
  /** `true` when the scope resolved to nothing, or to the screen behind an open door or modal. */
  missing: boolean
  blocks: Block[]
  /** Always 0 in an approved state; anything else on a built route is a Sprint 2 defect. */
  disclosures: number
  /** The designer's `.callout.info` annotations — reported, never compared (epic D2-c). */
  annotations: number
  /** Elements the block vocabulary does not name. Generation fails on a non-empty one. */
  unknown: string[]
}

export type SignatureArgs = {
  scope: readonly string[]
  kinds: readonly { kind: string; proto: string; product: string; facts?: unknown }[]
  annotation: { proto: string; product: string }
  hiddenText: string
  side: 'proto' | 'product'
}

export const BLOCK_KINDS: readonly { kind: string; proto: string; product: string; facts?: unknown }[]
export const ANNOTATION: { proto: string; product: string }
export const HIDDEN_TEXT: string
export const PROTO_SCOPE: readonly string[]
export const PRODUCT_SCOPE: readonly string[]

/** Runs INSIDE a page — handed to `page.evaluate`, never called in Node. */
export function extractSignature(args: SignatureArgs): Signature

/** The argument `extractSignature` needs for one side. */
export function signatureArgs(side: 'proto' | 'product'): SignatureArgs

/** Human-readable differences, empty when the built route matches its approved state. */
export function diffSignature(approved: Signature, built: Signature): string[]
