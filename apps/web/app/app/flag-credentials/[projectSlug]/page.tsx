// flags-console-parity · Sprint 3, Story 3.1 — key management gets its own place.
//
// ── Why this route exists ─────────────────────────────────────────────────────────────────────
// The flags page opened with three credential-minting forms above the thing an operator came for.
// Flagsmith puts SDK keys on their own screen for the same reason: minting a key is a deliberate,
// occasional act, and the daily job is reading flags.
//
// ── The authorization boundary moves TIGHTER, and that is deliberate ─────────────────────────
// On the flags page a member could LOAD the page and simply see no key tables — `canManage` gated
// the markup, not the route. Here the route itself requires ownership, so a member gets a 404 and
// does not learn the URL exists. That is the `/app/keys/[projectSlug]` precedent (itself
// cross-review-hardened, 2026-07-20 round 2) and it is what the inventory's `audience: 'owner'`
// already declares. Both satisfy "a member cannot list keys"; this one is strictly stronger, and
// the story's line — "the authorization boundary does not move with the markup" — is honoured by
// moving it only in the safe direction. Stated out loud rather than left for review to notice.
//
// ── Dark means nonexistent ────────────────────────────────────────────────────────────────────
// The gate is checked BEFORE auth, so while the console is dark this 404s for everyone — and the
// forms are still on the flags page, because `flag-manager.tsx` renders them whenever
// `showDefinitions` is true. That is Amendment 1's gate-conditional move: the controls exist in
// exactly one place in either state, never zero.

import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled } from '@/lib/flags'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { ProductShell } from '@/components/product/ProductShell'
import { FlagCredentialManager } from './flag-credential-manager'

export const dynamic = 'force-dynamic'

export default async function FlagCredentialsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isFlagConsoleEnabled()) notFound()
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const [keys, syncKeys] = await Promise.all([listFlagReadKeys(projectId), listFlagSyncKeys(projectId)])

  return (
    <ProductShell projectSlug={projectSlug}>
      <main>
        <h1>Flag credentials — {projectSlug}</h1>
        <p>
          <a href={`/app/flags/${projectSlug}`}>← All features</a>
        </p>
        <p>
          Two kinds of key, revocable independently. A <strong>snapshot key</strong> lets a client read this
          project&apos;s flags for one environment. A <strong>catalog sync key</strong> lets one service
          publish flag definitions; it can never turn a feature on or off.
        </p>
        <FlagCredentialManager slug={projectSlug} keys={keys} syncKeys={syncKeys} />
      </main>
    </ProductShell>
  )
}
