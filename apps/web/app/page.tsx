import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { TryItSection } from '@/components/landing/TryItSection'
import { HowItGrowsSection } from '@/components/landing/HowItGrowsSection'
import { InfomercialSection } from '@/components/landing/InfomercialSection'
import { OpinionsSection } from '@/components/landing/OpinionsSection'
import { ArgumentSection } from '@/components/landing/ArgumentSection'
import { ProductContextSection } from '@/components/landing/ProductContextSection'
import { ResilienceSection } from '@/components/landing/ResilienceSection'
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

// The Golden Frijoles public landing, per references/golden-frijoles-landing-v2.html and
// Roadmap/02-commercial/landing-frijoles-rebrand/ (which supersedes landing-redesign-v2's mockup).
//
// Which sections are lit is NOT recorded here. It was — "sections 1, 2, 3, 6, 8 fully live;
// 4, 5, 7 honestly teased" — and it went stale three times as §7 (multi-tenant-activation), §5
// (pod-report) and §4 (signals-loop) each flipped, because the epic that lights a section has
// no reason to come and edit a list in a different file. lib/landing-sections.ts is the registry
// and the single source of truth for that; a second copy in prose is a copy that drifts.
//
// ── The order below is the argument, and it is not arbitrary ──────────────────────────────────
// Problem (hero) → try it for free right now (§try) → how it works in three steps (§how) → the
// joke that proves there is a person here (§infomercial) → why this is hard (1) → what an agent
// adds (2) → what it can therefore know (3) → what you can rehearse before it costs you
// (§resilience) → what it is NOT allowed to do (4) → what that buys you (5) → proof (6) → the
// honest objection (7) → how to connect (8) → the engineer's questions (9) → price (10) → ask your
// own agent whether to bother.
//
// The give-before-you-ask section sits second on purpose: it is the only part of this page a
// reader can use without an account, and burying it below the fold would waste it. The two
// unnumbered bands are unnumbered deliberately — the stamps carry the spine of the argument, and
// an aside and a capability showcase are not steps in it.
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
      <InfomercialSection />
      <OpinionsSection />
      <ArgumentSection />
      <ProductContextSection />
      <ResilienceSection />
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
