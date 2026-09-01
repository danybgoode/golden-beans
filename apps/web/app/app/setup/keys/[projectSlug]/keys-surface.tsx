'use client'
import { useState } from 'react'
import { Empty, PageHead } from '@/design-system/primitives'
import type { CredentialRow } from '@/lib/credential-inventory'
import { KeysList } from './keys-list'
import { NewKey } from './new-key'

// design-system-rails · Sprint 4, Story 4.5 — the head, the mint flow and the list, in one place.
//
// ── Why these three share a component ─────────────────────────────────────────────────────────
// ⚠️ **Sprint contract #7 says the key value is shown "on a screen of its own", and the first
// version did not deliver that** (fresh reviewer, Minor). `NewKey` was mounted in the page head's
// action slot, so on success the gold reveal panel appeared squeezed into the right-hand end of the
// head, with the credential list, the footnote, both callouts and the rail still around it. The
// property the contract is protecting — *never a value you read off a table* — held; the sentence
// describing it did not, and the sprint doc and the manifest both asserted the stronger form.
//
// The trigger belongs in the head (that is where the approved `setup-keys` state puts `+ New key`)
// and the reveal has to replace everything. Those are one piece of state, so they are one component:
// while a value is on screen this renders the reveal and NOTHING else.
//
// It is also why `NewKey` reports upward rather than rendering the reveal itself — a component that
// owns a secret and also owns the page around it is a component that can be persuaded to render one
// inside the other.

export function KeysSurface({ slug, rows }: { slug: string; rows: CredentialRow[] }) {
  // The plaintext, held for exactly as long as it is on screen. Never read back from the server.
  const [minted, setMinted] = useState<string | null>(null)
  // ⚠️ The form's open state lives HERE, not in `NewKey` (cross-family review, agy, round 3). The
  // head holds a button; the body holds whatever the button opens. While `NewKey` owned this,
  // opening it expanded a pick list and three fields inside the head's flex row — the same defect
  // the fresh reviewer found one level along for the reveal.
  const [minting, setMinting] = useState(false)

  return (
    <>
      <PageHead
        title="Keys"
        lede={
          <>
            Everything that gives something else access to this project. These used to be four separate pages
            — API keys, flag credentials, agent write keys, and the connector token.
          </>
        }
        // ⚠️ No trigger while a value is on screen, and none while the form is open. A `+ New key`
        // button beside an unsaved credential invites a second mint; beside an open form it is a
        // control that does nothing.
        actions={minted === null && !minting ? <NewKey.Trigger onOpen={() => setMinting(true)} /> : undefined}
      />

      {minted !== null ? (
        // The value takes the whole body: no list, no empty state, no form.
        <NewKey.Reveal value={minted} onDismiss={() => setMinted(null)} />
      ) : (
        <>
          {minting && (
            <NewKey
              slug={slug}
              onMinted={(plaintext) => {
                setMinting(false)
                setMinted(plaintext)
              }}
              onClose={() => setMinting(false)}
            />
          )}
          {rows.length === 0 ? (
            <div className="ds-listcard">
              <Empty
                title="Nothing has a credential for this project yet"
                body="Until something does, the SDK and POST /api/v1/track have nothing to authenticate with. Start with an API key — it is the one every project needs first."
              />
            </div>
          ) : (
            <KeysList slug={slug} rows={rows} />
          )}
        </>
      )}
    </>
  )
}
