import { SectionDivider } from '@/components/ui/SectionDivider'
import { LiveEngineProof } from './LiveEngineProof'
import { PodReportProof } from './PodReportProof'

// landing-redesign-v2 · Sprint 2, Story 2.3 — ⑥ Proof.
//
// ── Why this section carries TWO proofs (epic D2) ─────────────────────────────────────────────
// The v2 mockup's §6 is the Pod Report alone, and it drops the live-proof section the previous
// landing led with. Reinstating it was a deliberate product-owner call, for a reason specific to
// what this page now claims: the whole argument above is that decisions should come with receipts.
// A page making that argument, whose only evidence is a set of stat tiles and several explicitly
// illustrated conversations, is asking to be taken on trust — which is the thing it just spent
// nine sections arguing against.
//
// So §6 answers two different questions and says which is which:
//   1. PodReportProof   — how fast does the pod that builds this actually ship? Computed from this
//                         repository's own git and PR history, with the things it cannot measure
//                         listed beside the things it can.
//   2. LiveEngineProof  — is the engine real? A read of the synthetic demo tenant performed while
//                         this page rendered, against the same public endpoint a stranger can curl.
//
// Neither is a claim about a customer. The Pod Report is our own delivery history, published on
// purpose; the live read is the synthetic demo project. No client data appears on this page, ever
// — the rule PodReportProof.tsx states at length and this composition does not weaken.
// ── The stamps were renumbered by landing-maker-ops, and that is not cosmetic ─────────────────
// These four sections used to be §6, §8, §9 and §10 of a ten-stamp argument. The maker-ops spine
// replaced §1–§5 and §7 with sections that carry no stamps, which left four kraft discs reading
// 6, 8, 9, 10 above a page whose 1 through 5 no longer exist — a numbering that describes a
// document nobody can read any more. They are now 1–4: the closing act the page actually has, in
// the order it argues it. Is any of this real (1) → how do I plug in (2) → what will my engineers
// ask (3) → what does it cost (4).
export function ProofSection() {
  return (
    <>
      <SectionDivider number={1} title="Proof" />
      <section className="band" id="proof">
        <div className="wrap">
          <h2 className="section-title">Leverage should show up in the numbers</h2>
          <p className="takeaway">Otherwise this is just a nice landing page.</p>
          {/* ── The audience switches here, and it now says so ────────────────────────────────
              Flagged in Sprint 3's cross-family copy pass as a contradiction: the page opens on
              "one maker, a whole operation" and this section's Pod Report headline is addressed to
              someone who has a dev team.

              It is not a contradiction — it is an unannounced audience switch. This page sells two
              things: the product, to a maker, and Pods, to a team that would hire one. The Pod
              Report is the evidence for the second, computed from our own delivery history. So the
              fix is one sentence naming the switch, not a rewrite of what the Pod Report is; the
              alternative (making the headline maker-shaped) would have described the report as
              something it is not. */}
          <p className="measure">
            Two of these are about us rather than about you. If you are a maker working alone, the first one
            is the case for Pods — skip it. The second is the engine you would actually be using, read live.
          </p>

          <div className="proof-stack">
            <PodReportProof />
            <LiveEngineProof />
          </div>
        </div>
      </section>
    </>
  )
}
