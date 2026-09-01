'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CopyField } from '@/design-system/copy-field'
import { Callout, Field, ShownOnce } from '@/design-system/primitives'
import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import {
  AGENT_KEY_EXPIRY_DAYS,
  CREDENTIAL_MINT_FIELD,
  CREDENTIAL_MINT_ORDER,
  credentialCapability,
  credentialTitle,
  type CredentialKind,
} from '@/lib/credential-inventory'
import {
  mintAgentWriteKeyAction,
  mintFlagReadKeyAction,
  mintFlagSyncKeyAction,
  mintIngestKeyAction,
  type MintResult,
} from './actions'

// design-system-rails · Sprint 4, Story 4.5 — `+ New key`, and the four forms behind it.
//
// ── Why one component and not four ────────────────────────────────────────────────────────────
// The previous sprint deferred this work with an honest reason: *"the four kinds take materially
// different inputs, so this sprint merged the list rather than half-merging the forms."* They do
// differ — `flag_read` needs an environment, `flag_sync` a source, `agent_write` an expiry from an
// allow-list, and an ingest key none of those — and that difference **is the work**, not a reason to
// defer again.
//
// What makes it one component rather than four is that the difference is DATA:
// `CREDENTIAL_MINT_FIELD` says which extra input a kind needs, and the switch below renders it. Four
// components would be four label fields, four busy flags, four in-flight locks and four one-time
// reveals — and this repo's own history says the second copy is where they drift.
//
// ── The shape: pick the JOB, then answer one question ─────────────────────────────────────────
// Nobody thinks "I need a flag_sync credential"; they think "I need to let my code register
// features". So step one is a list of jobs in the operator's words — `credentialCapability`, the
// same sentences the table renders — and step two asks for the one thing that kind needs.
//
// ── The value is shown ONCE, on a screen of its own (sprint contract #7) ──────────────────────
// On success the form is REPLACED by the reveal rather than sitting under it. A form still on screen
// beside a credential invites a second mint, and the value is the only thing here that cannot be
// recovered by reloading — nothing stores the plaintext.

/** Which extra question each kind asks, in the words the form uses. */
const FIELD_LABEL = {
  environment: 'Which environment',
  source: 'Which publisher',
  expiry: 'When it expires',
} as const

export function NewKey({
  slug,
  onMinted,
  onClose,
}: {
  slug: string
  onMinted: (plaintext: string) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<CredentialKind | null>(null)
  const [label, setLabel] = useState('')
  const [environment, setEnvironment] = useState<string>(FLAG_ENVIRONMENTS[0])
  const [source, setSource] = useState('frontend')
  // `30` rather than `null`: an agent write key that never expires is a decision, and it should be
  // one somebody makes rather than one they get by not choosing.
  const [expiryDays, setExpiryDays] = useState<number | null>(30)
  const [error, setError] = useState<string | null>(null)
  // ⚠️ TWO error states, because they are two different facts. `fieldError` is about the label a
  // reader typed and belongs beside the input; `error` is the server's rejection of the whole
  // request and belongs where the request was made. One state for both would put "give the key a
  // label" in a page-level alert and "could not reach the server" under a text box.
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // ⚠️ React 18's `isPending` clears before an async transition callback's first await resolves, so
  // minting holds its OWN flag. Without it a second click issues a second live credential, which is
  // the failure mode with the highest cost on this page.
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending

  function reset() {
    setKind(null)
    setLabel('')
    setError(null)
    setFieldError(null)
    onClose()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (kind === null) return
    const trimmed = label.trim()
    if (trimmed === '') {
      // Client-side, so the reader sees the error against the field. The server action remains the
      // authority — this only saves a round-trip, it does not replace a check. `required` is
      // deliberately NOT on the input: the browser's own bubble appears in a place this design does
      // not control and vanishes on the next keystroke, so the field would have two error mechanisms
      // that disagree about where a message lives.
      setFieldError('Give the key a label, so you can tell it apart from the others later.')
      return
    }
    setError(null)
    setFieldError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result: MintResult =
          kind === 'ingest'
            ? await mintIngestKeyAction(slug, trimmed)
            : kind === 'flag_read'
              ? await mintFlagReadKeyAction(slug, environment, trimmed)
              : kind === 'flag_sync'
                ? await mintFlagSyncKeyAction(slug, source, trimmed)
                : await mintAgentWriteKeyAction(slug, expiryDays, trimmed)
        // ⚠️ Handed UPWARD, not rendered here. `KeysSurface` owns whether a value is on screen,
        // because "on a screen of its own" is a claim about the whole page and this component only
        // occupies the head's action slot.
        if (result.ok) onMinted(result.plaintext)
        else setError(result.error)
      } catch {
        // A rejected action left the button spinning back to idle with no message, which reads as
        // "nothing happened" when the truth is "we do not know" — and on a mint, "we do not know"
        // may mean a live credential exists that nobody has seen.
        setError('Could not reach the server. Reload the page and check whether the key was created.')
      }
      setBusy(false)
    })
  }

  return (
    <div className="ds-card ds-mint">
      {/* ── Step one: what is this for? ──────────────────────────────────────────────────────
          A list of JOBS. The sentences are `credentialCapability`, the same ones the table renders,
          so the thing you pick and the thing you later read about it are one string. */}
      <Field label="What is this key for">
        <div className="ds-picklist">
          {CREDENTIAL_MINT_ORDER.map((candidate) => (
            <button
              type="button"
              key={candidate}
              className="ds-pick"
              aria-pressed={kind === candidate}
              onClick={() => {
                setKind(candidate)
                setError(null)
                setFieldError(null)
              }}
            >
              <span className="ds-pick-title">{credentialTitle(candidate)}</span>
              <span className="ds-pick-detail">{credentialCapability(candidate)}</span>
            </button>
          ))}
        </div>
      </Field>

      {kind !== null && (
        <form onSubmit={onSubmit}>
          {/* ── Step two: the ONE extra question this kind asks ──────────────────────────────
              Driven by `CREDENTIAL_MINT_FIELD`, so the form cannot offer a field the action does not
              accept, or omit one it requires. */}
          {/* ⚠️ Every control below takes its name from the FIELD's `<label for>`, not from an
              `aria-label` of its own. Two strings for one name is two strings that drift, and the one
              a screen reader hears would be the one nobody proofreads. */}
          {CREDENTIAL_MINT_FIELD[kind] === 'environment' && (
            <Field
              label={FIELD_LABEL.environment}
              controlId="new-key-environment"
              hint="A snapshot key reads one environment and only one. Creating a second key is how you cover another."
            >
              {(control) => (
                <span className="ds-select">
                  <select
                    {...control}
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value)}
                  >
                    {FLAG_ENVIRONMENTS.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </Field>
          )}

          {CREDENTIAL_MINT_FIELD[kind] === 'source' && (
            <Field
              label={FIELD_LABEL.source}
              controlId="new-key-source"
              hint="Give each service publisher its own name, such as “frontend” or “backend”, so you can revoke one without stopping the others."
            >
              {(control) => (
                <input
                  {...control}
                  className="ds-input"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  // A hint to the browser only — the action enforces the same pattern, because a
                  // Server Action is reachable without a browser at all.
                  pattern="[a-z][a-z0-9_-]{0,63}"
                  maxLength={64}
                  required
                />
              )}
            </Field>
          )}

          {CREDENTIAL_MINT_FIELD[kind] === 'expiry' && (
            <Field
              label={FIELD_LABEL.expiry}
              controlId="new-key-expiry"
              hint="This is the strongest credential here — it can change this project's tasks. Choosing an end date now is a decision you make once, instead of a revocation you have to remember."
            >
              {(control) => (
                <span className="ds-select">
                  <select
                    {...control}
                    value={expiryDays === null ? 'never' : String(expiryDays)}
                    onChange={(event) =>
                      setExpiryDays(event.target.value === 'never' ? null : Number(event.target.value))
                    }
                  >
                    {AGENT_KEY_EXPIRY_DAYS.map((days) => (
                      <option key={days} value={String(days)}>
                        In {days} day{days === 1 ? '' : 's'}
                      </option>
                    ))}
                    <option value="never">Never — until it is revoked</option>
                  </select>
                </span>
              )}
            </Field>
          )}

          {/* ⚠️ The label's error belongs AGAINST THE FIELD, not in a page-level callout. A message
              about one control, rendered somewhere else, is a message a screen-reader user has to go
              looking for — `Field`'s render-prop hands the control its `aria-invalid` and its
              `aria-describedby` so neither can be forgotten. The slot's height is reserved either
              way, so showing it does not move the Create button. */}
          <Field
            label="What to call it"
            controlId="new-key-label"
            hint="For you, not for the machine. “ci”, “storefront”, “rotated-2026-09” — whatever tells you which one to revoke later."
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
                maxLength={64}
              />
            )}
          </Field>

          {/* The SERVER's rejection, which is about the request rather than about one field. */}
          {error && <Callout tone="warn">{error}</Callout>}

          <p className="ds-mint-actions">
            <button type="submit" className="ds-btn ds-btn--primary" disabled={inFlight}>
              {inFlight ? 'Creating…' : `Create the ${credentialTitle(kind).toLowerCase()}`}
            </button>
            <button type="button" className="ds-btn ds-btn--secondary" onClick={reset} disabled={inFlight}>
              Cancel
            </button>
          </p>
        </form>
      )}
    </div>
  )
}

/**
 * The `+ New key` control, which is all that lives in the page head.
 *
 * ⚠️ **The FORM used to live here too, and it should not have** (cross-family review, agy, round 3).
 * `NewKey` returned a button when closed and a multi-field card when open, and it was mounted in
 * `PageHead`'s `actions` slot — so opening it expanded a pick list and three fields inside a flex
 * header row. That is the same defect the fresh reviewer found one level along for the REVEAL: a
 * thing that takes over the page, rendered in the slot meant for a button.
 *
 * The head holds the trigger; `KeysSurface` renders the form in the body and owns the one piece of
 * state that decides which. The approved `setup-keys` state puts `+ New key` in the head, and it is
 * still there.
 */
NewKey.Trigger = function Trigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="ds-btn ds-btn--primary" onClick={onOpen}>
      + New key
    </button>
  )
}

/**
 * The value, on a screen of its own.
 *
 * Rendered by `KeysSurface` in place of the whole page body — the head's trigger, the list and the
 * empty state all go while it is up. Sprint contract #7: *the key value is shown once, on a screen
 * of its own, with a copy button; never a value read off a table.*
 *
 * Attached to `NewKey` rather than exported separately so the two halves of one flow are one import
 * and cannot drift apart in a refactor.
 */
NewKey.Reveal = function Reveal({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const router = useRouter()
  return (
    <ShownOnce
      title="Copy this key now — it is not shown again"
      body="Only its hash is stored, so nothing here or anywhere else can show it to you a second time. If you lose it, revoke this key and create another."
    >
      <CopyField value={value} label="Copy your new key" />
      <p className="ds-once-actions">
        <button
          type="button"
          className="ds-btn ds-btn--secondary"
          onClick={() => {
            onDismiss()
            // The list is server-rendered and the action revalidated its path, so this is what puts
            // the new row on screen. Local state would be a second source of truth for "what has
            // access", which is the one thing this page must not have two of.
            router.refresh()
          }}
        >
          I&apos;ve saved it
        </button>
      </p>
    </ShownOnce>
  )
}
