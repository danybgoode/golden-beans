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
        <p className="eyebrow">One project, many operations</p>
        <h2 className="section-title">Run the whole operation</h2>
        <p className="measure">
          You do not have to become every department. Golden Frijoles gives a maker and their agents one set
          of rails across the surfaces a real product needs to grow.
        </p>

        <div className="section-lead">
          <OpsTabs surfaces={surfaces} />
        </div>
      </div>
    </section>
  )
}
