// What is in the way, in plain words — design-system-rails · Sprint 5, Story 5.4.
//
// ── Sprint contract #9, made unrepresentable rather than promised ─────────────────────────────
// *"Blockers are named in plain words — 'the split cannot be checked yet', NEVER
// `srm_not_evaluable`."* The shipped page rendered `analysis.blockers.join(', ')`, so a person
// looking at a blocked experiment read `srm_not_evaluable, duplicate_exposure` — the storage model,
// which is exactly what `design-system/vocabulary.ts`' STORAGE_WORDS list exists to keep off a
// screen.
//
// ⚠️ **The map is TOTAL over the union, so a new blocker code is a COMPILE error rather than a raw
// enum leaking onto a page.** A `Record<K, V>` over a closed union is the only version of this rule
// that cannot rot: a lookup with a fallback would silently render the next added code as itself, and
// a fallback is exactly how the raw enums got on screen the first time.
//
// Every entry is two sentences: what is in the way, and what would clear it. A blocker a reader
// cannot act on is a blocker they will ask about.

import type { ExperimentAnalysisResult } from './experiment-analysis'

/** Every code `analysis.blockers` can carry. Derived from the analysis type, never re-typed. */
export type ExperimentBlocker = ExperimentAnalysisResult['blockers'][number]

export type BlockerWords = {
  /** The heading, in the reader's terms. Bold on screen. */
  what: string
  /** What would clear it. */
  why: string
}

export const BLOCKER_WORDS: Record<ExperimentBlocker, BlockerWords> = {
  srm_detected: {
    what: 'People were not divided evenly between the groups.',
    why: 'The split you declared and the split that happened do not match, so a difference between the groups could be the split rather than the change. Something upstream is assigning people differently from the plan.',
  },
  srm_not_evaluable: {
    what: 'The split cannot be checked yet.',
    why: 'There are too few subjects to tell whether people were divided evenly between the groups. This clears itself as more people are exposed.',
  },
  metric_subject_unaddressable: {
    what: 'The events behind this metric cannot be tied to the people who saw the change.',
    why: 'They arrived without the subject the experiment assigns on, so there is nobody to attribute them to. The events are being recorded; they just cannot be counted here.',
  },
  version_mismatch: {
    what: 'Some exposures name a different version of this plan.',
    why: 'A plan is immutable, so an exposure recorded against another version belongs to another experiment. Those exposures are excluded rather than mixed in.',
  },
  unknown_variant: {
    what: 'Some exposures name a variant this plan does not declare.',
    why: 'Whatever is assigning people is using a name the plan has never heard of, so those people are in no group this page can read.',
  },
  missing_or_wrong_subject: {
    what: 'Some exposures carry no subject, or the wrong kind of one.',
    why: 'An exposure has to say WHO saw the change, in the terms the plan assigns on, or it cannot be joined to anything that happened afterwards.',
  },
  eligibility_mismatch: {
    what: 'Some exposures went to people the plan says are not eligible.',
    why: 'The change was shown outside the audience it was declared for, so the result would describe a different population from the one you planned to test.',
  },
  duplicate_exposure: {
    what: 'Some people were recorded as exposed more than once.',
    why: 'Counting them twice would weight them twice. The duplicates are excluded, and their presence means something upstream is emitting an exposure it has already emitted.',
  },
  cross_variant_exposure: {
    what: 'Some people were shown more than one variant.',
    why: 'Somebody who saw both cannot tell you what either one did, so they belong to neither group.',
  },
  out_of_window_exposure: {
    what: 'Some exposures fall outside the window this plan declared.',
    why: 'The observation window is part of the immutable plan, and an exposure outside it is not part of this experiment.',
  },
}

/**
 * Plain words for a blocker.
 *
 * ⚠️ There is no fallback, and there cannot be one: the parameter is the closed union, so an
 * unlisted code does not compile. That is the whole point — a fallback is how a raw enum reached a
 * page the first time.
 */
export function blockerWords(blocker: ExperimentBlocker): BlockerWords {
  return BLOCKER_WORDS[blocker]
}
