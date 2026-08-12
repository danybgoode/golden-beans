import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ③ From "I think" to "here's why".
//
// Replaces PrimitivesGrid.tsx. The kraft bag label survives — it is the strongest device the brand
// has — but what it lists changed, and the change is the whole repositioning in miniature. The old
// label was a FEATURE GRID with shipped/next badges ("schema-validated telemetry ingest ·
// tenant-scoped"). The new one lists what your agent can UNDERSTAND, in the reader's language,
// with the category as the small print. Same honesty discipline, different question answered:
// the old label answered "what did you build", this one answers "what will it know".
//
// The shipped/next badges did not survive that move, and that is deliberate rather than a quiet
// downgrade: a per-row ✅ made sense when each row was one epic's deliverable. Every row below is
// live today, so a column of identical green ticks would be decoration, and decoration is exactly
// what erodes a badge's meaning for the day one of them genuinely is not. The badge vocabulary is
// still carried by the sections that need it (§4's flags, §6's Pod Report fallback, §10's pricing).

const contextRows = [
  ['Where customers get stuck', 'Behavior'],
  ['What actually moves your North Star', 'Impact'],
  ['Who is doing what — and where they drop off', 'Journeys'],
  ['Safe, gradual releases', 'Releases'],
  ['Which version actually wins', 'Tests'],
  ['Will launch day survive?', 'Risk'],
  ['What changed, in plain English', 'History'],
  ['What your agent is allowed to touch', 'Control'],
  ['Why a decision was made', 'Receipts'],
] as const

// The release list is ILLUSTRATIVE — it shows the SHAPE of release legibility, using the kind of
// rollout the product actually models (a percentage rollout scoped to a country, a closed
// experiment, a stress test awaiting a decision). It is not a read of anyone's releases: a real
// customer's rollouts live behind auth at /app and behind revocable share links, and this page
// shows no client data, ever (the rule PodsProofSection.tsx states at length).
const releases = [
  {
    title: 'Checkout v2 — testing with 10% of customers in Mexico',
    desc: '1 in 10 eligible customers in Mexico sees the new checkout. The other 90% stays on the current version while you measure the difference.',
    status: 'live' as const,
    label: 'TESTING',
  },
  {
    title: 'Quick Upload — experiment finished, chosen version is live',
    desc: 'The test is closed. The version you selected has shipped to its intended audience, with the result kept beside the original bet.',
    status: 'live' as const,
    label: 'SHIPPED',
  },
  {
    title: 'Black Friday readiness — stress test needs your decision',
    desc: 'You simulated launch-day traffic before spending the campaign budget. Review the risk, then keep the plan, reduce exposure, or fix the weak point first.',
    status: 'next' as const,
    label: 'YOUR CALL',
  },
]

const capabilities = [
  {
    kicker: 'What should we bet on?',
    title: 'Compare before six weeks disappear.',
    copy: 'See expected impact, confidence, effort and the cost of waiting.',
    tail: 'Bet with a case',
  },
  {
    kicker: 'Should we ship it?',
    title: 'Turn the decision into a controlled rollout.',
    copy: 'You choose who gets it, how much, and when.',
    tail: 'Your call',
  },
  {
    kicker: 'Did it work?',
    title: 'Measure the bet.',
    copy: 'See whether the thing you shipped moved the number it was supposed to. Not whether the launch announcement collected twelve celebratory reactions.',
    tail: null,
  },
]

export function ProductContextSection() {
  return (
    <>
      {/* Real typographic quotes, not JSX entities: `title` is a string prop, so `&ldquo;` would
          reach the DOM as those six literal characters rather than as a quote mark. */}
      <SectionDivider number="③" title={'From “I think” to “here’s why”'} />
      <section id="product">
        <div className="wrap">
          <h2 className="section-title">Your agent finally has product context.</h2>
          <p className="measure">
            Golden Beans connects what customers do, what your team ships, what you bet on, and whether it
            worked.
          </p>
          <p className="takeaway">It already has the receipts.</p>

          <div className="cards3 section-lead">
            {capabilities.map((capability) => (
              <Panel key={capability.kicker}>
                <span className="kicker">{capability.kicker}</span>
                <h3 className="card-title">{capability.title}</h3>
                <p className="card-copy">{capability.copy}</p>
                {capability.tail && <p className="micro micro--gold panel-tail">{capability.tail}</p>}
              </Panel>
            ))}
          </div>

          <Panel className="section-lead">
            <span className="kicker">What actually happened?</span>
            <h3 className="card-title">The whole story, in one trail.</h3>
            <p className="card-copy">
              See the decision, rollout and result without branches, rebases, or Git archaeology.
            </p>
          </Panel>

          <div className="row2 section-lead row2--start">
            <div className="baglabel">
              <div className="roundstamp">
                ONE
                <br />
                HANDFUL
                <br />
                <span className="roundstamp__stars" aria-label="three stars">
                  <Icon name="star" size={10} />
                  <Icon name="star" size={10} />
                  <Icon name="star" size={10} />
                </span>
              </div>
              <div className="brand">
                <b>GOLDEN BEANS</b>
                <small>WHAT YOUR AGENT GETS TO WORK WITH</small>
              </div>
              <div className="netwt">
                <span>YOUR AGENT CAN UNDERSTAND</span>
                <span>THE PRODUCT</span>
              </div>
              {contextRows.map(([label, category]) => (
                <div className="row" key={label}>
                  <span>{label}</span>
                  <span className="cat">{category}</span>
                </div>
              ))}
              <div className="motto">TECHNICAL UNDER THE HOOD. PM-READABLE ON PURPOSE.</div>
            </div>

            <div>
              {/* "The product UI, not your agent chat" distinguished the two FRAMES but never said
                  the rows were invented — same gap the hero had (PR #92 review). The releases below
                  are a shape, not a read: real ones live behind sign-in. */}
              <SurfaceNote
                label="In Golden Beans /app · releases"
                detail="Illustration — the product UI, not anyone's real releases"
              />
              <Panel>
                <p className="panel-label">Release legibility</p>
                <p className="measure">
                  See what changed in human language: who saw it, what happened, and whether anything still
                  needs your decision.
                </p>
                <div className="release-list">
                  {releases.map((release) => (
                    <div className="release-item" key={release.title}>
                      <div className="release-top">
                        <div>
                          <div className="release-title">{release.title}</div>
                          <div className="release-desc">{release.desc}</div>
                        </div>
                        <Badge status={release.status}>{release.label}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
