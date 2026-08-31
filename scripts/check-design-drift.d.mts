// Types for the drift guard's PARSING helpers, so a TypeScript test can import them under
// `tsc --noEmit`. Same reasoning as `design-system/extract-css.d.mts`: the guard is deliberately
// plain `.mjs` so it runs with `node` and no compile step, and this is the small price of letting a
// typed test reuse its parser instead of writing a second one.
//
// ⚠️ Deliberately PARTIAL. Only what a test consumes is declared — declaring the whole module would
// be a second description of it, kept in sync by nobody. `selectorLists` is here because
// `design-system/system-cascade.test.ts` must split selectors exactly the way the guard does; two
// parsers disagreeing is how a rule passes one and fails the other.

/** Every selector list in a stylesheet, with its source offset. At-rule preludes are skipped. */
export function selectorLists(source: string): { text: string; index: number }[]

/** Every `.tsx` file under a root, recursively. Throws when the root does not exist. */
export function sourceFiles(root: string): string[]

/** The directories the drift guard sweeps, relative to the repo root. */
export const SWEPT_ROOTS: readonly string[]
