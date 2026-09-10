'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { ShareRow } from '@/lib/report-shares'
import { POD_REPORT_LENSES, lensPolicy, type PodReportLens } from '@/lib/pod-report-lens'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CopyField } from '@/design-system/copy-field'
import {
  Answer,
  Callout,
  Col,
  Empty,
  Field,
  ListCard,
  ListHead,
  PageHead,
  Pill,
  Row,
  RowMain,
  ShownOnce,
  Tag,
} from '@/design-system/primitives'
import { NewThingDialog } from '@/components/product/NewThingDialog'
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
  if (share.expiresAt !== null) {
    const at = new Date(share.expiresAt).getTime()
    // ⚠️ **An UNPARSEABLE expiry is not "Live"** (cross-family review, agy). `new Date('nonsense')
    // <= new Date()` is `false`, so a malformed timestamp fell through to the live branch and the
    // page told an owner the link was serving — about a row it could not read. `isCurrentlyUsable`
    // in `credential-inventory.ts` handles the same case explicitly and errs toward showing access,
    // which is right here too: we cannot prove the link is dead. What must not happen is claiming
    // certainty. So it still counts as live and SAYS the expiry could not be read.
    if (Number.isNaN(at)) {
      return { state: 'on', label: 'Live', detail: 'its expiry could not be read — check this one' }
    }
    if (at <= Date.now()) {
      return { state: 'never', label: 'Expired', detail: `expired ${formatUtc(share.expiresAt)}` }
    }
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
  const [lens, setLens] = useState<PodReportLens>('investor')
  const [label, setLabel] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  const [minted, setMinted] = useState<string | null>(null)
  // ⚠️ **TWO error slots, not one** (cross-agent review, Codex, Should-fix). They were one, rendered
  // in two places — inside the mint form and again in the body — and while the dialog was open a
  // single failure appeared twice. The body's copy used to be gated on `!open`, and that guard went
  // when the dialog took ownership of its own open state (Story 4.2).
  //
  // Splitting rather than re-adding a guard: these are two different failures with two different
  // readers. A mint that failed belongs beside the form that failed, inside the dialog; a revoke
  // that failed belongs beside the list it was aimed at. One state could only ever render in one of
  // those places, which would put a revoke error inside a mint dialog or the reverse.
  const [mintError, setMintError] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // React 18's `isPending` clears before an async transition callback's first await resolves, so
  // minting holds its own flag. A second click issues a second live bearer token.
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<ShareRow | null>(null)
  const inFlight = busy || pending

  function onMint(event: FormEvent) {
    event.preventDefault()
    const trimmed = label.trim()
    if (trimmed === '') {
      setFieldError('Give the link a label, so you know which conversation it belongs to.')
      return
    }
    setMintError(null)
    setFieldError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await mintShareAction(slug, lens, trimmed, expiryDays)
        if (result.ok) {
          // ⚠️ **No `setOpen(false)` — setting `minted` is what closes the dialog.** The trigger is
          // rendered only while `minted === null` (see the head below), so a successful mint
          // unmounts `NewThingDialog` and the modal goes with it, revealing the shown-once URL
          // underneath. One condition decides both, which is why they cannot disagree about whether
          // a bearer token is on screen.
          setMinted(result.url)
          setLabel('')
          router.refresh()
        } else setMintError(result.error)
      } catch {
        setMintError('Could not reach the server. Reload and check whether the link was created.')
      }
      setBusy(false)
    })
  }

  function onRevoke(shareId: string) {
    setRevokeError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const { ok } = await revokeShareAction(slug, shareId)
        if (!ok) setRevokeError('That link was already revoked.')
      } catch {
        setRevokeError('Could not revoke that link. It is still live — reload and try again.')
      }
      setConfirming(null)
      setBusy(false)
      router.refresh()
    })
  }

  // ⚠️ **The mint FORM, unchanged, hoisted so the head can carry it (Story 4.2, epic D8).** Every
  // field, every hint and every validation is the one that shipped — the wizard shape wraps the
  // existing manager rather than a rewrite of it, which is the whole rule D8 states: "the capability
  // IS the component, and rewriting it is how a capability quietly changes shape."
  //
  // The dialog owns whether it is open, so `open`/`setOpen` are gone from this component; what is
  // left is the form's own state, which is where it always was.
  const mintForm = (
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

      {/* The control takes its name from the FIELD's `<label for>`, not from an `aria-label`
          of its own — two strings for one name is two strings that drift, and the one a screen
          reader hears would be the one nobody proofreads. */}
      <Field label="When it expires" controlId="new-share-expiry">
        {(control) => (
          <span className="ds-select">
            <select
              {...control}
              value={expiryDays === null ? '' : String(expiryDays)}
              onChange={(event) =>
                setExpiryDays(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.label} value={choice.days === null ? '' : String(choice.days)}>
                  {choice.label}
                </option>
              ))}
            </select>
          </span>
        )}
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

      {/* The MINT failure, beside the form that failed — inside the dialog. */}
      {mintError && <Callout tone="warn">{mintError}</Callout>}

      <p className="ds-mint-actions">
        <button type="submit" className="ds-btn ds-btn--primary" disabled={inFlight}>
          {inFlight ? 'Creating…' : 'Create the share link'}
        </button>
        {/* ⚠️ **No `Cancel` button — the dialog already has three ways out** (its `✕`, Escape and a
            backdrop click, all in `NewThingDialog`), and a fourth that this form cannot actually
            perform would be a control that does nothing: the dialog owns whether it is open, and
            nothing inside it can close it. A button that looks like it dismisses and does not is
            worse than no button (Story 4.1's own rule, one surface over). */}
      </p>
    </form>
  )

  return (
    <>
      {/* ── mockups-as-built · Story 4.2 — THE HEAD MOVED IN HERE, and the mint control with it ───
          The approved `setup-shares` state is `head → answer → list`, and its head carries a primary
          action reading exactly `+ New share link`. The page rendered that control as a `<p>` between
          the answer and the list — a `note` block the design does not draw — and its head drew no
          action at all, so the contract reported three differences for one cause.

          The head lives in this component for the reason `keys-surface.tsx` gives one file over: the
          trigger, the form and the revealed value share ONE piece of state (is a credential on screen
          right now?), and a trigger in the page with the state here would be two places that have to
          agree about it. */}
      <PageHead
        title="Share links"
        lede={
          <>
            A link that shows one thing to somebody who has no account here. It is a bearer token: anyone
            holding the URL can read the report, so treat it like a password and revoke it when the
            conversation ends — revocation takes effect on the next request, no deploy.
          </>
        }
        /* ⚠️ No trigger while a freshly-minted URL is on screen. A `+ New share link` button beside an
           unsaved bearer token invites a second mint before the first is copied — the same rule
           `keys-surface.tsx` follows for the same reason. */
        actions={
          minted === null ? (
            <NewThingDialog
              /* The approved state's label, character for character — the structural gate compares
                 the words (epic D2). */
              label="+ New share link"
              title="New share link"
              lede="Who it is for, what it shows, and when it stops working."
            >
              {mintForm}
            </NewThingDialog>
          ) : undefined
        }
      />
      <Answer>
        <b>Also reachable as “Share this” from any report</b> — which is where you will actually want it. This
        page is for seeing every link that exists, and killing one.
      </Answer>

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

      {/* The REVOKE failure, beside the list it was aimed at. A revoke error inside a mint dialog
          would be a message about a link the reader is not looking at. */}
      {revokeError && <Callout tone="warn">{revokeError}</Callout>}

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
              Expires · opens
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
                  {/* ⚠️ **Times OPENED, never people** — mockups-as-built Story 4.2, and the unit is
                      the whole point. A bearer URL can be forwarded to a room full of people from
                      one email, so "opened N times" is the only honest reading; "N visitors" would
                      be a number that reads as an audience and is not one.

                      Zero is a real answer here and is written as words rather than as a bare `0`:
                      the column also carries the created date, and "0 · Made 2026-09-01" invites the
                      reader to compute a rate out of two numbers that do not support one. */}
                  <span className="ds-note">
                    {share.opens === 0
                      ? 'Not opened yet'
                      : `Opened ${share.opens.toLocaleString('en-US')} time${share.opens === 1 ? '' : 's'}`}{' '}
                    · made {formatUtc(share.createdAt)}
                  </span>
                </Col>
                <Col width="act">
                  {share.revokedAt === null && (
                    <button
                      type="button"
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      onClick={() => setConfirming(share)}
                      disabled={inFlight}
                      // The name says WHICH link — "Revoke" on six rows is six identically-named
                      // controls, and a screen-reader user picking one from a list hears only the
                      // name.
                      aria-label={`Revoke ${share.label === '' ? 'this untitled link' : share.label}`}
                    >
                      Revoke
                    </button>
                  )}
                </Col>
              </Row>
            )
          })}
        </ListCard>
      )}

      {/* ⚠️ **ONE `ConfirmDialog` for the whole list, and it replaced an inline confirmation.**
          The first draft asked the question inside the row — which meant this surface used a
          different confirmation pattern from Setup › Keys next door, and
          `app-component-kit-adoption`'s D5 is that the product ships exactly ONE. Two patterns for
          one job is the thing that rule was written about.
          One dialog rather than one per row for the reason `ConfirmDialog` states: it must stay
          mounted when it closes, because native `close()` is what restores focus to the control that
          opened it. */}
      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun="share link"
        subject={confirming === null || confirming.label === '' ? 'untitled' : confirming.label}
        consequence="Anyone holding the URL stops being able to open the report immediately — no deploy. The link is dead, not paused."
        details="Revoking cannot be undone. Create a new link if the conversation is still going."
        pending={inFlight}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming !== null && onRevoke(confirming.id)}
      />
    </>
  )
}
