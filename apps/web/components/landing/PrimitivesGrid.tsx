import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { SectionDivider } from '@/components/ui/SectionDivider'

const shipped = [
  'schema-validated telemetry ingest · tenant-scoped',
  'TypeScript SDK · track / trackAdoption / bucket',
  'feature registry + TARS funnels',
  'North Star metric + per-feature impact',
  'A/B comparison (basic lift)',
  'signed event destinations · at-least-once, with retries',
]

const next = [
  ['read-only MCP connector', 'Sprint 2'],
  ['self-serve tenants & auth hardening', 'multi-tenant-activation'],
  ['pod report (velocity, DORA, cost per point)', 'pod-report'],
  ['the inverted loop (signal → your agent → fix)', 'signals-loop'],
]

export function PrimitivesGrid() {
  return (
    <>
      <SectionDivider number="⑥" title="What's in the handful">
        <Badge status="live" onKraft>
          LIVE — rows flip as epics ship
        </Badge>
      </SectionDivider>
      <section id="primitives">
        <div className="wrap row2 primitives-grid">
          <div className="primitives-grid__copy">
            <h2 className="section-title">Primitives, honestly badged.</h2>
            <p>
              The label is the feature grid. If a row says shipped, you can curl it today* — the badge flips
              in the same epic that ships the capability, or it doesn&apos;t flip at all.
            </p>
            <p className="note">
              * Try it: GET /api/v1/public/north-star on the demo project. No sales call required.
            </p>
          </div>
          <div className="baglabel">
            <div className="roundstamp">
              PLANT
              <br />
              GROW
              <br />
              <span className="roundstamp__stars" aria-label="three stars">
                <Icon name="star" size={10} />
                <Icon name="star" size={10} />
                <Icon name="star" size={10} />
              </span>
            </div>
            <div className="brand">
              <b>GOLDEN BEANS</b>
              <small>LIMITLESS GROWTH PRIMITIVES</small>
            </div>
            <div className="netwt">
              <span>YIELD</span>
              <span>6 primitives shipped · 4 climbing</span>
            </div>
            {shipped.map((label) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <Badge status="live" onKraft>
                  SHIPPED
                </Badge>
              </div>
            ))}
            {next.map(([label, milestone]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <Badge status="next" onKraft>
                  {milestone}
                </Badge>
              </div>
            ))}
            <div className="foot">
              <span>INTEGRATED AI</span>
              <span>0g (0% DV)</span>
            </div>
            <div className="motto">PLANT ONE FACT · GROW THE NEXT MOVE THROUGH YOUR OWN AGENT</div>
          </div>
        </div>
      </section>
    </>
  )
}
