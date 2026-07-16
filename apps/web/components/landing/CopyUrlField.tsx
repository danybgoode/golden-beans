'use client'

import { useState } from 'react'

// Story 2.2 (commercial-shell/sprint-2.md) — the install page's copy-your-URL field. The only
// interactive piece here besides the "Add to Claude" link itself, mirroring WaitlistForm.tsx's
// "one client component on an otherwise server-rendered page" shape.
export function CopyUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied or unavailable — the URL is still selectable/readable in
      // the input itself, so there's nothing further to degrade to.
    }
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input
        className="gb"
        type="text"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: 1, minWidth: 280, font: '500 13px var(--mono)' }}
      />
      <button className="btn btn-mini" type="button" onClick={onCopy} style={{ padding: '13px 18px' }}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  )
}
