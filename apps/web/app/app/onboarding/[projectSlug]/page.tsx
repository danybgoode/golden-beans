import { requireProjectMembership } from '@/lib/dashboard-auth'
import { readOnboardingKeyFor } from '@/lib/onboarding-key'
import { DismissKeyButton } from './dismiss-key-button'
import { getActiveConnectorUrl } from '@/lib/connector-tokens'
import { isConnectorEnabled } from '@/lib/flags'
import { getSiteUrl } from '@/lib/site-url'
import { CopyUrlField } from '@/components/landing/CopyUrlField'
import { STARTER_FEATURE_KEY, STARTER_TARGET_EVENT } from '@/lib/provisioning'

// multi-tenant-activation · Sprint 2, Story 2.3 — the first-run screen a freshly confirmed
// signup lands on: the one-time key reveal, a ≤5-line SDK snippet pre-filled with it, and (gated)
// the MCP connector URL. Everything on this page must be actionable from on-screen steps alone —
// that's the story's acceptance bar, not just "renders something."
//
// `force-dynamic`: every section below reads live per-request state (the onboarding cookie, a
// DB-backed connector token, the membership gate) — same rationale as app/install/page.tsx and
// app/page.tsx, never build-time-frozen.
export const dynamic = 'force-dynamic'

// Same URL as app/install/page.tsx (Story 2.2) — verified live against mb's shipped
// ConnectAgentPanel; the add-custom-connector modal takes no URL param, so the visitor pastes the
// copied URL themselves. One canonical constant would belong in a shared lib, but install/page.tsx
// isn't ours to touch this sprint (see this story's file-ownership note) — duplicating a literal
// URL string is a smaller risk than reaching into a file another agent owns mid-sprint.
const ADD_TO_CLAUDE_URL = 'https://claude.ai/customize/connectors?modal=add-custom-connector'

// The snippet fires the SAME feature the provisioner registered for this tenant (Story 2.1 —
// lib/provisioning.ts's registerStarterFeature), imported rather than re-typed so the two can
// never drift apart. That drift is not cosmetic: lib/tars-query.ts filters events by
// `feature_id = <featureKey>`, so an event whose featureId doesn't match a registered feature
// key produces a funnel that renders an honest, permanent zero.
//
// This is the "realistic input" lesson from Roadmap/LEARNINGS.md applied ahead of time: the A/B
// bug in growth-engine-v1 S4 was exactly this shape — a query that silently required a featureId
// tag the realistic caller had no reason to set. Here the snippet the tenant actually pastes sets
// it explicitly, so the acceptance ("the funnel page shows it") is true for the pasted snippet,
// not merely for a hand-tuned one.

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
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
    <main className="wrap" style={{ padding: '56px 0 80px' }}>
      <p style={{ marginBottom: 24 }}>
        <a href="/app">&larr; Your projects</a>
      </p>

      <h1 className="display" style={{ fontSize: 34, maxWidth: 640 }}>
        You&apos;re live, {projectSlug}.
      </h1>
      <p style={{ margin: '14px 0 36px', color: 'var(--dim)', maxWidth: 600 }}>
        Three steps stand between here and your first ingested event — copy your key, paste the
        snippet, watch it land. No CLI, no config file.
      </p>

      {/* Step 1 — the key. This is the ONLY render of the plaintext this tenant will ever get. */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>
            ① YOUR API KEY
          </span>
          {plaintextKey && (
            <span className="tag" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
              COPY IT NOW
            </span>
          )}
        </div>
        {plaintextKey ? (
          <>
            <p style={{ fontSize: 14, color: 'var(--red)', fontWeight: 700, margin: '0 0 16px' }}>
              Copy this now. It is visible on this page for a few more minutes and then never
              again — we store only its one-way hash, so this isn&apos;t a &quot;we&apos;ll email
              it to you&quot; situation. If it&apos;s lost, the only recovery is issuing a new one.
              Hit the button below the moment you&apos;ve saved it.
            </p>
            <CopyUrlField url={plaintextKey} />
            <DismissKeyButton slug={projectSlug} />
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--dim)' }}>
            The one-time reveal window has passed (or this is a revisit) — nothing was silently
            hidden, and nothing below is a real key. Head to{' '}
            <a href={`/app/keys/${projectSlug}`}>API keys</a> and issue a new one; it will show
            once, exactly like this would have.
          </p>
        )}
      </div>

      {/* Step 2 — the SDK snippet. ≤5 lines of actual code per the story's acceptance bar: a
          working import, client construction, and one track() call — nothing decorative. */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>
            ② PASTE THIS
          </span>
        </div>
        <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Your first event</h2>
        <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 16px' }}>
          Drop this into a scratch script or an existing route. It genuinely fires an event —
          nothing to fill in{plaintextKey ? '' : " once GROWTH_ENGINE_API_KEY is set"}.
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
{`import { createGrowthEngineClient } from '@golden-beans/sdk'

const engine = createGrowthEngineClient({ baseUrl: '${siteUrl}', apiKey: ${apiKeyExpr}, userId: 'me' })

await engine.track('${STARTER_TARGET_EVENT}', { featureId: '${STARTER_FEATURE_KEY}' })`}
        </pre>
      </div>

      {/* Step 3 — the connector, only when BOTH gates are open (AGENTS rule #3). No flag-off or
          not-yet-provisioned placeholder section — absence here IS the correct dark-default UI. */}
      {isConnectorEnabled() && connectorUrl && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>
              ③ OPTIONAL — BRING YOUR AGENT
            </span>
            <span className="tag tag-live">✅ LIVE</span>
          </div>
          <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Paste it into Claude</h2>
          <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 16px' }}>
            Your tokenized MCP URL for <b style={{ color: 'var(--crema)' }}>{projectSlug}</b> —
            read-only, revocable, no deploy required to rotate it.
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
        </div>
      )}

      {/* Closing — where to actually watch the event land, and the way back. */}
      <p style={{ marginTop: 8, color: 'var(--dim)' }}>
        Fired the snippet?{' '}
        <a href={`/app/funnel/${projectSlug}/${STARTER_FEATURE_KEY}`}>Watch it land on your funnel</a>{' '}
        <small className="note">
          — the &quot;{STARTER_FEATURE_KEY}&quot; feature is registered for you at signup so the
          snippet above lands somewhere with nothing else to set up. If the funnel reads zero after
          your event lands, that registration didn&apos;t complete: re-send it via features/sync (or
          register your own feature and swap the key in this URL). We&apos;d rather tell you that
          than have you stare at a zero wondering which half broke.
        </small>
      </p>
      <p style={{ marginTop: 10 }}>
        <a href="/app">&larr; Back to your projects</a>
      </p>
    </main>
  )
}
