import { Nav } from '@/components/landing/Nav'
import { MakerHero } from '@/components/landing/MakerHero'
import { MakerLoopSection } from '@/components/landing/MakerLoopSection'
import { OpsSection } from '@/components/landing/OpsSection'
import { AuthoritySection } from '@/components/landing/AuthoritySection'
import { FinOpsSection } from '@/components/landing/FinOpsSection'
import { MethodologySection } from '@/components/landing/MethodologySection'
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
// who this is for (hero) → the loop that makes it work (loop) → how wide it goes (ops) → what stops
// the agent (authority) → what we would build next and have not (finops) → how you would learn it
// (methodology) → what it costs (pricing) → ask your own agent whether to bother (start).
//
// ── Two sections were CUT from that spine, and the argument closed over the gap ────────────────
// `connect` ("Bring your agent" — three routes, all landing on /install) and `sdk` ("For the
// engineers who will ask") both answered "how do I wire this up", which is a question a reader has
// AFTER deciding they want it. On a page whose first job is to establish that the category exists,
// two integration sections sat between the proof and the price and pushed the ask further down. The
// connector is not hidden: /install still mints the tokenized URL, the footer's agent manifest links
// it, and the closing CTA points straight at it.
//
// ── Two more went in agentic-pm-public-surface Sprint 2, and one of them is a real trade ──────
// `product` ("One operating context") argued the same thing as §ops under a second heading, so its
// phrase moved onto §ops's eyebrow and the section went.
//
// `proof` is the consequential one. It carried the Pod Report and a live read of the demo tenant,
// and it was the only non-illustrative thing on a page whose central argument is evidence over
// assertion. Removing it was a deliberate product-owner call (epic D4), on the reasoning that proof
// of something a reader has not yet decided they want is just numbers — and that the hero's handoff
// prompt is stronger evidence anyway, because a reader who pastes it sends their OWN agent to go
// and check us rather than being asked to believe a stat tile.
//
// Recorded because it is the risk: every frame on this page is now a labelled illustration. If the
// page later reads thin on evidence, the live engine read returns as a strip under the hero. Do NOT
// rebuild §proof.
//
// `force-dynamic` STAYS, and its reason narrowed rather than disappeared with §proof. It used to
// carry two: the proof section's demo-project numbers must not freeze into the build's HTML, and
// every flag-derived sentence on this page must be true PER REQUEST. The first is gone with the
// section. The second was always the load-bearing half and is untouched — the Ops panel's SecOps
// gate, the authority section's drill gate and every "Run your first Bet" CTA destination all read
// a flag, and Vercel snapshots env vars into a deployment at build time, so a statically optimized
// `/` would serve whatever the gates happened to be at build.
//
// A comment asserting a reason that no longer exists is CODE-QUALITY #3, which is why this was
// edited rather than left alone when the section it half-described went away.
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
      <OpsSection />
      <AuthoritySection />
      <FinOpsSection />
      <MethodologySection />
      <PricingSection />
      <MakerClosingCta />
      <Footer />
    </>
  )
}
