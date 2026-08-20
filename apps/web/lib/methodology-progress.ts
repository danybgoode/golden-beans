// methodology-experience · Sprint 3, Story 3.4 — read progress, as a pure module.
//
// ── Why the logic is here and not in the component ────────────────────────────────────────────
// Everything below is decidable without a browser: what counts as progress, what a corrupt stored
// value means, and what to do when storage is unavailable. Keeping it in a zero-import module means
// the rules are unit-testable directly rather than only through a rendered React tree — the
// `lib/flags.ts` precedent, and the LEARNINGS rule about a guard that is unreachable through the
// harness that is supposed to exercise it.
//
// ── What this deliberately does NOT model ─────────────────────────────────────────────────────
// No account, no database, no cross-device promise (epic D6, and the story's own acceptance). This
// is one visitor's own browser telling them what they have opened. If that is not available, the
// honest answer is to show nothing — see `readProgress` returning `null`, which the rail treats as
// "render no rail at all" rather than as "zero of six".
//
// A zero and a broken read are indistinguishable to a reader, and a zero pages nobody
// (CODE-QUALITY #8). "0 of 6" after a reader has worked through four chapters — because storage was
// cleared, or blocked, or the key changed — is a number-shaped lie. `null` is not.

/** Bumped only if the stored SHAPE changes; a chapter id changing is handled by filtering. */
export const PROGRESS_STORAGE_KEY = 'gf.methodology.read.v1'

export interface ReadProgress {
  /** Chapter ids the visitor has opened, in no particular order. Always a subset of the module's. */
  opened: string[]
  total: number
}

/**
 * Parse whatever came out of storage into progress, or `null` if it cannot be trusted.
 *
 * `null` and "zero chapters" are DIFFERENT ANSWERS and the caller must be able to tell them apart:
 * the first means "we do not know", the second means "we know, and it is none". Returning `0` for
 * both is the silent-zero defect this repo has now been bitten by four times.
 *
 * `validIds` is passed in rather than imported so this module stays free of the content module —
 * it makes the rule testable with a small fixture, and it is what filters out a chapter id that has
 * since been renamed or removed rather than counting it toward a total it no longer belongs to.
 */
export function parseProgress(raw: string | null, validIds: readonly string[]): ReadProgress | null {
  if (raw === null) return { opened: [], total: validIds.length }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt value: someone else's key, a truncated write, a half-cleared profile. Treat it as
    // "we do not know" rather than as "nothing read" — the reader may well have read everything.
    return null
  }
  if (!Array.isArray(parsed)) return null
  const valid = new Set(validIds)
  const opened = [...new Set(parsed.filter((id): id is string => typeof id === 'string' && valid.has(id)))]
  return { opened, total: validIds.length }
}

/** The stored value after opening `id`. Idempotent, and never grows past the known chapters. */
export function withChapterOpened(
  current: ReadProgress | null,
  id: string,
  validIds: readonly string[]
): ReadProgress {
  const base = current?.opened ?? []
  const valid = new Set(validIds)
  const opened = valid.has(id) ? [...new Set([...base, id])] : [...base]
  return { opened, total: validIds.length }
}

/**
 * The sentence the rail renders, or `null` when there is nothing honest to say.
 *
 * The wording is deliberate on two counts. It says "opened", not "read" — the page cannot know
 * whether anyone read anything, and the mockup's own panel copy says *"Scrolling does not count."*
 * Claiming otherwise on the surface that makes that point would be the exact failure D6 names.
 *
 * And it names the ONE thing this feature tracks. The mockup's rail also promised *Tried* and
 * *Produced* as permanently empty circles. Both are CUT rather than rendered as honest gaps: an
 * empty state earns its place when a reader can act on it, and "we might track this one day" is a
 * roadmap note wearing a progress indicator's clothes.
 */
export function progressSentence(progress: ReadProgress | null): string | null {
  if (!progress) return null
  if (progress.opened.length === 0) return null
  return `${progress.opened.length} of ${progress.total} chapters opened`
}
