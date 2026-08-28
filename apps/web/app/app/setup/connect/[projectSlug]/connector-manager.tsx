'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyUrlField } from '@/components/landing/CopyUrlField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ActiveConnector } from '@/lib/connector-tokens'
import { mintConnectorAction, revokeConnectorAction } from './actions'

// console-ia-overhaul · Sprint 2, Story 2.1 — the only interactive part of Setup › Connect.
//
// The URL, the status sentence and the docs link are all server-rendered; this island exists for the
// two mutations and the one-time reveal. Same shape as the credential managers next door.

const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

export function ConnectorManager({
  slug,
  tokens,
  canManage,
  canMint,
}: {
  slug: string
  /**
   * EVERY active connector token, resolved server-side and never derived from the address bar.
   *
   * A LIST rather than one, and that is the fix for a race rather than generality for its own sake.
   * `mintConnectorToken` is a check-then-act with no unique index behind it, so two concurrent mints
   * can both succeed. Rendering only the newest would leave the other one live, invisible and
   * therefore unrevocable — a credential you cannot see is a credential you cannot revoke. Each gets
   * its own revoke control instead. (Cross-review, agy, PR #123, Blocking.)
   */
  tokens: readonly ActiveConnector[]
  canManage: boolean
  /** False when a token already exists AND when the state could not be read — see the page. */
  canMint: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The plaintext, held for exactly this render. Never read back from the server afterwards.
  const [minted, setMinted] = useState<string | null>(null)
  // The row id awaiting confirmation, or null. Keyed by id rather than a boolean, because there can
  // legitimately be more than one revocable token on screen.
  const [confirming, setConfirming] = useState<string | null>(null)

  function onMint() {
    setError(null)
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof mintConnectorAction>>
      try {
        result = await mintConnectorAction(slug)
      } catch {
        // Same reasoning as revoke below: a rejected action left the button spinning back to idle
        // with no message, which reads as "nothing happened" when the truth is "we do not know".
        setError('Could not reach the server. Check your connection and retry.')
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMinted(result.url)
    })
  }

  function onRevoke(tokenId: string) {
    setError(null)
    // ⚠️ The dialog is NOT closed here, and that is agy's finding (PR #123). Closing it
    // synchronously before `startTransition` made its `pending` prop inert — the dialog was already
    // gone by the time `pending` flipped, so a slow revoke showed no feedback at all and invited a
    // second click on a control that had already fired.
    //
    // It stays open, showing its own pending state, until the action resolves: success reloads the
    // page (which unmounts everything), failure closes it and renders the error. The close is a
    // consequence of the OUTCOME now, not of the click.
    startTransition(async () => {
      // The `try` matters, and its absence was a nit worth taking. With the synchronous close gone
      // (so `pending` can render), the only paths that closed the dialog were "the action returned
      // `ok: false`" and "the page reloaded". A REJECTED action — the POST failing mid-flight, wifi
      // dropping — ran neither: `pending` fell back to false and the dialog sat open showing an
      // armed Revoke button with no explanation.
      let result: { ok: boolean }
      try {
        result = await revokeConnectorAction(slug, tokenId)
      } catch {
        setConfirming(null)
        setError('Could not reach the server to revoke that URL. Check your connection and retry.')
        return
      }
      if (!result.ok) {
        setConfirming(null)
        setError('Could not revoke that connector URL. Reload and try again.')
        return
      }
      // A full reload rather than local state: revoking changes what the page's server-rendered
      // status sentence says, and two sources of truth for "is there a connector" is how a screen
      // ends up claiming one exists after it was killed.
      window.location.reload()
    })
  }

  const hasAny = minted !== null || tokens.length > 0

  return (
    <div className="stack">
      {minted && (
        <>
          <p role="status" className="reveal-note">
            <strong>Copy this now.</strong> This is the only time it is shown. It is a bearer credential:
            anyone holding the URL can read this project&apos;s data through it, so treat it like a password
            and revoke it if it leaks.
          </p>
          <CopyUrlField url={minted} />
        </>
      )}

      {/* ⚠️ THE URL IS OWNER-ONLY. A member sees that a connector exists, not what it is.
          (Fresh reviewer, PR #123, Should-fix — and the failure scenario is the convincing part.)
          A previous revision rendered the URL to every member, reasoning that a member can read the
          dashboards anyway so the capability is no wider. That holds only for SESSION-scoped access.
          This token is durable and is not revoked by a membership change: a member could copy it, be
          removed from `project_members`, and keep full read access to the project's funnels, North
          Star and experiments over MCP indefinitely — with nothing in `audit_log` recording that
          they ever saw it, and no way for them to revoke it themselves.
          Every other credential in this product is hashed and shown exactly once, to an owner. This
          one is re-displayed on every page load, so its audience is the thing to bound. */}
      {!canManage && tokens.length > 0 && (
        <p role="status" className="data-table__count">
          A connector URL exists for this project. Ask an owner for it — the URL itself is a bearer credential
          that keeps working after someone leaves the project, so only owners see it here.
        </p>
      )}

      {canManage &&
        tokens.map((token) => (
          <div key={token.tokenId} className="stack-sm">
            {/* Skipped when this is the one just minted: the reveal above already shows it, and two
              identical copy fields would read as two different credentials. */}
            {token.url !== minted && <CopyUrlField url={token.url} />}
            {/* No inner `canManage` here: the map itself is owner-only (S2 made the URL
                owner-only, not just the controls). A redundant guard reads as a second,
                weaker condition that someone could later relax on its own. */}
            <p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming(token.tokenId)}
                disabled={pending}
              >
                Revoke this URL
              </Button>
            </p>
            <ConfirmDialog
              open={confirming === token.tokenId}
              /* `verb` matches the button that opened this, unchanged — the component requires it,
               because a control's name must not change mid-flow. */
              verb="Revoke"
              noun="connector URL"
              /* The SPECIFIC object. A connector URL has no label, so the project plus the token's
               own tail identifies it — with two active URLs on screen, the project alone would
               not say WHICH one is about to be killed. */
              subject={`${slug} · …${token.url.slice(-8)}`}
              /* What STOPS WORKING, in plain words, not a restatement of the verb. */
              consequence="Any agent using this URL stops being able to read this project immediately — no deploy needed."
              details="Rotating means creating a new URL afterwards and pasting it into Claude again."
              pending={pending}
              onConfirm={() => onRevoke(token.tokenId)}
              onCancel={() => setConfirming(null)}
            />
          </div>
        ))}

      {/* `canManage &&` is the S9 fix. `hasAny` is true for a MEMBER whose project has a token — and
          this block's copy says "paste the URL above into it", with nothing above, because S2
          deliberately withholds the URL from members. The page was telling them to do something it
          had just made impossible (fresh reviewer, PR #123). A member with no URL has nothing to add
          to Claude. */}
      {canManage && hasAny && (
        <>
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
      )}

      {error && (
        <p role="alert" className="auth-form__message auth-form__message--error">
          {error}
        </p>
      )}

      {canManage && canMint && !minted && (
        <p>
          <Button type="button" onClick={onMint} disabled={pending}>
            {pending ? 'Creating…' : 'Create a connector URL'}
          </Button>
        </p>
      )}
    </div>
  )
}
