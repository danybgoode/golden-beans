// Types for the generator, so `tokens.test.ts` can import it under `tsc --noEmit`.
//
// Hand-written rather than generated: the generator is a build tool, it is deliberately plain
// `.mjs` so it runs with `node` and no compile step (the whole point of Mechanism D — a script that
// needs a toolchain is a script that dies on a fresh clone), and this is the small price of having
// a TypeScript test assert its behaviour. Four exports, one line each; if it grows past that, the
// generator has grown past what a build tool should be.

/** The scope roots `tokens.css` declares its block on. `.is-console` is transitional — see Sprint 6. */
export const SCOPE_SELECTORS: readonly string[]

/** The only token values that may differ between the approved prototype and the generated file. */
export const FONT_STACK_OVERRIDES: Record<string, string>

/** The prototype's single `<style>` block. Throws when there is not exactly one. */
export function readPrototypeStyle(root?: string): string

/** `[name, value]` pairs from the prototype stylesheet's `:root`, in source order. */
export function readTokens(style: string): [string, string][]

/** Every generated file, by basename, as it should appear on disk. */
export function generate(root?: string): Record<string, string>
