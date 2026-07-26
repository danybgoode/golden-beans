import { Nav } from '@/components/landing/Nav'
import { Footer } from '@/components/landing/Footer'
import { CopyUrlField } from '@/components/landing/CopyUrlField'
import { DEMO_PROJECT_SLUG } from '@/lib/public-demo'
import { getActiveConnectorUrl } from '@/lib/connector-tokens'
import { getSiteUrl, isSiteUrlMisconfiguredInProduction } from '@/lib/site-url'
import { isConnectorWritesEnabled } from '@/lib/flags'

// Story 2.2 (commercial-shell/sprint-2.md) — the install page: copy-your-URL field, "Add to
// Claude" deep-link, and the real SDK integration docs. Same force-dynamic rationale as
// app/page.tsx — the connector URL is live server state (a real DB-backed token), never
// build-time-frozen.
export const dynamic = 'force-dynamic'

// Verified live against mb's shipped, production `seller-agent-connect-mcp-url` panel
// (apps/miyagisanchez/components/ConnectAgentPanel.tsx) — sprint-2.md's original
// `claude.ai/new?modal=add-custom-connector` guess was stale. The modal takes no URL param (per
// mb's own research note: claude.ai's add-custom-connector modal has no field for pre-filling a
// URL), so the visitor pastes the copied URL themselves — same UX mb ships.
const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

export default async function InstallPage() {
  // A cross-review catch: if this ever runs in real Vercel production without SITE_URL set, show
  // the honest "not ready" state instead of a live-looking but broken localhost URL.
  const connectorUrl = isSiteUrlMisconfiguredInProduction()
    ? null
    : await getActiveConnectorUrl(DEMO_PROJECT_SLUG)

  return (
    <>
      <Nav />
      <section className="band">
        <div className="wrap">
          <h1 className="display" style={{ fontSize: 40, maxWidth: 720 }}>
            Bring the agent you already pay for.
          </h1>
          <p style={{ margin: '14px 0 36px', color: 'var(--dim)', maxWidth: 640 }}>
            Three ways in. Pick the one that matches how you already work — the SDK is always the data-in
            layer underneath all three.
          </p>

          <div className="panel" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>
                ① CONNECTOR URL
              </span>
              <span className="tag tag-live">✅ LIVE</span>
            </div>
            <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Paste it into Claude</h2>
            {connectorUrl ? (
              <>
                <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 16px' }}>
                  Your tokenized MCP URL for the <b style={{ color: 'var(--crema)' }}>{DEMO_PROJECT_SLUG}</b>{' '}
                  project — read-only, revocable, free tier. Copy it, click{' '}
                  <b style={{ color: 'var(--crema)' }}>Add to Claude</b>, paste it into the modal.
                </p>
                <CopyUrlField url={connectorUrl} />
                <a
                  href={ADD_TO_CLAUDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-gold"
                  style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none' }}
                >
                  Add to Claude
                </a>
                <p className="note" style={{ marginTop: 14 }}>
                  Revoke the token, revoke the access — no deploy required.
                </p>
                {/* signals-loop S3.2 — AGENTS rule #3 honesty: once a write surface exists, the page
                    that hands out the connector URL has to say what this URL can and cannot do.
                    "Read-only" above is exact rather than cautious, and this explains WHY: the URL
                    is displayed openly on this very page, so it is deliberately incapable of
                    authorizing a mutation. Writing needs a second, hashed credential.

                    Gate-aware, for the same reason landing §4 is: a sentence promising a capability
                    that is switched off, or omitting one that is live, is a claim this page cannot
                    check and a reader can. */}
                <p className="note" style={{ marginTop: 8 }}>
                  {isConnectorWritesEnabled() ? (
                    <>
                      This URL is <b style={{ color: 'var(--crema)' }}>read-only on its own</b> — it is
                      displayed on this public page, so it can never authorize a change. To let your agent{' '}
                      <em>claim</em> and <em>resolve</em> tasks, mint an <b>agent write key</b> in your
                      dashboard and send it as a bearer token alongside this URL. Both must belong to the same
                      project, and every change is previewed and confirmed before it applies.
                    </>
                  ) : (
                    <>
                      This URL is <b style={{ color: 'var(--crema)' }}>read-only</b> — it is displayed on this
                      public page, so it can never authorize a change. Letting your own agent claim and
                      resolve tasks is built and not yet switched on.
                    </>
                  )}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--dim)' }}>
                {isSiteUrlMisconfiguredInProduction() ? (
                  "The connector isn't ready here yet — check back shortly."
                ) : (
                  <>
                    The demo connector isn&apos;t seeded yet — run <code>npm run seed:demo</code>.
                  </>
                )}
              </p>
            )}
          </div>

          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>
                ③ SDK IMPORT
              </span>
              <span className="tag tag-live">✅ LIVE</span>
            </div>
            <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>For your engineers</h2>
            <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 16px' }}>
              An npm-installed SDK, not a CLI wizard — a few lines to your first North Star input.
            </p>
            <pre
              style={{
                background: 'var(--roast)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '14px 16px',
                font: '500 12.5px var(--mono)',
                color: 'var(--crema)',
                overflowX: 'auto',
              }}
            >
              {`npm install @golden-beans/sdk

import { createGrowthEngineClient } from '@golden-beans/sdk'

const engine = createGrowthEngineClient({
  baseUrl: '${getSiteUrl()}',
  apiKey: process.env.GROWTH_ENGINE_API_KEY,
  userId: currentUser.id,
})

await engine.track('setup_guide_viewed', { featureId: 'setup_guide' })
await engine.trackAdoption('setup_guide')
const variant = engine.bucket('quick-upload-ui', ['control', 'treatment'])`}
            </pre>
          </div>
        </div>
      </section>
      <Footer />
    </>
  )
}
