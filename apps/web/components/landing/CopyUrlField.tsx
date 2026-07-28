'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

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
    <div className="copy-url">
      <input className="gb" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="ghost" onClick={onCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}
