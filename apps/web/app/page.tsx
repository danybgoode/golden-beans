import { Nav } from '@/components/landing/Nav'
import { MakerHero } from '@/components/landing/MakerHero'
import { MakerLoopSection } from '@/components/landing/MakerLoopSection'
import { OperatingContextSection } from '@/components/landing/OperatingContextSection'
import { OpsSection } from '@/components/landing/OpsSection'
import { AuthoritySection } from '@/components/landing/AuthoritySection'
import { FinOpsSection } from '@/components/landing/FinOpsSection'
import { MethodologySection } from '@/components/landing/MethodologySection'
import { ProofSection } from '@/components/landing/ProofSection'
import { ConnectSection } from '@/components/landing/ConnectSection'
import { SdkSection } from '@/components/landing/SdkSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { MakerClosingCta } from '@/components/landing/MakerClosingCta'
import { Footer } from '@/components/landing/Footer'
import { SelfTrackBeacon } from '@/components/landing/SelfTrackBeacon'

// The Golden Frijoles public landing, per references/golden-frijoles-maker-ops-landing-v0.2.html
// and Roadmap/02-commercial/landing-maker-ops/ (which supersedes landing-frijoles-rebrand's mockup).
//
// Which sections are lit is NOT recorded here. It was, once, and it went stale three times, because
// the epic that lights a section has no reason to come and edit a list in a different file.
// lib/landing-sections.ts is the registry and the single source of truth for that.
//
// ── The order below is the argument, and it is not arbitrary ──────────────────────────────────
// who this is for (hero) → the loop that makes it work (loop) → where all of it lives (product) →
// how wide it goes (ops) → what stops the agent (authority) → what we would build next and have not
// (finops) → how you would learn it (methodology) → and only then: is any of this real (proof) →
// how to plug your agent in (connect) → the engineer's questions (sdk) → what it costs (pricing) →
// ask your own agent whether to bother (start).
//
// The evidence half sits below the repositioning on purpose, and that is a change from the page
// this replaces. The previous page put its "try it for free right now" second, because it was the
// only part a reader could use without an account. This page's first job is different: it has to
// convince a reader that the category exists at all — that "one maker operating a whole product" is
// a thing you can buy — before proof of a product is worth anything. Proof of something the reader
// has not yet decided they want is just numbers.
//
// Without `force-dynamic`, Next statically optimizes `/` at build time (no dynamic route params on
// this page) — which does two things wrong: the proof section's demo-project numbers would freeze
// into the build's HTML forever (never reflecting a reseed), AND the build itself would try to reach
// Supabase at build time — this repo's `typecheck-build` CI job runs `npm run build` with NO
// Supabase env vars at all (only the separate `e2e` job provisions them), so a build-time prerender
// attempt throws `Missing required env var: SUPABASE_URL` and fails the gate. It is also what keeps
// every flag-derived sentence on this page true PER REQUEST rather than true at build time — the
// Ops panel's SecOps gate, the authority section's drill gate, and every "Run your first Bet" CTA
// destination all read a flag, and Vercel snapshots env vars into a deployment at build time.
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <>
      {/* Story 3.1 — dogfood funnel entry beacon (fires `landing_visited`, mints the visitor id).
          It stays first through every redesign: it is the only instrumentation on this page, and
          the landing → signup conversion this epic is judged on is read through it. */}
      <SelfTrackBeacon />
      <Nav />
      <MakerHero />
      <MakerLoopSection />
      <OperatingContextSection />
      <OpsSection />
      <AuthoritySection />
      <FinOpsSection />
      <MethodologySection />
      <ProofSection />
      <ConnectSection />
      <SdkSection />
      <PricingSection />
      <MakerClosingCta />
      <Footer />
    </>
  )
}
