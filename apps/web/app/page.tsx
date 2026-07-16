import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { LiveProofSection } from '@/components/landing/LiveProofSection'
import { OperateRoutes } from '@/components/landing/OperateRoutes'
import { Teaser } from '@/components/landing/Teaser'
import { PrimitivesGrid } from '@/components/landing/PrimitivesGrid'
import { WaitlistSection } from '@/components/landing/WaitlistSection'
import { Footer } from '@/components/landing/Footer'
import { getSection } from '@/lib/landing-sections'

// The Golden Beans public landing — sections per references/landing-end-state.md's section map,
// the Sprint 1 ("E1 launch cut") slice: sections 1, 2, 3①③, 6, 8 fully live; 4, 5, 7 honestly
// teased/split per each section's own lit-epic. See references/design/e1.html for the reference
// implementation this page ports.
//
// Without this, Next statically optimizes `/` at build time (no dynamic route params on this
// page) — which does two things wrong: LiveProofSection's demo-project numbers would freeze into
// the build's HTML forever (never reflecting a reseed), AND the build itself would try to reach
// Supabase at build time — this repo's `typecheck-build` CI job runs `npm run build` with NO
// Supabase env vars at all (only the separate `e2e` job provisions them), so a build-time
// prerender attempt throws `Missing required env var: SUPABASE_URL` and fails the gate. Every
// other page in this app is already `force-dynamic` in practice (dynamic route params leave no
// other option) — this makes `/` consistent with that, and "the actual engine, live" a true claim
// on every request, not a periodically-stale one.
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <LiveProofSection />
      <OperateRoutes />
      <Teaser
        title={<>The loop ends in <em style={{ fontStyle: 'normal', color: 'var(--gold)' }}>your</em> agent.</>}
        body="Signal → structured task → your agent, over MCP → a fix in your workflow. This section lights up in the same epic that ships the capability — or it doesn't light up at all."
        epic={getSection('inverted-loop').epic}
      />
      <Teaser
        title="Your dev team, as a revenue engine."
        body="The Pod Report — velocity, cycle time, DORA, cost per shipped point, agent-augmented vs human-baseline — computed from dated dogfood history. Computed, not claimed: which is exactly why there are no numbers here yet."
        epic={getSection('pods-proof').epic}
        band
      />
      <PrimitivesGrid />
      <WaitlistSection />
      <Footer />
    </>
  )
}
