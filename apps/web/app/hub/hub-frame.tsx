/** @jsxImportSource react */
// Pragma: a no-op under Next and required by the test rail — Playwright's transform pins its own
// jsx runtime, whose elements react-dom/server refuses to render. Same line, same reason, in
// `hub-components.tsx` and `report-components.tsx`.
import type { ReactNode } from 'react'
import { Frame } from '@/design-system/Frame'

// design-system-rails · Sprint 6, Story 6.3 — the hub's chrome, in one place.
//
// ── Why the hub gets a frame of its own and not a fifth console section (DD2) ──────────────────
// The console answers *how is the product doing*; the hub answers *how is the work doing*. Making
// it a fifth section would break the approved "four destinations" and put a roadmap tab in front of
// every operator who came to look at a funnel. So it is the console's PEER: the same bar, its own
// tier 2, and a way back.
//
// ⚠️ **The bar is the PUBLIC frame's, not `ProductShell`'s three tiers, and that is a recorded
// deviation.** The prototype draws the hub with the console's full tier 1 — project switcher, ⌘K,
// account menu. Reproducing that needs `getShellNav`, `CommandPalette` and the section arithmetic,
// i.e. `ProductShell` itself, whose `section` prop is a CLOSED union of the four console sections
// (`lib/console-shell.ts`). Adding a fifth member to that union to render a page that is
// deliberately not a section would be re-deciding DD2 in a type, in the sprint that also deletes
// `.product-shell`. The bar carries the mark, the project it is showing, the three hub tabs and the
// way back to the console — which is every destination the hub screens actually offer.
//
// Written down rather than left to be noticed: the console's switcher and ⌘K are not reachable from
// a hub page, and getting them there is a follow-up, not an oversight.

export type HubTab = 'roadmap' | 'horizon' | 'report'

const TABS: readonly { id: HubTab; label: string; path: (slug: string) => string }[] = [
  { id: 'roadmap', label: 'Roadmap', path: (slug) => `/hub/${slug}` },
  { id: 'horizon', label: 'Horizon', path: (slug) => `/hub/${slug}/horizon` },
  { id: 'report', label: 'Report', path: (slug) => `/hub/${slug}/report` },
]

export function HubFrame({
  projectSlug,
  tab,
  children,
}: {
  projectSlug: string
  tab: HubTab
  children: ReactNode
}) {
  const slug = encodeURIComponent(projectSlug)
  return (
    <Frame
      variant="hub"
      brandHref="/app"
      scope={projectSlug}
      actions={
        // Not a `FrameLink`: this is the way OUT of the hub and back to the product, which is a
        // quiet move rather than a call to action. The approved hub screens carry it in their page
        // head; putting it in the bar means every hub screen has it in the same place, including
        // the ones whose head is a breadcrumb.
        <a className="ds-btn ds-btn--secondary ds-btn--sm" href="/app">
          Back to the console
        </a>
      }
      nav={TABS.map((entry) => (
        <a key={entry.id} href={entry.path(slug)} aria-current={entry.id === tab ? 'page' : undefined}>
          {entry.label}
        </a>
      ))}
    >
      {children}
    </Frame>
  )
}
