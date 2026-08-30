/* tokens.ts — the token names, as a closed union
 *
 * ⚠️ GENERATED — DO NOT HAND-EDIT. Regenerate with:
 *     node apps/web/design-system/extract-css.mjs
 * CI runs `--check` and fails on any diff, so a hand-edit is reverted rather than argued about.
 *
 * Source: apps/web/design-system/console-prototype.html — the 32 states approved 2026-08-29 (APPROVED.md).
 */

/* The compile-time half of D2. A CSS custom property cannot fail a build — an undefined `var()`
 * renders as nothing at paint time — so this module is what makes DELETING a token break its
 * TypeScript consumers, and `tokens.test.ts` is what makes it break its CSS consumers. Stated
 * plainly: a raw `var(--typo)` typed into a stylesheet is still not compile-checked. The test is
 * the honest half of that criterion. */

export const DESIGN_TOKENS = [
  '--roast',
  '--roast-2',
  '--card',
  '--card-2',
  '--card-3',
  '--line',
  '--line-soft',
  '--crema',
  '--dim',
  '--dim-2',
  '--gold',
  '--gold-hot',
  '--gold-deep',
  '--green',
  '--green-deep',
  '--red',
  '--red-deep',
  '--blue',
  '--sans',
  '--mono',
  '--r',
  '--r-lg',
  '--shadow',
  '--shadow-hi',
  '--t',
] as const

export type DesignToken = (typeof DESIGN_TOKENS)[number]

/** `token('--gold')` — a `var()` reference the compiler checks. */
export function token(name: DesignToken): string {
  return `var(${name})`
}
