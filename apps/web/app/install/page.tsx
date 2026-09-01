import { DEMO_PROJECT_SLUG } from '@/lib/public-demo'
import { getActiveConnectorUrl } from '@/lib/connector-tokens'
import { getSiteUrl, isSiteUrlMisconfiguredInProduction } from '@/lib/site-url'
import { isConnectorWritesEnabled } from '@/lib/flags'
import { Icon } from '@/components/ui/Icon'
import { Frame, FrameLink } from '@/design-system/Frame'
import { Callout, Card, Step, Steps } from '@/design-system/primitives'
import { CopyField } from '@/design-system/copy-field'

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

// ⚠️ THIS PAGE SERVES THE DEMO PROJECT'S CONNECTOR TOKEN, AND THAT IS CORRECT — do not "fix" it.
//
// AGENTS rule #2: a public read path may only ever serve the demo project. `/install` is public
// marketing, so `DEMO_PROJECT_SLUG` is the only tenant it may resolve. Pointing it at the viewer's
// own project would mean either serving a credential to an anonymous visitor or making a public
// page require a session — the first is a tenancy bug, the second is not a marketing page.
//
// console-ia-overhaul · Sprint 2, Story 2.2: the real defect was that the SIGNED-IN shell linked
// here, so an operator followed "Connect" and got a working URL for somebody else's data. It is
// fixed by the console REPLACING that header, not by rewriting this page's link.
//
// ── design-system-rails · Sprint 6, Story 6.2 — the approved `public-install` state ────────────
//
// The page moves off the landing's `Nav`/`Footer` and onto DD3's PUBLIC frame: a slim bar, the
// mark, and one action. The reason is the design's own rule — *chrome appears when there is
// something to navigate* — and the reason it matters HERE is that the landing nav offers a reader
// six destinations on the page whose entire job is three steps.
//
// ⚠️ **The SDK block is KEPT, and it is not in the approved state.** `landing-readability-pass`
// retired the landing's §connect and §sdk sections INTO this page; deleting the block to match a
// mock would silently undo a shipped epic's decision. It renders as a second card under the same
// language, which is additive rather than contradictory — the approved state describes the top of
// this page, not the whole of it. Recorded here rather than discovered by whoever misses it.
export default async function InstallPage() {
  // A cross-review catch: if this ever runs in real Vercel production without SITE_URL set, show
  // the honest "not ready" state instead of a live-looking but broken localhost URL.
  const connectorUrl = isSiteUrlMisconfiguredInProduction()
    ? null
    : await getActiveConnectorUrl(DEMO_PROJECT_SLUG)

  return (
    <Frame variant="public" brandHref="/" actions={<FrameLink href="/login">Sign in</FrameLink>}>
      <h1>Point Claude at a real project</h1>
      <p className="ds-lede">
        This is a working connector for our demo shop. Paste it into Claude and ask it about the funnel, the
        North Star, or which features are on — it will answer from live data.
      </p>

      {/* The whole defect this page once caused was a signed-in operator following a link here and
          copying somebody else's URL, so the page's job is to be UNMISTAKABLY the demo. */}
      <div className="ds-demobar">
        <span className="ds-demobar-pip" />
        <span>
          <b>This is the demo project, not yours.</b> The token below reads{' '}
          <span className="ds-mono">{DEMO_PROJECT_SLUG}</span> and nothing else. Your own project&apos;s URL
          lives inside the product, at <span className="ds-mono">Setup › Connect</span>.
        </span>
        <span className="ds-demobar-go">
          <FrameLink href="/login">Sign in for yours</FrameLink>
        </span>
      </div>

      <Card>
        {/* ⚠️ An `h2`, not a `ds-label` span — fresh reviewer, Minor. The page this replaced had two
            `<h2>`s and the port turned both into styled spans, leaving the outline h1-only: heading
            navigation got a screen-reader user nowhere on a page whose whole job is three steps.
            `ds-label` is the visual treatment; the element is what carries the structure. */}
        <h2 className="ds-label">Demo connector URL</h2>
        {connectorUrl ? (
          <>
            <CopyField value={connectorUrl} label="Copy the demo connector URL" />
            <p className="ds-hint">
              Read-only. It serves one small shop&apos;s numbers and cannot change anything.
            </p>
            {/* signals-loop S3.2 — AGENTS rule #3 honesty: once a write surface exists, the page
                that hands out the connector URL has to say what this URL can and cannot do.
                "Read-only" above is exact rather than cautious, and this explains WHY: the URL is
                displayed openly on this very page, so it is deliberately incapable of authorizing a
                mutation. Writing needs a second, hashed credential.

                Gate-aware, for the same reason landing §4 is: a sentence promising a capability that
                is switched off, or omitting one that is live, is a claim this page cannot check and
                a reader can. */}
            <p className="ds-hint">
              {isConnectorWritesEnabled() ? (
                <>
                  This URL is <b>read-only on its own</b> — it is displayed on this public page, so it can
                  never authorize a change. To let your agent <em>claim</em> and <em>resolve</em> tasks, mint
                  an <b>agent write key</b> in your dashboard and send it as a bearer token alongside this
                  URL. Both must belong to the same project, and every change is previewed and confirmed
                  before it applies.
                </>
              ) : (
                <>
                  This URL is <b>read-only</b> — it is displayed on this public page, so it can never
                  authorize a change. Letting your own agent claim and resolve tasks is built and not yet
                  switched on.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="ds-hint">
            {isSiteUrlMisconfiguredInProduction() ? (
              "The connector isn't ready here yet — check back shortly."
            ) : (
              <>
                The demo connector isn&apos;t seeded yet — run <code>npm run seed:demo</code>.
              </>
            )}
          </p>
        )}
      </Card>

      {/* ⚠️ **Its OWN card, matching `Setup › Connect` exactly** — `connector-manager.tsx` renders
          the same three steps in a `ds-card` whose first child is the label.
          Two reasons, and the second is the one that made me move it. The callout below claims "the
          same three steps, the same words and the same button as Setup › Connect", and a claim about
          sameness is worth more when the markup is actually the same. And in the card above, the
          label followed two paragraphs with no top margin and read as their last line — found by
          looking at the rendered page. The system rule that was missing is fixed too
          (`.ds-label:not(:first-child)`), so the next person to put a label mid-card gets spacing
          rather than a collision. */}
      {connectorUrl && (
        <Card>
          <h2 className="ds-label">Three steps</h2>
          <Steps>
            <Step>
              <b>Copy the URL above.</b>
            </Step>
            <Step
              note={
                <FrameLink
                  href={ADD_TO_CLAUDE_URL}
                  variant="primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Claude
                  {/* F1, answered without touching the rule: the approved design's `↗` renders as
                      the permitted `Icon`, never as a character the drift guard bans. */}
                  <Icon name="external" size={13} />
                </FrameLink>
              }
            >
              <b>Open Claude&apos;s connector settings.</b>
            </Step>
            <Step>
              <b>Paste it in and save.</b> Then ask:{' '}
              <span className="ds-mono">what moved the North Star this week?</span>
            </Step>
          </Steps>
        </Card>
      )}

      <Callout>
        The same three steps, the same words and the same button as <b>Setup › Connect</b> inside the product.
        One flow, learned once — the only difference is whose numbers are on the other end, and this page says
        which in the first line.
      </Callout>

      <Card>
        <h2 className="ds-label">For your engineers</h2>
        <p className="ds-hint">
          An npm-installed SDK, not a CLI wizard — a few lines to your first North Star input. It is the
          data-in layer under the connector above, not an alternative to it.
        </p>
        <pre className="ds-mono ds-codeblock">
          {`npm install @golden-frijoles/sdk

import { createGrowthEngineClient } from '@golden-frijoles/sdk'

const engine = createGrowthEngineClient({
  baseUrl: '${getSiteUrl()}',
  apiKey: process.env.GROWTH_ENGINE_API_KEY,
  userId: currentUser.id,
})

await engine.track('setup_guide_viewed', { featureId: 'setup_guide' })
await engine.trackAdoption('setup_guide')
const variant = engine.bucket('quick-upload-ui', ['control', 'treatment'])`}
        </pre>
      </Card>
    </Frame>
  )
}
