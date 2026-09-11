'use client'
import { useRef, useState } from 'react'
import { Callout, Empty, PageHead } from '@/design-system/primitives'
import {
  CREDENTIAL_KINDS_NOT_LISTED,
  isCurrentlyUsable,
  type CredentialRow,
} from '@/lib/credential-inventory'
import { NewThingDialog } from '@/components/product/NewThingDialog'
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
//
// ── mockups-as-built · Sprint 4, Story 4.1 — the FORM moved into the modal seam ────────────────
// The approved design opens `+ New key` as **the same wizard shape as New feature** — the 33rd
// approved state, `console-prototype.html:1992`, and epic D8 makes it the answer on all six `+ New …`
// surfaces. This page expanded an inline panel in the body instead, and the epic's own doc reported
// the story done: **no gate could see it**, because the structural contract measures a route's
// DEFAULT state and the panel only exists after a click the gate never makes. Found by pressing the
// button on production, 2026-09-10.
//
// Nothing about the paragraphs above changes — the trigger is still in the head, the reveal still
// replaces the whole body, and `NewKey` still reports upward. What changed is where the FORM renders
// between those two moments: in the dialog, which owns its own open state, instead of in the body
// behind a boolean this component held.
//
// ⚠️ **The footnote and both callouts moved in here too** (fresh reviewer, verifying the fix). They
// were siblings of this component in `page.tsx`, so "while a value is on screen this renders the
// reveal and NOTHING else" was true of the component and false of the page — including the "Not
// listed here" callout with its links away to Share links and Connect, beside a credential the
// reader has not saved yet. The sentence is about the page, so the page is what it now describes.

export function KeysSurface({ slug, rows }: { slug: string; rows: CredentialRow[] }) {
  const usableCount = rows.filter((row) => isCurrentlyUsable(row)).length
  // ⚠️ Where focus goes when the reveal is dismissed (fresh reviewer, Minor). `router.refresh()` does
  // not navigate, so unmounting the reveal drops focus to `<body>` with nothing announced — the same
  // shape as the `ConfirmDialog` focus-restoration finding this repo graded Blocking, weaker only
  // because there is no trap to escape. The heading takes it, so a keyboard user lands at the top of
  // the page they just changed rather than nowhere.
  const heading = useRef<HTMLDivElement>(null)
  // The plaintext, held for exactly as long as it is on screen. Never read back from the server.
  const [minted, setMinted] = useState<string | null>(null)
  // ⚠️ Bumped every time the wizard OPENS, and used as `NewKey`'s `key` — so the form remounts
  // instead of reappearing with the last attempt's picked kind, typed label and red callout still
  // in it (cross-agent review, agy, on the sibling surfaces). `NewKey` holds all of that state
  // itself, so unlike Destinations and Shares there is nothing here to clear: a remount IS the
  // reset, and it cannot go stale as the form grows a seventh field.
  const [wizardOpens, setWizardOpens] = useState(0)
  // ⚠️ **The form's open state is GONE from this file — `NewThingDialog` owns it** (mockups-as-built
  // Story 4.1, epic D8). It used to live here, because while `NewKey` owned it, opening the form
  // expanded a pick list and three fields inside the head's flex row. The modal seam solves the same
  // problem one level up: the head holds the trigger, the dialog holds what the trigger opens, and
  // neither this component nor `NewKey` has a boolean to keep in step with the other.

  return (
    <>
      <div ref={heading} tabIndex={-1}>
        <PageHead
          title="Keys"
          lede={
            <>
              Everything that gives something else access to this project. These used to be four separate
              pages — API keys, flag credentials, agent write keys, and the connector token.
            </>
          }
          // ⚠️ No trigger while a value is on screen. A `+ New key` button beside an unsaved
          // credential invites a second mint before the first is copied.
          //
          // **Setting `minted` is also what closes the dialog** — the same single condition
          // `share-manager.tsx` uses one surface over. A successful mint unmounts `NewThingDialog`,
          // and the modal goes with it, revealing the value underneath. One condition decides both,
          // so they cannot disagree about whether a credential is on screen.
          actions={
            minted === null ? (
              <NewThingDialog
                /* The approved `setup-keys` state's label, character for character — the structural
                   gate compares the words (epic D2). */
                label="+ New key"
                title="New key"
                lede="What it is for, the one thing that kind needs, and a name you will know it by later."
                onOpenChange={(open) => {
                  if (open) setWizardOpens((count) => count + 1)
                }}
              >
                <NewKey key={wizardOpens} slug={slug} onMinted={setMinted} />
              </NewThingDialog>
            ) : undefined
          }
        />
      </div>

      {minted !== null ? (
        // The value takes the whole body: no list, no empty state, no form.
        <NewKey.Reveal
          value={minted}
          onDismiss={() => {
            setMinted(null)
            heading.current?.focus()
          }}
        />
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="ds-listcard">
              <Empty
                title="Nothing has a credential for this project yet"
                body="Until something does, the SDK and POST /api/v1/track have nothing to authenticate with. Start with an API key — it is the one every project needs first."
              />
            </div>
          ) : (
            <KeysList
              slug={slug}
              rows={rows}
              /* ⚠️ INSIDE the card — mockups-as-built Story 4.1. The approved `setup-keys` state is
                 `head → list`, and this rendered as a third block the design does not draw. The
                 sentence is unchanged; only where it sits is. */
              foot={
                <p className="ds-foot">
                  {/* Counts what can actually AUTHENTICATE, not what is merely unrevoked. An expired
                      key is rejected on every serving path, so counting it would make this page's own
                      "what has access now" false. Expired rows still render — an owner cleaning up
                      wants to see them — they just are not counted. */}
                  {usableCount} credential{usableCount === 1 ? '' : 's'} can reach this project right now
                  {rows.length > usableCount ? `, and ${rows.length - usableCount} have expired` : ''}.
                  Revoked keys are not listed at all.
                </p>
              }
            />
          )}

          {/* ⚠️ What this page does NOT list, said out loud on the page itself. Its promise is
              "everything that has access", and share links and connector URLs ARE access — bearer
              tokens rendering this project's data to whoever holds them. Claiming completeness while
              omitting live bearer tokens would be worse than scoping the claim honestly. */}
          <Callout>
            <b>Not listed here.</b>{' '}
            {CREDENTIAL_KINDS_NOT_LISTED.map((entry, index) => (
              <span key={entry.kind}>
                {index > 0 ? ' · ' : ''}
                {/* A LINK only where it leads somewhere. `flag_admin` has no surface in this product —
                    it is minted from a database session — so it is named as plain text rather than
                    pointed at a page that does not exist. */}
                {entry.where === null ? (
                  <b>{entry.label}</b>
                ) : (
                  <a href={`${entry.where}/${slug}`}>{entry.label}</a>
                )}
                {`: ${entry.why}`}
              </span>
            ))}
          </Callout>

          <Callout>
            The key value is shown <b>once</b>, on a screen of its own, with a copy button. It is never a
            value you read off this table or type back in — only its hash is stored, so nothing here can show
            it to you a second time.
          </Callout>
        </>
      )}
    </>
  )
}
