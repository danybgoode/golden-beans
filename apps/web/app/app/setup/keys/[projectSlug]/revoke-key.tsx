'use client'
import { useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { credentialTitle, type CredentialKind } from '@/lib/credential-inventory'
import { revokeCredentialAction } from './actions'

// design-system-rails · Sprint 4, Story 4.5 — the row menu, and the one thing behind it.
//
// ── Why this is a per-ROW island and not a client table ───────────────────────────────────────
// Only the trigger needs a browser. Keeping the island at the row means the credential list stays a
// SERVER component — so its words are readable by the merge gate, and a page whose entire job is an
// accurate access inventory does not ship its inventory through a client boundary.
//
// ── The confirmation names what STOPS WORKING ─────────────────────────────────────────────────
// Never "Are you sure?". `ConfirmDialog` takes the verb (matching the control that opened it), the
// specific subject, and the consequence in plain words — and each kind's consequence is genuinely
// different, which is why they are written out rather than templated from the kind's name.

const CONSEQUENCE: Record<CredentialKind, string> = {
  ingest:
    'Anything still using this key — the SDK, POST /api/v1/track, a CI job — starts getting 401s on its next request. Events sent with it are refused, not queued.',
  flag_read:
    'Whatever reads this environment’s flag snapshot stops being able to. It will serve whatever it last cached, or its own defaults, until you give it a new key.',
  flag_sync:
    'That publisher can no longer register feature definitions. Features already registered keep working and keep serving; only new definitions stop arriving.',
  agent_write:
    'Your agent stops being able to claim, resolve or dismiss tasks over MCP. Reading is unaffected — that is the connector URL, which is a different credential.',
}

export function RevokeKey({
  slug,
  kind,
  keyId,
  label,
}: {
  slug: string
  kind: CredentialKind
  keyId: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending

  function onConfirm() {
    setError(null)
    setBusy(true)
    // ⚠️ The dialog stays OPEN across the transition and closes when the action settles. Clearing it
    // first hides the dialog the instant Confirm is clicked, which makes its `pending` state
    // unreachable — the window between click and result becomes a silent no-op, and the confirm
    // button is no longer `disabled` for it, so the action can fire twice.
    startTransition(async () => {
      try {
        const result = await revokeCredentialAction(slug, kind, keyId)
        if (!result.ok) {
          // Not an error — "already revoked, or not yours". Said in those words rather than reported
          // as a failure that did not happen.
          setError(result.error ?? 'That key was already revoked.')
          setOpen(false)
          setBusy(false)
          return
        }
      } catch {
        setError('Could not revoke that key. It is still active — reload and try again.')
        setOpen(false)
        setBusy(false)
        return
      }
      // A full reload rather than local state: revoking changes what this page's server-rendered
      // count and rows say, and two sources of truth for "what has access" is how a screen ends up
      // listing a credential that was killed.
      window.location.reload()
    })
  }

  return (
    <>
      <button
        type="button"
        className="ds-kebab"
        onClick={() => setOpen(true)}
        disabled={inFlight}
        // The kebab is three drawn dots with no text, so the accessible name has to say WHICH row it
        // acts on — "More actions" on four rows is four identically-named controls.
        aria-label={`Revoke ${label === '' ? 'this untitled key' : label}`}
      >
        <Icon name="settings" size={14} />
      </button>
      {error && (
        <span className="ds-row-alert" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={open}
        verb="Revoke"
        noun={credentialTitle(kind).toLowerCase()}
        subject={label === '' ? 'untitled' : label}
        consequence={CONSEQUENCE[kind]}
        details="Revoking cannot be undone, and it takes effect on the next request — no deploy. Create a new key instead of trying to restore this one."
        pending={inFlight}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  )
}
