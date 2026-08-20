import { PROJECT_ROUTE_INVENTORY } from '@/lib/project-route-inventory'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { FunnelBars } from '@/components/ui/FunnelBars'
import { StatCard } from '@/components/ui/StatCard'
import { SurfaceNote } from './SurfaceNote'

// landing-maker-ops · Sprint 2, Story 2.3 — one operating context.
//
// ── The sidebar is DERIVED from the product's own route inventory ─────────────────────────────
// The mockup hand-writes eight sidebar labels. Hand-written, they are wrong the first time a
// surface is added or renamed — and this is the one section whose entire claim is "this is what
// you get", so a stale list here is a claim about the product that the product disagrees with.
//
// `lib/project-route-inventory.ts` is already the single source of truth for every `/app` surface,
// already carries each one's label and audience, and is already unit-tested. It is also
// deliberately pure — no `server-only`, no environment reads, no membership lookup — which is what
// makes it importable from a public page at all. Add a member surface to the product and this
// illustration grows it; rename one and this renames with it.
//
// The filter is `audience: 'member'` minus the flow-only onboarding route: the owner surfaces (API
// keys, destinations, share links, agent write keys) are credential plumbing, and a picture of the
// product that leads with key management is a picture of the wrong product.
//
// ── Every figure here is illustrative, and the frame says so ONCE ─────────────────────────────
// Per-tile caveats are how a page ends up with caveats nobody reads (the reasoning `ContextCard`
// already states). The `SurfaceNote` above the frame carries it, and §proof further down renders a
// genuinely live read in the same chrome — which is exactly why the label has to be there.
//
// The numbers are internally consistent on purpose: the North Star figure IS the retained stage of
// the funnel beside it. A reader who checks gets a product that adds up; a reader who doesn't loses
// nothing. Inventing three unrelated numbers would have been the same amount of work.
const navLabels = PROJECT_ROUTE_INVENTORY.filter(
  (surface) => surface.audience === 'member' && surface.status !== 'flow-only'
).map((surface) => surface.label)

export function OperatingContextSection() {
  return (
    <section className="band" id="product">
      <div className="wrap">
        <p className="eyebrow">One operating context</p>
        <h2 className="section-title">Your product, legible to you and your agents</h2>
        <p className="measure">
          North Star, customer behavior, experiments, releases, operational state and agent activity belong in
          one place — so the next decision starts from what happened, rather than from an empty chat box.
        </p>

        <div className="section-lead">
          <SurfaceNote
            label="A picture of the product"
            detail="Illustration — the live read of a real tenant is further down, in Proof"
          />
          <div className="app-shell">
            <div className="app-bar">
              <span>golden frijoles / proyecto-mágico</span>
            </div>
            <div className="operating-body">
              {/* Decorative: this is a picture of navigation, not navigation. Announcing seven
                  unreachable links before the content would be a menu a screen-reader user cannot
                  use, sitting in front of the section they came for. */}
              <div className="operating-nav" aria-hidden="true">
                {navLabels.map((label, index) => (
                  <span
                    className={`operating-nav__item${index === 0 ? ' operating-nav__item--on' : ''}`}
                    key={label}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="app-body">
                <div className="operating-head">
                  <div>
                    <p className="kicker">North Star</p>
                    <h3>Successful first outcomes</h3>
                  </div>
                </div>

                <div className="stat-grid stat-grid--three section-lead">
                  <StatCard
                    label="North Star"
                    value="1,284"
                    caveat="+12.4% against the previous period"
                    icon="star"
                  />
                  <StatCard label="Activation input" value="46.8%" caveat="+6.1 points" icon="trend-up" />
                  <StatCard label="Open Bets" value="1" caveat="The first-value path" icon="flask" />
                </div>

                <FunnelBars
                  stages={[
                    { label: 'Targeted', value: 4820 },
                    { label: 'Adopted', value: 2255 },
                    { label: 'Retained', value: 1284 },
                  ]}
                  caption="Targeted → Adopted → Retained, the funnel the engine computes for every registered feature."
                />

                <div className="operating-rail">
                  <ActivityFeedItem actor="agent" icon="flag" name="Agent activity">
                    Proposed widening the first-value rollout from 10% to 25%, with the evidence attached.
                    Waiting on you.
                  </ActivityFeedItem>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
