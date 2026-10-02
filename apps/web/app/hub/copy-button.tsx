'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

// board-sinks-and-scrumban · Sprint 2, Story 2.3 — copy the kickoff or a command, exactly.
//
// `CopyField` (design-system/copy-field.tsx) draws the value AND the button; a board card shows a 6 KB kickoff and a
// list of commands, where the value belongs in its own row and only the button is needed. So this is CopyField's
// button alone, with the same two rules: the confirmation is temporary, and it reaches a screen reader through a
// live region (an `aria-label` would keep naming the button "Copy …" while it visibly says "Copied").
//
// The browser spec asserts the clipboard holds `value` byte for byte — that is the whole story's acceptance.
export function CopyButton({
  value,
  label,
  children,
  primary = false,
}: {
  value: string
  /** The accessible name: "Copy the kickoff prompt", "Copy: Build epic x". Two copy buttons must not share one. */
  label: string
  /** The visible words; defaults to "Copy". */
  children?: string
  primary?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Permission denied or an insecure origin: the value is on the page and selectable, which is the fallback.
    }
  }

  return (
    <>
      <button
        type="button"
        className={primary ? 'ds-btn ds-btn--primary' : 'ds-btn ds-btn--secondary ds-btn--sm'}
        onClick={onCopy}
        aria-label={label}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? 'Copied' : (children ?? 'Copy')}
      </button>
      <span className="ds-visually-hidden" role="status">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </>
  )
}
