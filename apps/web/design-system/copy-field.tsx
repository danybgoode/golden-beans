'use client'

// The one interactive primitive on an otherwise server-rendered page: a value you are meant to take
// away, and the button that takes it.
//
// ── Why it is here and not in `primitives.tsx` ────────────────────────────────────────────────
// `'use client'` is a FILE directive. Putting this beside the page layer would make `PageHead`,
// `ListCard` and every other server-safe primitive a client component, ship them all to the
// browser, and — worse — force every page that renders a list to become a client tree. One
// directive, one file.
//
// ── What this replaced, and why ───────────────────────────────────────────────────────────────
// ⚠️ **CORRECTED, Sprint 6 round 5.** This paragraph said `components/landing/CopyUrlField` "exists
// and it works", that it "is the LANDING's", and that it was "left alone rather than widened".
// All three clauses are now false: `/install` was the last caller, and Story 6.4 deleted both that
// component and `globals.css`'s `.copy-url` rules as part of the sweep. A comment describing a
// deleted file as a live alternative is the defect class this epic is named after, left behind by
// the commit that did the deleting.
//
// What was true and still is, because it is why this component exists: the value is a credential
// shown exactly once, so it must WRAP rather than sit on one horizontally-scrollable line — the
// defect `flag-credential-manager.tsx` records against `.copy-url` — and it renders from
// `design-system/`, which is what the coverage boolean asks about.

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      // The confirmation is temporary on purpose: a button that says "Copied" forever is a button
      // whose label stops describing what pressing it would do.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied, or an insecure origin. Nothing to degrade to and nothing to
      // report: the value is rendered in full beside the button and is selectable, which is the
      // fallback. Swallowing this is deliberate rather than an omission — an error toast for "your
      // browser would not let us write to the clipboard" is noise over a value the reader can see.
    }
  }

  return (
    <div className="ds-copyrow">
      {/* The value itself, wrapping. Not an `<input readOnly>`: an input is a control, and a
          credential is not something you edit — `<code>` is what it is, and it is what a screen
          reader announces it as. */}
      <code>{value}</code>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={onCopy} aria-label={label}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? 'Copied' : 'Copy'}
      </button>
      {/* ⚠️ **The confirmation reaches a screen reader through a LIVE REGION, not through the
          button's label** (cross-family review, agy). `aria-label` is name-from-author and beats
          name-from-content, so the button's accessible name stays "Copy this connector URL" whether
          or not it currently says "Copied" — a sighted reader gets the confirmation and nobody else
          does. That is the same mechanism the flags console recorded when an `aria-label` on a cell
          made it announce itself as "Feature" instead of as the key it held.
          The label stays: a page can carry two copy fields, and "Copy" twice is two
          identically-named controls. What is added is the announcement.
          `role="status"` rather than a name change, because renaming a control does not announce —
          it is only heard if focus returns to it. */}
      <span className="ds-visually-hidden" role="status">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  )
}
