'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NewThingDialog } from '@/components/product/NewThingDialog'
import { CopyField } from '@/design-system/copy-field'
import { Icon } from '@/components/ui/Icon'
import {
  Button,
  Callout,
  Col,
  Field,
  ListHead,
  Pill,
  Row,
  RowGroup,
  RowMain,
  ShownOnce,
  Tag,
  TableEmpty,
} from '@/design-system/primitives'
import type { CliTokenRow } from '@/lib/cli-tokens'
import { formatUtc } from '@/lib/format-utc'
import { CLI_TOKEN_EXPIRY_DAYS } from '@/lib/credential-inventory'
import { mintCliTokenAction, revokeCliTokenAction } from './actions'

// Setup › CLI — the interactive half: mint, reveal once, list, revoke.
//
// ── While a token is on screen, this renders the token and NOTHING else ───────────────────────
// The rule Setup › Keys had to be corrected into (`keys-surface.tsx`): a one-time credential reveal
// squeezed in beside the list it belongs to is a reveal someone scrolls past. The value replaces the
// body, and the only control is "I have saved it".
//
// ── A token is never read back from the server ────────────────────────────────────────────────
// `plaintext` lives in this component's state for exactly as long as it is displayed. Only its hash
// was stored, so there is nothing to fetch and nothing to re-show — which is also why the dialog
// says so rather than offering a "show again".

type MintState = { pending: boolean; error: string | null }

export function CliTokensManager({ slug, tokens }: { slug: string; tokens: CliTokenRow[] }) {
  const router = useRouter()
  const [minted, setMinted] = useState<string | null>(null)
  const [mint, setMint] = useState<MintState>({ pending: false, error: null })
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState<number | null>(CLI_TOKEN_EXPIRY_DAYS[1])
  const [revoking, setRevoking] = useState<CliTokenRow | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [pendingRevoke, startRevoke] = useTransition()

  // ⚠️ Cleared when the dialog OPENS or CLOSES, not only on success. `NewThingDialog` reports the
  // transition precisely because this state lives out here and a modal that merely looks closed
  // leaves last attempt's red callout sitting in a form nobody has submitted yet (the finding agy
  // filed twice against the sibling surfaces).
  function resetForm() {
    setLabel('')
    setExpiryDays(CLI_TOKEN_EXPIRY_DAYS[1])
    setMint({ pending: false, error: null })
  }

  async function onMint() {
    setMint({ pending: true, error: null })
    const result = await mintCliTokenAction(slug, label, expiryDays)
    if (!result.ok) {
      setMint({ pending: false, error: result.error })
      return
    }
    setMint({ pending: false, error: null })
    setMinted(result.plaintext)
  }

  function onRevoke(token: CliTokenRow) {
    startRevoke(async () => {
      const result = await revokeCliTokenAction(slug, token.id)
      setRevoking(null)
      if (!result.ok) {
        setRevokeError(result.error)
        return
      }
      setRevokeError(null)
      router.refresh()
    })
  }

  if (minted !== null) {
    return (
      <ShownOnce
        title="Your CLI token"
        body={
          <>
            This is the only time it is shown — only a hash was stored, so it cannot be displayed again.
            Paste it into <code>gf login</code>, or set it as <code>GOLDEN_FRIJOLES_TOKEN</code> in CI.
          </>
        }
      >
        <CopyField label="CLI token" value={minted} />
        <Button
          onClick={() => {
            setMinted(null)
            // The list gains a row the moment the reveal is dismissed. Refreshing BEFORE dismissal
            // would re-render this component mid-reveal and is how a credential ends up flashing
            // away under someone's cursor.
            router.refresh()
          }}
        >
          I have saved it
        </Button>
      </ShownOnce>
    )
  }

  const active = tokens.filter((token) => token.revokedAt === null)

  return (
    <>
      <ListHead>
        <Col>
          {active.length === 0
            ? 'No CLI tokens'
            : `${active.length} CLI token${active.length === 1 ? '' : 's'} that can sign in as you`}
        </Col>
        <Col>
          <NewThingDialog
            label="+ New CLI token"
            title="New CLI token"
            lede="Name it after the machine or job that will hold it, so you know which one to kill."
            onOpenChange={resetForm}
          >
            <Field label="Name" controlId="cli-token-label" hint="A laptop, a CI job — whatever holds it.">
              <input
                id="cli-token-label"
                className="ds-input"
                value={label}
                maxLength={120}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="my laptop"
              />
            </Field>
            <Field
              label="Expires"
              controlId="cli-token-expiry"
              hint="A token that outlives its purpose is the one worth bounding now rather than remembering to revoke."
            >
              <select
                id="cli-token-expiry"
                className="ds-input"
                value={expiryDays === null ? 'never' : String(expiryDays)}
                onChange={(event) =>
                  setExpiryDays(event.target.value === 'never' ? null : Number(event.target.value))
                }
              >
                {CLI_TOKEN_EXPIRY_DAYS.map((days) => (
                  <option key={days} value={days}>
                    In {days} days
                  </option>
                ))}
                <option value="never">Until I revoke it</option>
              </select>
            </Field>
            {mint.error && <Callout tone="warn">{mint.error}</Callout>}
            {/* `state`, not `disabled`: `Button` maps `loading`/`disabled` onto the DOM attribute AND
                onto `aria-busy`, so a screen reader is told the press is in flight. Passing a bare
                `disabled` would have been a second, weaker spelling of a state the system models. */}
            <Button
              variant="primary"
              onClick={onMint}
              state={mint.pending ? 'loading' : label.trim().length === 0 ? 'disabled' : 'idle'}
            >
              {mint.pending ? 'Minting…' : 'Mint token'}
            </Button>
          </NewThingDialog>
        </Col>
      </ListHead>

      {revokeError && <Callout tone="warn">{revokeError}</Callout>}

      {tokens.length === 0 ? (
        <TableEmpty
          title="No CLI tokens yet"
          body="Mint one to sign in from a terminal. Nothing else on this page needs doing first."
        />
      ) : (
        <RowGroup>
          {tokens.map((token) => (
            <Row key={token.id}>
              {/* `mono={false}`: a token's name is something a person typed, not an identifier —
                  the same call Setup › Keys makes for the same reason. */}
              <RowMain mono={false} title={token.label === '' ? 'untitled' : token.label} />
              <Col width="state">
                {/* Three words, not two. Expired and revoked are DIFFERENT facts: an expired token
                    has zero access (the view compares expiry in database time), but an operator
                    cleaning up wants to see which is which, and only one of them is still revocable. */}
                {token.revokedAt !== null ? (
                  <Pill state="off">Revoked</Pill>
                ) : isExpired(token) ? (
                  <Pill state="off">Expired</Pill>
                ) : (
                  <Pill state="on">Active</Pill>
                )}
              </Col>
              <Col width="meta">
                {/* ⚠️ "Never used" is a FACT here, unlike the equivalent line on Setup › Connect,
                    which that page deliberately refuses to draw because nothing records connector
                    reads. `cli_tokens.last_used_at` is stamped on every resolve, so this is read
                    from something the system actually writes. */}
                <Tag>{token.lastUsedAt ? `Last used ${formatUtc(token.lastUsedAt)}` : 'Never used'}</Tag>
                {/* Words in every case — `null` is "No expiry", a state someone chose, not missing
                    information. */}
                <Tag>{token.expiresAt ? `Expires ${formatUtc(token.expiresAt)}` : 'No expiry'}</Tag>
                <span className="ds-note">Created {formatUtc(token.createdAt)}</span>
              </Col>
              <Col width="act">
                {token.revokedAt === null && !isExpired(token) && (
                  <button
                    type="button"
                    className="ds-kebab"
                    onClick={() => setRevoking(token)}
                    disabled={pendingRevoke}
                    // The control is a drawn glyph with no text, so its accessible name has to say
                    // WHICH row it acts on — "Revoke" on four rows is four identically-named buttons.
                    aria-label={`Revoke ${token.label === '' ? 'this untitled token' : token.label}`}
                  >
                    <Icon name="settings" size={14} />
                  </button>
                )}
              </Col>
            </Row>
          ))}
        </RowGroup>
      )}

      <ConfirmDialog
        open={revoking !== null}
        verb="Revoke"
        noun="CLI token"
        subject={revoking?.label ?? ''}
        consequence="Any machine holding it is signed out of gf immediately. This cannot be undone."
        pending={pendingRevoke}
        onCancel={() => setRevoking(null)}
        onConfirm={() => revoking && onRevoke(revoking)}
      />
    </>
  )
}

/**
 * Expired by the BROWSER's clock, for display only.
 *
 * The authority is `active_cli_tokens`, which compares expiry in database time — this only decides
 * which word to draw. Skew makes a row look dead a few seconds early or late; it can never make a
 * dead token work, because nothing here is an access decision.
 */
function isExpired(token: CliTokenRow): boolean {
  if (token.expiresAt === null) return false
  const at = Date.parse(token.expiresAt)
  // Unparseable counts as NOT expired, so a bad row renders as active-and-revocable rather than as
  // something an operator would leave alone believing it was already dead.
  return Number.isFinite(at) && at <= Date.now()
}
