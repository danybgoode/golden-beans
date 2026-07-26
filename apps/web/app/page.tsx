import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { LiveProofSection } from '@/components/landing/LiveProofSection'
import { OperateRoutes } from '@/components/landing/OperateRoutes'
import { InvertedLoopSection } from '@/components/landing/InvertedLoopSection'
import { PodsProofSection } from '@/components/landing/PodsProofSection'
import { PrimitivesGrid } from '@/components/landing/PrimitivesGrid'
import { WaitlistSection } from '@/components/landing/WaitlistSection'
import { Footer } from '@/components/landing/Footer'
import { SelfTrackBeacon } from '@/components/landing/SelfTrackBeacon'

// The Golden Beans public landing — sections per references/landing-end-state.md's section map.
// See references/design/e1.html for the reference implementation this page ports.
//
// Which sections are lit is NOT recorded here. It was — "sections 1, 2, 3①③, 6, 8 fully live;
// 4, 5, 7 honestly teased" — and it went stale three times as §7 (multi-tenant-activation), §5
// (pod-report) and now §4 (signals-loop) each flipped, because the epic that lights a section has
// no reason to come and edit a list in a different file. lib/landing-sections.ts is the registry
// and the single source of truth for that; a second copy in prose is a copy that drifts.
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
      {/* Story 3.1 — dogfood funnel entry beacon (fires `landing_visited`, mints the visitor id). */}
      <SelfTrackBeacon />
      <Nav />
      <Hero />
      <LiveProofSection />
      <OperateRoutes />
      <InvertedLoopSection />
      <PodsProofSection />
      <PrimitivesGrid />
      <WaitlistSection />
      <Footer />
    </>
  )
}
