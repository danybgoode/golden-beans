'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { ShareRow } from '@/lib/report-shares'
import { POD_REPORT_LENSES, lensPolicy, type PodReportLens } from '@/lib/pod-report-lens'
import { CopyField } from '@/design-system/copy-field'
import {
  Callout,
  Card,
  Col,
  Empty,
  Field,
  ListCard,
  ListHead,
  Pill,
  Row,
  RowMain,
  ShownOnce,
  Tag,
} from '@/design-system/primitives'
import { mintShareAction, revokeShareAction } from './actions'

// Setup › Share links — mint, list, revoke.
//
// ── design-system-rails · Sprint 4, Story 4.6 ─────────────────────────────────────────────────
// This shipped as bare markup: a `<fieldset>` of radios, three unstyled `<label>`s and a raw
// `<table>` with a `colSpan` empty row. It was the last surface in Setup rendering nothing from any
// system at all, and it is a CREDENTIAL surface — a share link is a bearer token that renders this
// project's Pod Report to whoever holds the URL.
//
// It now renders from `apps/web/design-system/`: the same rows, the same pills, the same one-time
// reveal and the same copy field as Setup › Keys, so an operator who has revoked a key already knows
// how to kill a link. That was the stated intent of the original file; it is true of the pixels now
// rather than only of the data model.
//
// ── Its own `formatUtc` is GONE ───────────────────────────────────────────────────────────────
// A four-line private copy, written to avoid `toLocaleString()`'s hydration mismatch (the server
// formats in its zone, the browser in the reader's — caught by both cross-review families). The
// reasoning was right and the seam already exists: `lib/format-utc.ts` does the same thing and
// additionally returns a readable string where the copy threw a RangeError on a bad timestamp.

const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: 'Until revoked', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

/**
 * A link's state, as three facts rather than two.
 *
 * ⚠️ An EXPIRED link is dead but was never revoked, and collapsing it into "active" would tell an
 * operator a link is live when it is not — the same class of mistake as a broken read rendering as an
 * empty one. Revoked rows are still LISTED here, unlike credentials on Setup › Keys: a share link's
 * whole risk is that somebody out there has the URL, and the record of having killed it is what an
 * owner is looking for when they come back to check.
 */
function stateOf(share: ShareRow): { state: 'on' | 'off' | 'never'; label: string; detail: string } {
  if (share.revokedAt !== null) {
    return { state: 'off', label: 'Revoked', detail: `revoked ${formatUtc(share.revokedAt)}` }
  }
  if (share.expiresAt !== null && new Date(share.expiresAt) <= new Date()) {
    return { state: 'never', label: 'Expired', detail: `expired ${formatUtc(share.expiresAt)}` }
  }
  return { state: 'on', label: 'Live', detail: 'anyone with the URL can open it' }
}

export function ShareManager({
  slug,
  shares,
  enabled,
}: {
  slug: string
  shares: ShareRow[]
  enabled: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lens, setLens] = useState<PodReportLens>('investor')
  const [label, setLabel] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  const [minted, setMinted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // React 18's `isPending` clears before an async transition callback's first await resolves, so
  // minting holds its own flag. A second click issues a second live bearer token.
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const inFlight = busy || pending

  function onMint(event: FormEvent) {
    event.preventDefault()
    const trimmed = label.trim()
    if (trimmed === '') {
      setFieldError('Give the link a label, so you know which conversation it belongs to.')
      return
    }
    setError(null)
    setFieldError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await mintShareAction(slug, lens, trimmed, expiryDays)
        if (result.ok) {
          setMinted(result.url)
          setLabel('')
          setOpen(false)
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not reach the server. Reload and check whether the link was created.')
      }
      setBusy(false)
    })
  }

  function onRevoke(shareId: string) {
    setError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const { ok } = await revokeShareAction(slug, shareId)
        if (!ok) setError('That link was already revoked.')
      } catch {
        setError('Could not revoke that link. It is still live — reload and try again.')
      }
      setConfirming(null)
      setBusy(false)
      router.refresh()
    })
  }

  return (
    <>
      {/* Dark-by-default is a design decision, not an outage — but an owner who mints a link, opens
          it and gets a 404 has no way to tell those apart. Saying so up front is the difference. */}
      {!enabled && (
        <Callout tone="warn">
          <b>Share links are currently switched off for this deployment.</b> You can create links now, but
          they will return 404 until <code>REPORT_SHARES_ENABLED</code> is turned on.
        </Callout>
      )}

      {/* ⚠️ The URL is shown ONCE, on a screen of its own — the same rule Setup › Keys follows, and
          for the same reason: only its hash is stored, so nothing can show it again. */}
      {minted && (
        <ShownOnce
          title="Copy this link now — it is not shown again"
          body={
            <>
              Anyone with this URL can read the report through the <b>{lens}</b> lens. There is no password on
              it — revoke it here when the conversation is over.
            </>
          }
        >
          <CopyField value={minted} label="Copy your new share link" />
          <p className="ds-once-actions">
            <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setMinted(null)}>
              I&apos;ve saved it
            </button>
          </p>
        </ShownOnce>
      )}

      {open && (
        <Card>
          <form onSubmit={onMint}>
            {/* ── Audience ────────────────────────────────────────────────────────────────────
                A pick list, not a `<fieldset>` of bare radios: the choice is what the link WILL
                SHOW, and each option's consequence is the sentence under it. `aria-pressed` paints
                the selection and announces it — one attribute, so the two cannot disagree. */}
            <Field
              label="Who is this for"
              hint="Every lens keeps the report's caveats and its “not instrumented” rows — a narrower lens shows less detail, never less honesty."
            >
              <div className="ds-picklist">
                {POD_REPORT_LENSES.map((candidate) => (
                  <button
                    type="button"
                    key={candidate}
                    className="ds-pick"
                    aria-pressed={lens === candidate}
                    onClick={() => setLens(candidate)}
                  >
                    <span className="ds-pick-title">{candidate}</span>
                    <span className="ds-pick-detail">{lensPolicy(candidate).audienceNote}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="When it expires">
              <span className="ds-select">
                <select
                  value={expiryDays === null ? '' : String(expiryDays)}
                  onChange={(event) =>
                    setExpiryDays(event.target.value === '' ? null : Number(event.target.value))
                  }
                  aria-label="When it expires"
                >
                  {EXPIRY_CHOICES.map((choice) => (
                    <option key={choice.label} value={choice.days === null ? '' : String(choice.days)}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </span>
            </Field>

            <Field
              label="What to call it"
              controlId="new-share-label"
              hint="For you, not for the reader. “Series-A data room”, “Acme quarterly review” — whatever tells you which link to kill when the conversation ends."
              error={fieldError}
            >
              {(control) => (
                <input
                  {...control}
                  className="ds-input"
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value)
                    if (fieldError) setFieldError(null)
                  }}
                  maxLength={120}
                />
              )}
            </Field>

            {error && <Callout tone="warn">{error}</Callout>}

            <p className="ds-mint-actions">
              <button type="submit" className="ds-btn ds-btn--primary" disabled={inFlight}>
                {inFlight ? 'Creating…' : 'Create the share link'}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => {
                  setOpen(false)
                  setFieldError(null)
                }}
                disabled={inFlight}
              >
                Cancel
              </button>
            </p>
          </form>
        </Card>
      )}

      {!open && (
        <p className="ds-mint-actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => setOpen(true)}>
            + New share link
          </button>
        </p>
      )}

      {error && !open && <Callout tone="warn">{error}</Callout>}

      {shares.length === 0 ? (
        <div className="ds-listcard">
          <Empty
            title="No share links yet"
            body="A share link renders this project's Pod Report at a public URL, through one audience lens — so somebody with no account here can read it. Create one when you have a conversation that needs it."
          />
        </div>
      ) : (
        <ListCard label="Share links">
          <ListHead>
            <Col header>Shows</Col>
            <Col header width="state">
              Scope
            </Col>
            <Col header width="meta">
              Expires · created
            </Col>
            <Col header width="act">
              <span className="ds-visually-hidden">Actions</span>
            </Col>
          </ListHead>
          {shares.map((share) => {
            const status = stateOf(share)
            return (
              <Row key={share.id}>
                <RowMain
                  mono={false}
                  title={share.label === '' ? 'untitled' : share.label}
                  description={`${lensPolicy(share.lens).audienceNote} ${status.detail}`}
                />
                <Col width="state">
                  <Pill state={status.state}>{status.label}</Pill>
                  <span className="ds-state-detail" title={`${share.lens} lens`}>
                    {share.lens} lens
                  </span>
                </Col>
                <Col width="meta">
                  <Tag>{share.expiresAt === null ? 'No expiry' : formatUtc(share.expiresAt)}</Tag>
                  <span className="ds-note">Made {formatUtc(share.createdAt)}</span>
                </Col>
                <Col width="act">
                  {share.revokedAt === null && (
                    <>
                      <button
                        type="button"
                        className="ds-btn ds-btn--secondary ds-btn--sm"
                        onClick={() => setConfirming(share.id)}
                        disabled={inFlight}
                      >
                        Revoke
                      </button>
                      {/* ⚠️ A NATIVE confirm, not `ConfirmDialog`, and the reason is a real one: a
                          `<dialog>` per row would mount one modal per share link, and the row's own
                          `overflow` clips a positioned child. The list's own `ConfirmDialog` usage on
                          Setup › Keys renders ONE dialog because the trigger is a kebab in a cell
                          whose island owns it. This surface's revoke is inline, so the confirmation
                          is inline too — it names the specific link and what stops working, which is
                          the property the component exists to guarantee rather than its markup. */}
                      {confirming === share.id && (
                        <span className="ds-row-alert" role="alert">
                          Revoke <b>{share.label === '' ? 'this link' : share.label}</b>? Anyone holding the
                          URL stops being able to open the report immediately — no deploy. This cannot be
                          undone.{' '}
                          <button
                            type="button"
                            className="ds-btn ds-btn--primary ds-btn--sm"
                            onClick={() => onRevoke(share.id)}
                            disabled={inFlight}
                          >
                            {inFlight ? 'Working…' : 'Revoke it'}
                          </button>{' '}
                          <button
                            type="button"
                            className="ds-btn ds-btn--secondary ds-btn--sm"
                            onClick={() => setConfirming(null)}
                            disabled={inFlight}
                          >
                            Keep it
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </Col>
              </Row>
            )
          })}
        </ListCard>
      )}
    </>
  )
}
