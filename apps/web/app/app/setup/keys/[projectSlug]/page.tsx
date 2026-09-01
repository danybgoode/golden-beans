import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listProjectKeys } from '@/lib/api-keys'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { listAgentWriteKeys } from '@/lib/agent-write-keys'
import {
  buildCredentialInventory,
  isCurrentlyUsable,
  CREDENTIAL_KINDS_NOT_LISTED,
} from '@/lib/credential-inventory'
import { Callout } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'
import { KeysSurface } from './keys-surface'

// Setup › Keys — the one page that owns this project's credentials.
//
// ── design-system-rails · Sprint 4, Story 4.5 ✳ Daniel's complaint ────────────────────────────
// This page listed credentials and sent you somewhere else to make one. The previous sprint said so
// out loud and gave an honest reason — *"the four forms take materially different inputs, so this
// sprint merged the list rather than half-merging the forms"* — and then the page named for the job
// could not do the job. **Minting moves here in the same commit that retires `/app/keys`,
// `/app/flag-credentials` and `/app/agent-keys`**, which is the ordering rule this epic keeps: land
// the replacement and retire the original together, never as a cleanup story.
//
// ── The gate: OWNER, at the route, unchanged — and no longer console-gated ────────────────────
// ⚠️ `isConsoleShellEnabled()` is GONE from this page, and dropping it was forced by the retirement
// rather than chosen. While the three legacy routes minted, this page was an additional surface and
// gating it cost nothing. Now it is the ONLY surface: a `CONSOLE_SHELL_ENABLED=false` rollback would
// have left a project unable to issue any credential at all, and the legacy routes redirect HERE, so
// the rollback would have produced a redirect loop into a 404. The auth boundary is untouched —
// `requireProjectOwnership` at the route, exactly as all four surfaces have always had it, and a
// member still gets a flat 404 (`lib/setup-route-guards.test.ts` pins that).
export const dynamic = 'force-dynamic'

export default async function SetupKeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)

  // ⚠️ ALWAYS read all four, and keying any of them on a flag was wrong. `FLAG_CONSOLE_ENABLED`
  // gates the flags *UI*; it does not gate whether these credentials SERVE. `flag_read` serves via
  // `/api/v1/flags/snapshot` behind `FLAG_SERVING_ENABLED`, and `flag_sync` via
  // `/api/v1/flags/sync` behind `FLAG_DEFINITION_SYNC_ENABLED`. Suppressing them meant a project
  // with live, serving flag credentials rendered a page that listed none of them, under a heading
  // claiming to list everything.
  const [apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys] = await Promise.all([
    listProjectKeys(projectId),
    listFlagReadKeys(projectId),
    listFlagSyncKeys(projectId),
    listAgentWriteKeys(projectId),
  ])

  const rows = buildCredentialInventory({ apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys })
  const usableCount = rows.filter((row) => isCurrentlyUsable(row)).length

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'setup/keys'}>
      <main>
        {/* ⚠️ The head, the mint flow and the list are ONE client component — see `keys-surface.tsx`.
            They share a single piece of state (is a credential on screen right now?), and sprint
            contract #7's "on a screen of its own" is a claim about the whole page rather than about
            one panel. */}
        <KeysSurface slug={projectSlug} rows={rows} />

        <p className="ds-foot">
          {/* Counts what can actually AUTHENTICATE, not what is merely unrevoked. An expired key is
              rejected on every serving path, so counting it would make this page's own "what has
              access now" false. Expired rows still render — an owner cleaning up wants to see them —
              they just are not counted. */}
          {usableCount} credential{usableCount === 1 ? '' : 's'} can reach this project right now
          {rows.length > usableCount ? `, and ${rows.length - usableCount} have expired` : ''}. Revoked keys
          are not listed at all.
        </p>

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
                <a href={`${entry.where}/${projectSlug}`}>{entry.label}</a>
              )}
              {`: ${entry.why}`}
            </span>
          ))}
        </Callout>

        <Callout>
          The key value is shown <b>once</b>, on a screen of its own, with a copy button. It is never a value
          you read off this table or type back in — only its hash is stored, so nothing here can show it to
          you a second time.
        </Callout>
      </main>
    </ProductShell>
  )
}
