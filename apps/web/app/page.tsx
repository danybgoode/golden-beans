import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { TryItSection } from '@/components/landing/TryItSection'
import { HowItGrowsSection } from '@/components/landing/HowItGrowsSection'
import { OpinionsSection } from '@/components/landing/OpinionsSection'
import { ArgumentSection } from '@/components/landing/ArgumentSection'
import { ProductContextSection } from '@/components/landing/ProductContextSection'
import { PrincipleSection } from '@/components/landing/PrincipleSection'
import { LeverageSection } from '@/components/landing/LeverageSection'
import { ProofSection } from '@/components/landing/ProofSection'
import { BuildItYourselfSection } from '@/components/landing/BuildItYourselfSection'
import { ConnectSection } from '@/components/landing/ConnectSection'
import { SdkSection } from '@/components/landing/SdkSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { Footer } from '@/components/landing/Footer'
import { SelfTrackBeacon } from '@/components/landing/SelfTrackBeacon'

// The Golden Frijoles public landing — the v2 narrative, per
// references/golden-beans-landing-v2.html and Roadmap/02-commercial/landing-redesign-v2/.
//
// Which sections are lit is NOT recorded here. It was — "sections 1, 2, 3①③, 6, 8 fully live;
// 4, 5, 7 honestly teased" — and it went stale three times as §7 (multi-tenant-activation), §5
// (pod-report) and §4 (signals-loop) each flipped, because the epic that lights a section has
// no reason to come and edit a list in a different file. lib/landing-sections.ts is the registry
// and the single source of truth for that; a second copy in prose is a copy that drifts.
//
// ── The order below is the argument, and it is not arbitrary ──────────────────────────────────
// Problem (hero) → try it for free right now (§try) → how it works in three steps (§how) → why
// this is hard (①) → what an agent adds (②) → what it can therefore know (③) → what it is NOT
// allowed to do (④) → what that buys you (⑤) → proof (⑥) → the honest objection (⑦) → how to
// connect (⑧) → the engineer's questions (⑨) → price (⑩) → ask your own agent whether to bother.
// The give-before-you-ask section sits second on purpose: it is the only part of this page a
// reader can use without an account, and burying it below the fold would waste it.
//
// Without this, Next statically optimizes `/` at build time (no dynamic route params on this
// page) — which does two things wrong: the proof section's demo-project numbers would freeze into
// the build's HTML forever (never reflecting a reseed), AND the build itself would try to reach
// Supabase at build time — this repo's `typecheck-build` CI job runs `npm run build` with NO
// Supabase env vars at all (only the separate `e2e` job provisions them), so a build-time
// prerender attempt throws `Missing required env var: SUPABASE_URL` and fails the gate. Every
// other page in this app is already `force-dynamic` in practice (dynamic route params leave no
// other option) — this makes `/` consistent with that, and keeps every flag-derived sentence
// (§4's write gate, §10's signup gate) true per request rather than true at build time.
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <>
      {/* Story 3.1 — dogfood funnel entry beacon (fires `landing_visited`, mints the visitor id). */}
      <SelfTrackBeacon />
      <Nav />
      <Hero />
      <TryItSection />
      <HowItGrowsSection />
      <OpinionsSection />
      <ArgumentSection />
      <ProductContextSection />
      <PrincipleSection />
      <LeverageSection />
      <ProofSection />
      <BuildItYourselfSection />
      <ConnectSection />
      <SdkSection />
      <PricingSection />
      <ClosingCta />
      <Footer />
    </>
  )
}
