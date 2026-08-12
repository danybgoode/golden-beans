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
export function ProofSection() {
  return (
    <>
      <SectionDivider number="⑥" title="Proof" />
      <section className="band" id="proof">
        <div className="wrap">
          <h2 className="section-title">Leverage should show up in the numbers.</h2>
          <p className="takeaway">Otherwise this is just a nice landing page.</p>

          <div className="proof-stack">
            <PodReportProof />
            <LiveEngineProof />
          </div>
        </div>
      </section>
    </>
  )
}
