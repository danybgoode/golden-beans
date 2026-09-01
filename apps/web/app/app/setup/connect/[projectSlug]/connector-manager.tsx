'use client'
import { useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CopyField } from '@/design-system/copy-field'
import { Callout, Field, ShownOnce, Step, Steps } from '@/design-system/primitives'
import type { ActiveConnector } from '@/lib/connector-tokens'
import { mintConnectorAction, revokeConnectorAction } from './actions'

// Setup › Connect — the interactive half.
//
// The status sentence and the teaching card are server-rendered; this island exists for the two
// mutations, the one-time reveal and the copy button.
//
// ── design-system-rails · Sprint 4, Story 4.4 — the page TEACHES, then hands over the control ──
// The credential half shipped and shipped well: the status, the multi-token warning, and the
// server-side filtering of `tokens` before they cross the client boundary. **All of it is kept**
// (sprint contract #9) — a member must not be able to read a bearer URL out of View Source, and that
// is a property of where the filter happens, not of what this component renders.
//
// What was missing is the other half of reference state `setup-connect`: the URL in a mono field
// with a Copy button, and a NUMBERED three-step card ending in `Add to Claude ↗`. The page was a
// credential screen with the steps written as a sentence underneath; the design makes setup a task.

const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

export function ConnectorManager({
  slug,
  tokens,
  hasConnector,
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
   * therefore unrevocable — a credential you cannot see is a credential you cannot revoke.
   */
  tokens: readonly ActiveConnector[]
  /**
   * Whether a connector exists at all — supplied separately, and it must be.
   *
   * `tokens` is filtered on the SERVER by `canManage`, so a member receives `[]` and the plaintext
   * URL never enters the RSC payload. That means "does one exist" can no longer be derived from
   * `tokens.length`; a member would see "no connector yet" when there is one.
   */
  hasConnector: boolean
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
    // ⚠️ The dialog is NOT closed here. Closing it synchronously before `startTransition` made its
    // `pending` prop inert — the dialog was already gone by the time `pending` flipped, so a slow
    // revoke showed no feedback at all and invited a second click on a control that had already
    // fired. It stays open, showing its own pending state, until the action resolves.
    startTransition(async () => {
      // The `try` matters. With the synchronous close gone, the only paths that closed the dialog
      // were "the action returned `ok: false`" and "the page reloaded". A REJECTED action — the POST
      // failing mid-flight, wifi dropping — ran neither: `pending` fell back to false and the dialog
      // sat open showing an armed Revoke button with no explanation.
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
    <>
      {/* ⚠️ **The value is shown ONCE, on its own, and this is that screen** (sprint contract #7).
          It is gold-bordered because it is the only thing here a reader cannot get back by
          reloading — the token is stored plaintext for serving, but nothing re-reveals it to a
          browser after this render. */}
      {minted && (
        <ShownOnce
          title="Copy this now — it is not shown again"
          body="It is a bearer credential: anyone holding the URL can read this project's data through it, so treat it like a password and revoke it if it leaks."
        >
          <CopyField value={minted} label="Copy your new connector URL" />
        </ShownOnce>
      )}

      {/* ⚠️ THE URL IS OWNER-ONLY. A member sees that a connector exists, not what it is, and the
          filtering happens on the SERVER — see the page. The failure scenario is the convincing
          part: this token is durable and is NOT revoked by a membership change, so a member could
          copy it, be removed from `project_members`, and keep full read access to the project's
          funnels, North Star and experiments over MCP indefinitely — with nothing in `audit_log`
          recording that they ever saw it, and no way for them to revoke it themselves. */}
      {!canManage && hasConnector && (
        <Callout>
          A connector URL exists for this project. Ask an owner for it — the URL itself is a bearer credential
          that keeps working after someone leaves the project, so only owners see it here.
        </Callout>
      )}

      {canManage &&
        tokens.map((token) => (
          <Field
            key={token.tokenId}
            label={`Your connector URL · ${slug}`}
            hint="Read-only and revocable. Revoke the token and access stops — no deploy. Switching project in the top bar switches this URL."
          >
            {/* Skipped when this is the one just minted: the reveal above already shows it, and two
                identical copy fields would read as two different credentials. */}
            {token.url !== minted && <CopyField value={token.url} label="Copy this connector URL" />}
            <p>
              {/* No inner `canManage` here: the map itself is owner-only. A redundant guard reads as
                  a second, weaker condition that someone could later relax on its own. */}
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => setConfirming(token.tokenId)}
                disabled={pending}
              >
                Revoke this URL
              </button>
            </p>
            <ConfirmDialog
              open={confirming === token.tokenId}
              /* `verb` matches the button that opened this, unchanged — a control's name must not
                 change mid-flow. */
              verb="Revoke"
              noun="connector URL"
              /* The SPECIFIC object. A connector URL has no label, so the project plus the token's
                 own tail identifies it — with two active URLs on screen, the project alone would not
                 say WHICH one is about to be killed. */
              subject={`${slug} · …${token.url.slice(-8)}`}
              /* What STOPS WORKING, in plain words, not a restatement of the verb. */
              consequence="Any agent using this URL stops being able to read this project immediately — no deploy needed."
              details="Rotating means creating a new URL afterwards and pasting it into Claude again."
              pending={pending}
              onConfirm={() => onRevoke(token.tokenId)}
              onCancel={() => setConfirming(null)}
            />
          </Field>
        ))}

      {error && <Callout tone="warn">{error}</Callout>}

      {canManage && canMint && !minted && (
        <p>
          <button type="button" className="ds-btn ds-btn--primary" onClick={onMint} disabled={pending}>
            {pending ? 'Creating…' : 'Create a connector URL'}
          </button>
        </p>
      )}

      {/* ── The teaching half — reference state `setup-connect`, the numbered three-step card ────
          ⚠️ Gated on `canManage && hasAny`, and both halves matter. This copy says "paste the URL
          above into it", and a MEMBER has no URL above — the page would be telling them to do
          something it had just made impossible. Without a token there is nothing to paste at all. */}
      {canManage && hasAny && (
        <div className="ds-card">
          <span className="ds-label">Three steps</span>
          <Steps>
            <Step>
              <b>Copy the URL above.</b>
            </Step>
            <Step
              note={
                // The modal takes no URL parameter — verified against the shipped install panel — so
                // the flow is copy-then-paste and this link cannot pre-fill it. Saying so is better
                // than a reader assuming the button did something it did not.
                'The button opens Claude’s connector dialog. It cannot be pre-filled from a link, so paste the URL yourself.'
              }
            >
              <b>Open Claude&apos;s connector settings.</b>
              <span className="ds-step-action">
                {/* ⚠️ The design's `Add to Claude ↗`, and the arrow is an `<Icon>`, not the glyph.
                    `check-design-drift.mjs` bans `↗` inside `/app`, and epic F1's answer is
                    explicitly "render it as `<Icon name="external" />`" — never widen the rule, never
                    add an exemption, never disable the guard. */}
                <a
                  className="ds-btn ds-btn--primary"
                  href={ADD_TO_CLAUDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Claude
                  <Icon name="external" size={13} />
                </a>
              </span>
            </Step>
            <Step>
              <b>Paste it into the dialog and save.</b> Claude can then read this project&apos;s funnels,
              features and North Star.
            </Step>
          </Steps>
        </div>
      )}
    </>
  )
}
