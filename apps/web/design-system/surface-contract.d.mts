// Types for the pure spec → contract seam (sketch-specs D13), so TypeScript tests import it under `tsc --noEmit`
// (`allowJs` is false) — the same reason as `state-contract-core.d.mts` beside it.
import type { Surface } from '../../../scripts/lib/surface.mjs'
import type { Signature } from './state-contract-core.mjs'

export type SpecEntry = Signature & { source: 'spec' }

export type FoundSurface = {
  /** `<folder>/<name>`, the name every problem uses. */
  file: string
  name: string
  /** First 16 hex of the SHA-256 of the file's bytes. */
  hash: string
  surface?: Surface
  /** The parse error, when the file does not parse. */
  error?: string
}

export type SurfaceMap = { kinds: Record<string, string> }
export type Kinds = readonly { kind: string; facts?: unknown }[]

export function approvalHash(bytes: Uint8Array | string): string
export function readSurfaces(dir: string): FoundSurface[]
export function surfaceEntry(surface: Surface, map: SurfaceMap, kinds: Kinds, file?: string): SpecEntry
export function checkApprovals(surfaces: FoundSurface[], approvedMd: string): string[]
export function approvedSurfaces(
  designSystemDir: string,
  options: { kinds: Kinds; prototypeIds: readonly string[] }
): { entries: Record<string, SpecEntry>; problems: string[] }
export function specContract(
  dir: string,
  options: { approvedMd: string; map: SurfaceMap; kinds: Kinds; prototypeIds: readonly string[] }
): { entries: Record<string, SpecEntry>; problems: string[] }
