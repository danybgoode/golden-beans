'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatUtc } from '@/lib/format-utc'
import {
  credentialTitle,
  formatExpiry,
  type CredentialKind,
  type CredentialRow,
} from '@/lib/credential-inventory'
import { Col, ListCard, ListHead, Pill, Row, RowMain, Tag } from '@/design-system/primitives'
import { revokeCredentialAction } from './actions'

// design-system-rails · Sprint 4, Story 4.5 — the credential list, and the ONE dialog behind it.
//
// ── Why the list is a client component, when the first draft made only the row menu one ───────
// ⚠️ **A `ConfirmDialog` per row is a `<dialog>` per row.** The first version kept the list on the
// server and gave each row its own island holding its own dialog; with four credentials that is four
// `<dialog class="confirm-dialog">` elements in the DOM, three of them inert. It looked right, and
// the browser run said otherwise — `locator('dialog.confirm-dialog')` resolved to four elements
// across three suites. That is not a test problem: `app-component-kit-adoption`'s D5 is that this
// product has ONE confirmation, and N of them is N chances for the wrong one to be open.
//
// Rendering the dialog only while open was the other candidate and is worse. `ConfirmDialog`'s own
// comment records why: unmounting the `<dialog>` means native `close()` never runs, the browser
// never performs its focus restoration, and a keyboard user is left on `<body>` with no way back to
// the row they were operating on — a Blocking cross-review finding with a spec of its own.
//
// So the list is the island, and it holds one dialog for every row. The WORDS are still in a source
// file the merge gate reads (`lib/flag-vocabulary-surfaces.test.ts` scans this file), which was the
// only thing the server-rendered version bought.
//
// ── The confirmation names what STOPS WORKING ─────────────────────────────────────────────────
// Never "Are you sure?". Each kind's consequence is genuinely different, which is why they are
// written out rather than templated from the kind's name.

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

export function KeysList({ slug, rows }: { slug: string; rows: CredentialRow[] }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<CredentialRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending

  function onConfirm(row: CredentialRow) {
    setError(null)
    setBusy(true)
    // ⚠️ The dialog stays OPEN across the transition and closes when the action settles. Clearing it
    // first hides the dialog the instant Confirm is clicked, which makes its `pending` state
    // unreachable — the window between click and result becomes a silent no-op, and the confirm
    // button is no longer `disabled` for it, so the action can fire twice.
    startTransition(async () => {
      try {
        const result = await revokeCredentialAction(slug, row.kind, row.id)
        if (!result.ok) {
          // Not an error — "already revoked, or not yours". Said in those words rather than reported
          // as a failure that did not happen.
          setError(result.error ?? 'That key was already revoked.')
          setConfirming(null)
          setBusy(false)
          return
        }
      } catch {
        setError('Could not revoke that key. It is still active — reload and try again.')
        setConfirming(null)
        setBusy(false)
        return
      }
      // ⚠️ `router.refresh()`, not `window.location.reload()` (cross-family review, agy). Both
      // re-run the SERVER render, which is the property the reload was chosen for — this page must
      // never hold a second source of truth for "what has access". What the reload additionally did
      // was throw away the whole client tree and flash the page, and it made this surface behave
      // differently from Share links next door, which already used `refresh()`. One pattern.
      //
      // The action calls `revalidatePath` first, so the refresh re-fetches rather than re-rendering
      // a cached tree.
      setConfirming(null)
      setBusy(false)
      router.refresh()
    })
  }

  return (
    <>
      {error && (
        <p className="ds-row-alert" role="alert">
          {error}
        </p>
      )}
      <ListCard label="Credentials with access to this project">
        <ListHead>
          <Col header>Key</Col>
          <Col header width="state">
            What it may do
          </Col>
          <Col header width="meta">
            Where · expires
          </Col>
          {/* ⚠️ **Visually empty, and NOT semantically empty.** The design leaves this header blank —
              a label reading "Actions" over three dots tells a reader nothing they did not already
              know. But a `columnheader` with no accessible name is a column a screen-reader user
              cannot identify at all, so the word is there and hidden from the eye. Dropping the
              header instead would leave a four-cell row in a three-column table, which is the
              positional-announcement bug the feature list paid two rounds for. */}
          <Col header width="act">
            <span className="ds-visually-hidden">Actions</span>
          </Col>
        </ListHead>
        {rows.map((row) => (
          <Row key={`${row.kind}:${row.id}`}>
            {/* `mono={false}`: a credential's label is something a person typed, not an identifier.
                The feature list's keys are mono for the opposite reason. */}
            <RowMain
              mono={false}
              title={row.label === '' ? 'untitled' : row.label}
              description={`${credentialTitle(row.kind)} — ${row.capability}`}
            />
            <Col width="state">
              {/* A LABEL pill, not a state pill: this says what the key may do, which is a fact about
                  the kind rather than a lifecycle state. The three coloured states mean on / off /
                  never everywhere else in this console, and borrowing one here would say something
                  untrue. */}
              <Pill state="never" label>
                {row.capability.split('.')[0]}
              </Pill>
            </Col>
            <Col width="meta">
              {/* "Everywhere" for a kind with no scope, not a blank: "this kind has no environment"
                  is a fact, and a blank cell reads as missing data. */}
              {row.scope === null ? (
                <Tag>Everywhere</Tag>
              ) : (
                <Tag label={`Scope: ${row.scope}`}>{row.scope}</Tag>
              )}
              {/* Words in every case. `null` is "No expiry", which is a deliberate state an owner
                  chose (or the kind does not support one) — not missing information. */}
              <Tag>{formatExpiry(row.expiresAt)}</Tag>
              <span className="ds-note">Created {formatUtc(row.createdAt)}</span>
            </Col>
            <Col width="act">
              <button
                type="button"
                className="ds-kebab"
                onClick={() => setConfirming(row)}
                disabled={inFlight}
                // The kebab is three drawn dots with no text, so the accessible name has to say
                // WHICH row it acts on — "More actions" on four rows is four identically-named
                // controls.
                aria-label={`Revoke ${row.label === '' ? 'this untitled key' : row.label}`}
              >
                <Icon name="settings" size={14} />
              </button>
            </Col>
          </Row>
        ))}
      </ListCard>

      {/* ONE dialog, for every row. See the header of this file. */}
      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun={confirming === null ? 'key' : credentialTitle(confirming.kind).toLowerCase()}
        subject={confirming === null || confirming.label === '' ? 'untitled' : confirming.label}
        consequence={confirming === null ? '' : CONSEQUENCE[confirming.kind]}
        details="Revoking cannot be undone, and it takes effect on the next request — no deploy. Create a new key instead of trying to restore this one."
        pending={inFlight}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming !== null && onConfirm(confirming)}
      />
    </>
  )
}
