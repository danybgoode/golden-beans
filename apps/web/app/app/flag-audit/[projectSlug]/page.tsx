// flags-console-parity · Sprint 3, Story 3.2 — the lifecycle audit gets its own place.
//
// ── MEMBER-readable, and that is load-bearing ─────────────────────────────────────────────────
// `requireProjectMembership`, NOT `requireProjectOwnership`. The audit is member-readable on the
// flags page today, and the story is explicit: "moving it must not quietly make it owner-gated."
// That is the easy mistake here — the credentials route next door tightens to owner-only, and
// copying its shape would silently take the audit away from every member. Ownership is right for
// credentials because listing keys is privileged; it is wrong for an audit, whose whole purpose is
// that the people affected by a change can see who made it.
//
// ── Why the actor pairing matters ─────────────────────────────────────────────────────────────
// `externalActorId` is the verified caller from a scoped external control plane (Miyagi's Clerk).
// Rendered ALONGSIDE the Golden owner, never instead of it: "owner X via Clerk user Y" is what makes
// a Miyagi-initiated flip attributable to a person rather than to a service account.
//
// ── A4 / D1: no query is added ────────────────────────────────────────────────────────────────
// `getFlagRegistryView()` already returns the audit rows the flags page renders. This selects the
// same array onto its own route.

import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled } from '@/lib/flags'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { PageHead } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'
import { FlagAuditTimeline } from './flag-audit-timeline'

export const dynamic = 'force-dynamic'

export default async function FlagAuditPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isFlagConsoleEnabled()) notFound()
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const registry = await getFlagRegistryView(membership.projectId)
  // The audit references versions by id; the label a reader wants is the flag KEY and the version
  // NUMBER. Both are already in the same payload, so this is a join in memory, not a second query.
  const flagKeyById = new Map(registry.flags.map((flag) => [flag.id, flag.key]))
  const versionNumberById = new Map(
    registry.flags.flatMap((flag) => flag.versions.map((version) => [version.id, version.version]))
  )

  return (
    <ProductShell projectSlug={projectSlug} section="ship" railActive={'flag-audit'}>
      <main>
        {/* ── design-system-rails · Story 4.3 — reference state `ship-activity` ────────────────
            The title is **Activity**, which is the word the rail says and the word the design uses.
            "Flag audit" named the TABLE the rows came out of; a person opening this is asking what
            happened, and the answer to that is activity. The stored values are untouched. */}
        <PageHead
          title="Activity"
          lede="Everything anyone has done to a feature in this project, newest first — written as sentences, not as rows of a table nobody reads. Readable by any member."
        />
        <FlagAuditTimeline
          entries={registry.audit}
          flagKeyById={Object.fromEntries(flagKeyById)}
          versionNumberById={Object.fromEntries(versionNumberById)}
        />
      </main>
    </ProductShell>
  )
}
