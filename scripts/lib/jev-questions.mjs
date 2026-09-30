// jev-questions.mjs — every Jev question the kit asks, as data, and the hash a recording pins it by
// (compiled-prompts D2/D3).
//
// A question is exactly what Jev receives — `{ type, instructions, criteria }` — so the file IS the wire shape:
// no translation layer between what a maintainer edits and what `askJev` sends. `criteria` is `{ true, false }`
// for a noul, `{ label: text }` for a choice and `[level…]` for a score.
//
// Zero deps — Node 18+.

import { textHash } from './jev.mjs';

/**
 * Pins a recording to the wording that produced it (D3): an edited question must be re-measured with
 * `jev-eval --live`, never replayed green on answers Jev gave to the old text. Only the three fields Jev
 * receives are hashed, in a fixed order, so the `measured` block and the id can change without a re-record.
 */
export const questionHash = (q) =>
  textHash(JSON.stringify({ type: q.type, instructions: q.instructions, criteria: q.criteria }));
