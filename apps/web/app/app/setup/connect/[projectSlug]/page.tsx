import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isConnectorEnabled, isConsoleShellEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getConnectorStatus } from '@/lib/connector-tokens'
import { formatUtc } from '@/lib/format-utc'
import { Callout, Card, Field, PageHead, Pill } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'
import { ConnectorManager } from './connector-manager'

// Setup › Connect — your own project's connector URL, inside the product.
//
// ── The defect this fixed ─────────────────────────────────────────────────────────────────────
// The signed-in shell's `Connect` link pointed at `/install`, a public marketing page that serves
// the DEMO project's connector token (correctly — AGENTS rule #2 requires public routes to serve
// only the demo project). So an operator who followed it got a working URL for somebody else's
// data. `/install` is untouched; what changed is where the product's own link goes.
//
// ── design-system-rails · Sprint 4, Story 4.4 — the page teaches, then hands over the control ──
// Reference state `setup-connect`: the connector URL in a mono field WITH Copy, a status pill, and a
// numbered three-step card ending in `Add to Claude ↗`. The credential half already shipped and
// shipped well — the status, the multi-token warning, and the server-side filtering below — and
// **all of it is kept** (sprint contract #9). What this story adds is the half that makes setup a
// task rather than a credential screen.
//
// ── Gate: dark means nonexistent, before auth ─────────────────────────────────────────────────
// The flag check runs BEFORE `requireProjectMembership`, so while the console is dark this 404s for
// everyone rather than leaking its existence through a login redirect.
export const dynamic = 'force-dynamic'

export default async function SetupConnectPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isConsoleShellEnabled()) notFound()
  const { projectSlug } = await params
  // MEMBER gate. Reading your own project's connector URL is how its operators point an agent at
  // their data — that is not credential administration. MINTING one is, and the action re-checks
  // ownership server-side; `canManage` below only decides whether the control renders.
  const membership = await requireProjectMembership(projectSlug)

  // AGENTS rule #3: the connector is gated by TWO independent switches. With the env flag off we do
  // not even look for a token — there is nothing to offer, and a disabled-looking control would
  // imply the surface exists and is merely unavailable to you.
  const connectorEnabled = isConnectorEnabled()
  // ⚠️ Read the status EVEN WHEN the connector is switched off, so an existing token stays visible
  // and revocable. `actions.ts` says in words that revoke is deliberately ungated — "if
  // CONNECTOR_ENABLED were flipped off mid-incident, an owner must still be able to permanently kill
  // the credential rather than wait for the flag to come back". The action honoured that; the only
  // UI reaching it did not, because this line skipped the read entirely.
  const status = await getConnectorStatus(membership.projectId)
  const canManage = isOwner({ projectId: membership.projectId, role: membership.role })

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'setup/connect'}>
      <main>
        <PageHead
          title="Connect your agent"
          lede={
            <>
              Your own URL, with your own token, for the project in the switcher above. Paste it into Claude
              and it can read <strong>this project&apos;s</strong> numbers — not the demo project&apos;s, and
              not any other tenant&apos;s.
            </>
          }
        />

        <Card>
          {!connectorEnabled && (
            // Honest, and specific about WHICH switch is off. "Unavailable" would leave a reader
            // unable to tell a disabled feature from a broken one. It does not REPLACE the panel: an
            // existing token stays listed and revocable, because killing a credential must not
            // depend on the feature it belongs to being switched on.
            <Callout tone="warn">
              The MCP connector is switched off for this deployment (<code>CONNECTOR_ENABLED</code>). Nothing
              can connect through a URL until it is enabled in a new deployment
              {status.state === 'active' ? ', but an existing URL can still be revoked below.' : '.'}
            </Callout>
          )}

          {/* ── The status line, and what it deliberately does NOT claim (sprint contract #10) ───
              Two states, because two is what the data supports. `connector_tokens` has five columns
              and NONE of them records use; the MCP route resolves a token and writes nothing. So
              this says whether a URL EXISTS, and says out loud that existing is not the same as
              being used — rather than showing a "last used" that would be invented.
              Verified on production 2026-08-29: `miyagisanchez` has exactly one connector token. */}
          <Field
            label="Status"
            hint={
              status.state === 'active'
                ? 'That means the URL is live and will serve — not that Claude has ever used it. Nothing in this product records connector reads, so a page claiming “last used” would be guessing. To check a connection actually works, ask your agent for this project’s funnel.'
                : undefined
            }
          >
            {status.state === 'unreadable' && (
              // Not "there is none" — we could not check. The mint control is withheld below for the
              // same reason: minting on the strength of an unanswered question is how a second live
              // credential appears.
              <p role="alert">
                <Pill state="off">Could not check</Pill>{' '}
                <span className="ds-hint">
                  This project&apos;s connector state could not be read. Reload in a moment. Nothing has been
                  changed, and no URL is being offered until we can check.
                </span>
              </p>
            )}

            {status.state === 'active' && (
              <p role="status">
                <Pill state="on">
                  {status.tokens.length === 1 ? 'A URL exists' : `${status.tokens.length} URLs exist`}
                </Pill>{' '}
                <span className="ds-hint">
                  Created {formatUtc(status.tokens[0].createdAt)}
                  {status.tokens.length > 1 ? ' (most recent)' : ''}.
                </span>
              </p>
            )}

            {status.state === 'absent' && (
              <p role="status">
                {/* The `never` pill, and it is the right one: nobody has ever created a URL here.
                    Solid rather than dashed would say "switched off", which is a decision somebody
                    made — and nobody has. */}
                <Pill state="never">Not connected yet</Pill>{' '}
                <span className="ds-hint">
                  {canManage
                    ? 'Create one below, then paste it into Claude.'
                    : 'An owner of this project can create one.'}
                </span>
              </p>
            )}
          </Field>

          {status.state === 'active' && status.tokens.length > 1 && canManage && (
            // Should not happen, and is shown rather than hidden when it does. Two concurrent mints
            // can both pass the check-then-act in `mintConnectorToken`; listing every active token is
            // what keeps the extra one revocable instead of invisible.
            <Callout tone="warn">
              <b>More than one connector URL is active.</b> Each one below can read this project until it is
              revoked. Revoke the ones you are not using.
            </Callout>
          )}

          <ConnectorManager
            slug={projectSlug}
            /* ⚠️ FILTERED HERE, on the server, and that is the whole fix. The previous revision
               passed every token and let the client component decide what to render — but this page
               is a Server Component and `ConnectorManager` is `'use client'`, so props crossing that
               boundary are serialized into the RSC flight payload and shipped inside the HTML. A
               member could read the plaintext bearer URL out of View Source while the page politely
               told them to ask an owner.
               Hiding a credential with a conditional render is not hiding it. The `canManage` check
               has to happen before the data leaves the server. */
            tokens={canManage && status.state === 'active' ? status.tokens : []}
            /* Separate from `tokens` precisely BECAUSE tokens is now empty for a member: the member
               notice cannot be derived from `tokens.length` any more. */
            hasConnector={status.state === 'active'}
            canManage={canManage}
            /* Withheld while unreadable, and while the connector is off: the mint action refuses
               either way, and a button guaranteed to fail is worse than no button. Revoke is NOT
               withheld. */
            canMint={status.state === 'absent' && connectorEnabled}
          />
        </Card>

        {/* The SDK snippet is deliberately NOT here — two audiences, two places. This page is for
            pointing an agent at data that already flows; sending events is a different job with a
            different reader, and duplicating the snippet would mean two copies to keep correct. */}
        <Callout>
          Sending events instead? That is an engineer&apos;s job, not this one — the SDK snippet lives on{' '}
          <a href={`/app/onboarding/${projectSlug}`}>your setup guide</a>.
        </Callout>
      </main>
    </ProductShell>
  )
}
