import {
  isDestinationDeliveryEnabled,
  isResilienceScenariosEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { MAKER_OPS_SURFACES, resolveSurfaceStatus } from '@/lib/maker-ops'
import { OpsTabs, type ResolvedSurface } from './OpsTabs'

// landing-maker-ops · Sprint 2, Story 2.4 — the server half of the Ops panel.
//
// This component exists to do one thing the client half cannot: read the gates. Both flags are read
// fresh per request (`app/page.tsx` is `force-dynamic`, so this is a real read on every load rather
// than a value frozen into the build), and the resolved status travels down as a prop.
//
// That split is what keeps epic D3 true. Flip `RESILIENCE_SCENARIOS_ENABLED` and
// `SECURITY_SIMULATIONS_ENABLED` on in production and the SecOps "partly gated" line disappears by
// itself, with no edit here, none in `maker-ops.ts`, and none in the client component. Nobody has
// to remember, which is the only reliable kind of correctness for a claim on a public page.
//
// ── This is now the ONLY place the surfaces are derived, and it must stay that way ────────────
// Moved here from `MakerHero.tsx` by agentic-pm-public-surface Sprint 2, which deleted the hero's
// kraft bag. The reasoning travels with the derivation rather than being deleted with the markup,
// because it is what stops someone re-introducing the defect it was the fix for:
//
// The bag once carried a HAND-WRITTEN list of the four surfaces, parallel to `MAKER_OPS_SURFACES`.
// That duplication cost three separate review findings which were all the same defect — a gated
// capability listed without its qualification, found once per surface, because fixing one list
// never reached the other (SecOps in round 4, DevOps in round 5, after this panel itself in round
// 3). A badge on the third one would have been the third patch for one root cause.
//
// Deriving instead makes the class unrepresentable (CODE-QUALITY #2): a surface cannot be qualified
// in one place and bare in another, because there is one list and one status resolution. If a
// second surface on this site ever needs to name these capabilities, it imports `maker-ops.ts` and
// resolves the gates per request. It does not write them down.
export function OpsSection() {
  const gates = {
    resilienceScenariosEnabled: isResilienceScenariosEnabled(),
    securitySimulationsEnabled: isSecuritySimulationsEnabled(),
    destinationDeliveryEnabled: isDestinationDeliveryEnabled(),
  }

  const surfaces: ResolvedSurface[] = MAKER_OPS_SURFACES.map((surface) => ({
    ...surface,
    resolved: resolveSurfaceStatus(surface, gates),
  }))

  return (
    <section id="ops">
      <div className="wrap">
        {/* The phrase survives the section that carried it. §product ("One operating context") made
            this same argument under a second heading and was deleted in agentic-pm-public-surface
            Sprint 2 — the eyebrow is where its one good line went. */}
        <p className="eyebrow">One operating context</p>
        <h2 className="section-title">Run the whole operation</h2>
        {/* Epic D1 — the borrowed register, re-pointed. The enterprise version of this paragraph
            sells identity, governance, security and spend control to a buyer with departments for
            each. The SURFACE is the same one; the scale is not. So these are named as things one
            person holds, never as an admin console for other people's employees. */}
        <p className="measure">
          Identity and access, governance, security, spend — a real product needs all of it, and the usual
          answer is a department for each. Golden Frijoles gives a maker and their agents one set of rails
          across the whole surface instead, so owning the product does not mean becoming five teams.
        </p>

        <div className="section-lead">
          <OpsTabs surfaces={surfaces} />
        </div>
      </div>
    </section>
  )
}
