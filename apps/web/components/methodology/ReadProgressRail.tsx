'use client'

import { useEffect, useState } from 'react'
import {
  PROGRESS_STORAGE_KEY,
  parseProgress,
  progressSentence,
  withChapterOpened,
  type ReadProgress,
} from '@/lib/methodology-progress'

// methodology-experience · Sprint 3, Story 3.4 — real progress, or no rail.
//
// ── What the mockup had here, and why none of it shipped (epic D6) ────────────────────────────
// A three-row rail reading `Read ✓ / Tried ○ / Produced ○`, with the ✓ hardcoded before the reader
// had read anything and the other two permanently empty — on the one panel whose own copy says
// *"Scrolling does not count."* That is a claim the product cannot back, rendered as though it
// could, which is exactly the failure CODE-QUALITY #9 names. (`✓` is also banned outright by
// `check-design-drift`'s `ui-pictograph` rule.)
//
// *Tried* and *Produced* are CUT rather than rendered as honest gaps. An empty state earns its
// place when a reader can act on it; "we might track this one day" is a roadmap note wearing a
// progress indicator's clothes, and it would sit in the reserved column of every chapter forever.
//
// ── Three states, and the difference between two of them is the point ─────────────────────────
//   · storage unavailable or unreadable  → render NOTHING (`progress === null`)
//   · storage readable, nothing opened   → render nothing, because "0 of 6" on arrival is not
//                                          information
//   · storage readable, something opened → render the count
// A zero and a broken read are indistinguishable to a reader, and a zero pages nobody. The module
// keeps them distinguishable; this component's job is to render neither as a number.
//
// ── There is no progress BAR, and that is a decision ──────────────────────────────────────────
// The first draft drew one, and `check-design-drift` refused it: a computed width is an inline
// `style=`, which amendment A4 bans on this surface (the /app routes keep that exemption for the
// funnel's real geometry). The guard was right to ask, and the honest answer is not an exemption —
// it is that the bar carries NO information the sentence above it does not already state in words.
// A rail whose whole subject is "decoration is not information" should not open with a decoration.
//
// ── Why a client component, and why it renders null on the server ─────────────────────────────
// `localStorage` exists only in the browser, so the first paint cannot know the answer. Rendering
// a placeholder and swapping it would flash a wrong number; rendering nothing until the effect has
// run means the rail appears once, correct. It also keeps the server HTML identical for every
// visitor, which matters for a route that is statically generated (Story 2.3).
export function ReadProgressRail({ chapterId, chapterIds }: { chapterId: string; chapterIds: string[] }) {
  const [progress, setProgress] = useState<ReadProgress | null>(null)

  useEffect(() => {
    // One try/catch around BOTH the read and the write. Safari in private mode throws on
    // `setItem` even when `getItem` succeeded, and a storage-disabled browser can throw on the
    // property access itself — so a rail that only guarded the read would still crash the page for
    // the readers it was meant to degrade for.
    try {
      const current = parseProgress(window.localStorage.getItem(PROGRESS_STORAGE_KEY), chapterIds)
      const next = withChapterOpened(current, chapterId, chapterIds)
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next.opened))
      setProgress(next)
    } catch {
      // Storage unavailable: no rail.
      //
      // `null` is the truthful value — "we do not know" — and it is deliberately not
      // `{ opened: [], total }`, which asserts "we know, and it is none" at a reader who may have
      // read all six. Be precise about what that buys TODAY, though: `progressSentence` already
      // returns null for a count of zero, so both spellings currently render nothing, and a
      // mutation swapping one for the other changes no pixel. An earlier version of this comment
      // claimed the `null` was what prevented a rendered "0 of 6" — it is not, on its own
      // (CODE-QUALITY #3, and found by the mutation check failing to go red).
      //
      // What it actually buys is that the two guards are INDEPENDENT: it takes removing both the
      // zero-guard in `progressSentence` AND this `null` to produce the silent zero. Verified by
      // mutating both together, which does turn the spec red.
      setProgress(null)
    }
  }, [chapterId, chapterIds])

  const sentence = progressSentence(progress)
  if (!sentence) return null

  return (
    <aside className="methodology-progress" aria-label="Your reading progress">
      <p className="methodology-progress__count">{sentence}</p>
      <p className="methodology-progress__note">Counted in this browser only. Nothing is sent anywhere.</p>
    </aside>
  )
}
