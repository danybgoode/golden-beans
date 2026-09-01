import { requireProjectMembership } from '@/lib/dashboard-auth'
import { readOnboardingKeyFor } from '@/lib/onboarding-key'
import { DismissKeyButton } from './dismiss-key-button'
import { getActiveConnectorUrl } from '@/lib/connector-tokens'
import { isConnectorEnabled } from '@/lib/flags'
import { getSiteUrl } from '@/lib/site-url'
import { STARTER_FEATURE_KEY, STARTER_TARGET_EVENT } from '@/lib/provisioning'
import { ProductShell } from '@/components/product/ProductShell'
import { Icon } from '@/components/ui/Icon'
import { Callout, Card, Crumb, Crumbs, PageHead, ShownOnce, Step, Steps } from '@/design-system/primitives'
import { CopyField } from '@/design-system/copy-field'

// multi-tenant-activation · Sprint 2, Story 2.3 — the first-run screen a freshly confirmed
// signup lands on: the one-time key reveal, a ≤5-line SDK snippet pre-filled with it, and (gated)
// the MCP connector URL. Everything on this page must be actionable from on-screen steps alone —
// that's the story's acceptance bar, not just "renders something."
//
// ── design-system-rails · Sprint 5, Story 5.6 — reference state `setup-connect` ────────────────
// It was the last route in `/app` still drawn entirely in inline styles: `font: '700 12px
// var(--mono)'` step labels, a hand-rolled `<pre>`, `.panel` and `.btn-gold` from the LANDING's
// stylesheet, and a 34px `.display` heading. Every one of those is a decision made once, on this
// page, that nothing else shares — which is the condition this epic exists to end.
//
// It is now assembled from the same primitives Setup › Connect uses: `PageHead`, `Card`, `Steps` /
// `Step`, `CopyField`, and `ShownOnce` for the one-time key. **`ShownOnce` is exactly what this
// page needed and did not have** — it was built in Sprint 4 for the key reveal on Setup › Keys, and
// the two surfaces now say "this is the only time you will see this" in one voice.
//
// ⚠️ It stays `flow-only` in the inventory and is still gated out of the nav. It gets a reference
// state because a person can REACH it, not because the nav lists it.
export const dynamic = 'force-dynamic'

// Same URL as app/install/page.tsx (Story 2.2) — verified live against mb's shipped
// ConnectAgentPanel; the add-custom-connector modal takes no URL param, so the visitor pastes the
// copied URL themselves.
const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

// The snippet fires the SAME feature the provisioner registered for this tenant (Story 2.1 —
// lib/provisioning.ts's registerStarterFeature), imported rather than re-typed so the two can
// never drift apart. That drift is not cosmetic: lib/tars-query.ts filters events by
// `feature_id = <featureKey>`, so an event whose featureId doesn't match a registered feature
// key produces a funnel that renders an honest, permanent zero.

export default async function OnboardingPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params

  // MEMBER gate, not the demo-carve-out dashboard gate (lib/dashboard-auth.ts): this page renders
  // a credential, so even the demo project must never render here anonymously — unauthed → /login,
  // authed-but-not-a-member → 404 (never confirms a foreign slug exists).
  await requireProjectMembership(projectSlug)

  // Scoped to THIS project's slug. A user who belongs to more than one project must never be
  // shown another tenant's freshly minted credential under this page's heading — the hand-off
  // cookie carries the slug it was minted for and a mismatch reads as "nothing to show"
  // (cross-review, Codex 2026-07-20). A Server Component render can't clear the cookie, so the
  // reveal ends via the DismissKeyButton's server action or the cookie's short TTL, whichever
  // comes first — see lib/onboarding-key.ts.
  const plaintextKey = await readOnboardingKeyFor(projectSlug)

  // AGENTS rule #3: the connector is enablement-gated by TWO independent switches (the env flag
  // and a live per-project token). Both must be true, and when the flag is off we don't even
  // attempt the DB lookup — no connector section renders at all, not a disabled-looking one.
  const connectorUrl = isConnectorEnabled() ? await getActiveConnectorUrl(projectSlug) : null

  const siteUrl = getSiteUrl()
  // A JS expression, not a value to be re-quoted — when there's no key to hand over, the pasted
  // snippet must read the credential from the environment, never a fabricated placeholder string
  // that looks real but silently 401s (the story's rule: don't fabricate a key).
  const apiKeyExpr = plaintextKey ? `'${plaintextKey}'` : 'process.env.GROWTH_ENGINE_API_KEY'

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={null}>
      <main>
        <Crumbs back={{ href: '/app', label: 'Today' }}>
          <Crumb>Getting started</Crumb>
        </Crumbs>
        <PageHead
          title={`You're live, ${projectSlug}.`}
          lede="Three steps stand between here and your first ingested event — copy your key, paste the snippet, watch it land. No CLI, no config file."
        />

        {/* Step 1 — the key. This is the ONLY render of the plaintext this tenant will ever get.
            `ShownOnce` is the primitive Sprint 4 built for exactly this on Setup › Keys, so both
            reveals now say "you will not see this again" in one voice rather than two. */}
        {plaintextKey ? (
          <ShownOnce
            title="Copy this key now — it is not shown again"
            body="It is on this page for a few more minutes and then never again: only its one-way hash is stored, so this is not a “we’ll email it to you” situation. If it is lost, the only recovery is issuing a new one."
          >
            <CopyField value={plaintextKey} label="Copy your API key" />
            <DismissKeyButton slug={projectSlug} />
          </ShownOnce>
        ) : (
          <Callout>
            The one-time reveal window has passed, or this is a revisit — nothing was silently hidden, and
            nothing below is a real key. Issue a new one from{' '}
            <a href={`/app/setup/keys/${projectSlug}`}>Setup › Keys</a>; it will show once, exactly like this
            would have.
          </Callout>
        )}

        <Card>
          <span className="ds-label">Your first event</span>
          <p className="ds-hint">
            Drop this into a scratch script or an existing route. It genuinely fires an event — nothing to
            fill in{plaintextKey ? '' : ' once GROWTH_ENGINE_API_KEY is set'}.
          </p>
          {/* ≤5 lines of actual code, per the story's acceptance bar: a working import, client
              construction, and one track() call — nothing decorative. */}
          <pre className="ds-code">
            {`import { createGrowthEngineClient } from '@golden-frijoles/sdk'

const engine = createGrowthEngineClient({ baseUrl: '${siteUrl}', apiKey: ${apiKeyExpr}, userId: 'me' })

await engine.track('${STARTER_TARGET_EVENT}', { featureId: '${STARTER_FEATURE_KEY}' })`}
          </pre>
        </Card>

        {/* The connector, only when BOTH gates are open (AGENTS rule #3). No flag-off or
            not-yet-provisioned placeholder section — absence here IS the correct dark-default UI.
            ⚠️ **`isConnectorEnabled()` is asserted HERE as well as at the read above**, and the
            redundancy is deliberate. It is already unreachable — `connectorUrl` is `null` whenever
            the flag is off — but a cross-family reviewer read this render site, could not see the
            gate 60 lines up, and filed it as a rule #3 violation. On the ONE rule AGENTS says never
            to bypass, a reader of the render site should not have to go and check. The finding was
            wrong; that it was reachable at all is the thing worth fixing. */}
        {isConnectorEnabled() && connectorUrl ? (
          <Card>
            <span className="ds-label">Optional — bring your agent</span>
            <p className="ds-hint">
              Your tokenized MCP URL for <strong>{projectSlug}</strong> — read-only, revocable, and no deploy
              required to rotate it.
            </p>
            <CopyField value={connectorUrl} label="Copy your connector URL" />
            <Steps>
              <Step>
                <b>Copy the URL above.</b>
              </Step>
              <Step note="The button opens Claude’s connector dialog. It cannot be pre-filled from a link, so paste the URL yourself.">
                <b>Open Claude&apos;s connector settings.</b>
                <span className="ds-step-action">
                  {/* ⚠️ The design's `Add to Claude ↗`, and the arrow is an `<Icon>`, not the glyph.
                      `check-design-drift.mjs` bans `↗` inside `/app`, and epic F1's answer is
                      explicitly "render it as `<Icon name="external" />`". */}
                  <a
                    className="ds-btn ds-btn--primary"
                    href={ADD_TO_CLAUDE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Add to Claude
                    <Icon name="external" size={13} />
                  </a>
                </span>
              </Step>
              <Step>
                <b>Paste it into the dialog and save.</b> Claude can then read this project&apos;s funnels,
                features and North Star.
              </Step>
            </Steps>
          </Card>
        ) : null}

        <Callout>
          Fired the snippet?{' '}
          <a href={`/app/funnel/${projectSlug}/${STARTER_FEATURE_KEY}`}>Watch it land on your funnel</a> — the{' '}
          <code>{STARTER_FEATURE_KEY}</code> feature is registered for you at signup, so the snippet above
          lands somewhere with nothing else to set up. If the funnel reads zero after your event lands, that
          registration did not complete: re-send it via <code>features/sync</code>, or register your own
          feature and swap the key in that URL. We would rather tell you that than have you stare at a zero
          wondering which half broke.
        </Callout>
      </main>
    </ProductShell>
  )
}
