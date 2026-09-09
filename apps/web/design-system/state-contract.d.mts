// Types for the GENERATOR half. The vocabulary and the comparison are re-exported from
// `state-contract-core.mjs`; only `readContract` needs a browser and lives here.

export * from './state-contract-core.mjs'
import type { Signature } from './state-contract-core.mjs'

/** Read every approved state's signature out of the prototype. Needs a browser. */
export function readContract(): Promise<Record<string, Signature>>
