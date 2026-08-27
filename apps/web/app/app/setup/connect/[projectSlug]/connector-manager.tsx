'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyUrlField } from '@/components/landing/CopyUrlField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { mintConnectorAction, revokeConnectorAction } from './actions'

// console-ia-overhaul · Sprint 2, Story 2.1 — the only interactive part of Setup › Connect.
//
// The URL itself, the status sentence and the docs link are all server-rendered; this island exists
// for the two mutations and the one-time reveal. Same shape as the credential managers next door.

const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

export function ConnectorManager({
  slug,
  tokenId,
  url,
  canManage,
  connectorEnabled,
}: {
  slug: string
  /** The active token's row id, or null when there is none to revoke. */
  tokenId: string | null
  /** The active connector URL, or null. Server-resolved; never derived from the address bar. */
  url: string | null
  canManage: boolean
  connectorEnabled: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The plaintext, held for exactly this render. It is never read back from the server afterwards —
  // `getConnectorStatus` returns the URL for display, but this is the reveal that follows a mint.
  const [minted, setMinted] = useState<string | null>(null)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)

  function onMint() {
    setError(null)
    startTransition(async () => {
      const result = await mintConnectorAction(slug)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMinted(result.url)
    })
  }

  function onRevoke() {
    setConfirmingRevoke(false)
    setError(null)
    startTransition(async () => {
      const result = await revokeConnectorAction(slug, tokenId)
      if (!result.ok) {
        setError('Could not revoke that connector URL. Reload and try again.')
        return
      }
      // A full reload rather than local state: revoking changes what the page's server-rendered
      // status sentence says, and two sources of truth for "is there a connector" is how a screen
      // ends up claiming one exists after it was killed.
      window.location.reload()
    })
  }

  const active = minted ?? url

  return (
    <div className="stack">
      {minted && (
        <p role="status" className="reveal-note">
          <strong>Copy this now.</strong> This is the only time it is shown. It is a bearer credential: anyone
          holding the URL can read this project&apos;s data through it, so treat it like a password and revoke
          it if it leaks.
        </p>
      )}

      {active ? (
        <>
          <CopyUrlField url={active} />
          <p className="row-wrap">
            <a className="btn btn-gold" href={ADD_TO_CLAUDE_URL} target="_blank" rel="noopener noreferrer">
              Add to Claude
            </a>
          </p>
          {/* The modal takes no URL parameter — verified against the shipped install panel — so the
              flow is copy-then-paste and this link cannot pre-fill it. Saying so is better than a
              reader assuming the button did something it did not. */}
          <p className="data-table__count">
            The button opens Claude&apos;s connector dialog; paste the URL above into it. It cannot be
            pre-filled from a link.
          </p>
        </>
      ) : null}

      {error && (
        <p role="alert" className="auth-form__message auth-form__message--error">
          {error}
        </p>
      )}

      {canManage && !active && connectorEnabled && (
        <p>
          <Button type="button" onClick={onMint} disabled={pending}>
            {pending ? 'Creating…' : 'Create a connector URL'}
          </Button>
        </p>
      )}

      {canManage && url && !minted && (
        <>
          <p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingRevoke(true)}
              disabled={pending}
            >
              Revoke this URL
            </Button>
          </p>
          <ConfirmDialog
            open={confirmingRevoke}
            /* `verb` matches the button that opened this, unchanged — the component requires that,
               and the reason is that a control's name must not change mid-flow. */
            verb="Revoke"
            noun="connector URL"
            /* The SPECIFIC object. A connector URL has no label, so the project it serves is what
               identifies it — never "Are you sure?". */
            subject={slug}
            /* What STOPS WORKING, in plain words, not a restatement of the verb. */
            consequence="Any agent using this URL stops being able to read this project immediately — no deploy needed."
            details="Rotating means creating a new URL afterwards and pasting it into Claude again."
            pending={pending}
            onConfirm={onRevoke}
            onCancel={() => setConfirmingRevoke(false)}
          />
        </>
      )}
    </div>
  )
}
