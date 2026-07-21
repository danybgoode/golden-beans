'use client'
import { useState } from 'react'
import { dismissOnboardingKeyAction } from './actions'

// multi-tenant-activation · Sprint 2, Story 2.3 — the control that makes the key reveal actually
// end. See ./actions.ts for why a Server Component can't do this itself.
//
// Explicit and user-driven rather than an on-mount effect: firing automatically would race the
// user's copy action and could clear the key before they'd read it, which is worse than showing it
// a moment longer. The TTL is the backstop for anyone who simply walks away.
export function DismissKeyButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ marginTop: 14 }}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await dismissOnboardingKeyAction(slug)
        } finally {
          // The action revalidates this path, so a success re-renders without the key. On failure
          // we re-enable rather than leaving a dead control — the TTL still applies either way.
          setBusy(false)
        }
      }}
    >
      {busy ? 'Hiding…' : "I've saved it — hide this key"}
    </button>
  )
}
