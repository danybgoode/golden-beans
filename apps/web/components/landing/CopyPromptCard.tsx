'use client'

import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

// landing-redesign-v2 · Sprint 2, Story 2.2 — the "paste this into your agent" block.
//
// Sibling of CopyUrlField.tsx and the same shape: one client component on an otherwise
// server-rendered page. The difference is what it copies — an input's `value` there, a rendered
// text node here.
//
// ── Why it copies from its own rendered node instead of from the prop ─────────────────────────
// The acceptance for this story is that the copied string and the displayed string cannot
// diverge. Reading `prompt` directly in the click handler would satisfy that only as long as the
// two stay in step by accident: the moment the render side gains any transformation — a trim, a
// template wrapper, a line the JSX adds for layout — the button starts handing over a string the
// reader never saw. Copying `textContent` off the element that is actually on screen makes the
// displayed text the definition, so the two are the same string by construction rather than by
// review. (CODE-QUALITY.md #2: make the failure unrepresentable, not merely fixed.)
//
// The fallback matters more here than on the URL field. A prompt is several hundred characters of
// prose; if the clipboard write is refused there is no realistic manual alternative, so the
// handler selects the text for the reader rather than silently doing nothing.
export function CopyPromptCard({
  label,
  prompt,
  className = '',
}: {
  /** The small mono label in the card's header, e.g. "HANDOFF PROMPT · PUBLIC ROUTES". */
  label: string
  prompt: string
  className?: string
}) {
  const promptRef = useRef<HTMLPreElement>(null)
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle')

  async function onCopy() {
    const element = promptRef.current
    if (!element) return

    const text = (element.textContent ?? '').trim()

    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      // Clipboard refused (permission, insecure context, older browser). Select the prompt so the
      // reader can copy it by hand — the one thing that must not happen is a button that reports
      // nothing and does nothing.
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      setState('select')
    }
  }

  return (
    <div className={`prompt-card ${className}`.trim()}>
      <div className="prompt-head">
        <span className="prompt-head__label">{label}</span>
        <button className="btn-mini" type="button" onClick={onCopy}>
          <Icon name={state === 'copied' ? 'check' : 'copy'} size={12} />
          {state === 'copied' ? 'copied' : state === 'select' ? 'select + copy' : 'copy prompt'}
        </button>
      </div>
      <pre className="prompt-copy" ref={promptRef}>
        {prompt}
      </pre>
    </div>
  )
}
