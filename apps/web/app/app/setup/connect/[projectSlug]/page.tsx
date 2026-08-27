import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isConnectorEnabled, isConsoleShellEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getConnectorStatus } from '@/lib/connector-tokens'
import { formatUtc } from '@/lib/format-utc'
import { Panel } from '@/components/ui/Panel'
import { ProductShell } from '@/components/product/ProductShell'
import { ConnectorManager } from './connector-manager'

// console-ia-overhaul · Sprint 2, Story 2.1 — your own project's connector URL, inside the product.
//
// ── The defect this fixes ─────────────────────────────────────────────────────────────────────
// The signed-in shell's `Connect` link pointed at `/install`, a public marketing page that serves
// the DEMO project's connector token (correctly — AGENTS rule #2 requires public routes to serve
// only the demo project). So an operator who followed it got a working URL for somebody else's
// data. `/install` is untouched by this sprint; what changes is where the product's own link goes.
//
// ── Gate: dark means nonexistent, before auth ─────────────────────────────────────────────────
// Same shape as every gated route in the product (`app/app/journeys/[projectSlug]/page.tsx`): the
// flag check runs BEFORE `requireProjectMembership`, so while the console is dark this 404s for
// everyone rather than leaking its existence through a login redirect. That is the one property the
// `api` Playwright project can assert about this page without a session.
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
  const status = connectorEnabled
    ? await getConnectorStatus(membership.projectId)
    : { state: 'absent' as const }
  const canManage = isOwner({ projectId: membership.projectId, role: membership.role })

  return (
    <ProductShell projectSlug={projectSlug} section="setup">
      <main>
        <h1>Connect your agent — {projectSlug}</h1>
        <p>
          <a href="/app">← Your projects</a>
        </p>
        <p>
          Point Claude at <strong>this project&apos;s</strong> data. The URL below is a bearer credential
          scoped to {projectSlug} — it is not the demo project&apos;s, and it is not shared with any other
          tenant.
        </p>

        <Panel className="stack">
          <h2>Your connector URL</h2>

          {!connectorEnabled ? (
            // Honest, and specific about WHICH switch is off. "Unavailable" would leave a reader
            // unable to tell a disabled feature from a broken one.
            <p role="status">
              The MCP connector is switched off for this deployment (<code>CONNECTOR_ENABLED</code>). Nothing
              can be connected until it is enabled in a new deployment.
            </p>
          ) : (
            <>
              {/* ── The status line, and what it deliberately does NOT claim (A10) ───────────────
                  Two states, because two is what the data supports. `connector_tokens` has five
                  columns and none of them records use; the MCP route resolves a token and writes
                  nothing; `audit_log` had no connector action at all before this sprint. So this
                  says whether a URL EXISTS, and says out loud that existing is not the same as
                  being used — rather than showing a "last used" that would be invented. */}
              {status.state === 'active' ? (
                <>
                  <p role="status">
                    <strong>A connector URL exists for this project</strong>, created{' '}
                    {formatUtc(status.createdAt)}.
                  </p>
                  <p className="data-table__count">
                    That means the URL is live and will serve — <strong>not</strong> that Claude has ever used
                    it. Nothing in this product records connector reads, so a page claiming &quot;last
                    used&quot; would be guessing. To check a connection actually works, ask your agent for
                    this project&apos;s funnel.
                  </p>
                </>
              ) : (
                <p role="status">
                  <strong>No connector URL yet.</strong>{' '}
                  {canManage
                    ? 'Create one below, then paste it into Claude.'
                    : 'An owner of this project can create one.'}
                </p>
              )}

              <ConnectorManager
                slug={projectSlug}
                tokenId={status.state === 'active' ? status.tokenId : null}
                url={status.state === 'active' ? status.url : null}
                canManage={canManage}
                connectorEnabled={connectorEnabled}
              />
            </>
          )}
        </Panel>

        {/* The SDK snippet is deliberately NOT here — two audiences, two places. This page is for
            pointing an agent at data that already flows; sending events is a different job with a
            different reader, and duplicating the snippet would mean two copies to keep correct. */}
        <p>
          Sending events instead? The SDK snippet lives on{' '}
          <a href={`/app/onboarding/${projectSlug}`}>your setup guide</a>.
        </p>
      </main>
    </ProductShell>
  )
}
