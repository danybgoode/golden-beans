'use client'
import { Callout, PageHead } from '@/design-system/primitives'

// portfolio-view · Sprint 2, Story 2.1 — the approved `portfolio-error` state. Reached when the viewer's own workspaces
// or projects could not be read (both reads THROW rather than answer "none", which would render an outage as an empty
// workspace). One cell failing never lands here — it says "couldn't load" in its own cell (D2, D7).
export default function PortfolioError({ reset }: { error: Error; reset: () => void }) {
  return (
    // Outside the (async, server-only) console shell, so this state carries the design system's scope itself.
    <div className="ds">
      <main>
        <div data-portfolio-state="error">
          <PageHead
            title="Your workspace"
            lede="Every product you belong to, on one page."
            actions={
              <button type="button" className="ds-btn ds-btn--secondary" onClick={reset}>
                Try again
              </button>
            }
          />
          <Callout tone="warn">Couldn&apos;t load your workspace. Try again.</Callout>
        </div>
      </main>
    </div>
  )
}
