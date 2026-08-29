// Types for the approved state list, so `route-manifest.test.ts` can import it under `tsc --noEmit`.
//
// The functions are only ever handed to Playwright's `page.evaluate`, which serialises them and
// runs them inside the prototype — so their free identifiers are the PAGE's globals, not this
// module's, and there is nothing useful to say about them here beyond their shape.

export const APPROVED_STATES: readonly (readonly [string, () => void])[]

/** Just the ids, in approval order. The half every non-browser consumer needs. */
export const STATE_IDS: readonly string[]
