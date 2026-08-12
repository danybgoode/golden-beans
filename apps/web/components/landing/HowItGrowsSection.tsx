import { Panel } from '@/components/ui/Panel'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the three-step "how it grows" band.
//
// Sits immediately after the try-it prompt so the reader who did NOT paste the prompt still gets
// the shape of the product in three sentences. Each card is deliberately about a decision the
// reader makes, not a feature we shipped: pick the goal, connect what knows the truth, ask. The
// primitives that make each one possible are named much later, in §9, for the engineer who will
// ask.
const steps = [
  {
    kicker: '① Pick what winning means',
    title: 'Give it a North Star.',
    copy: 'Start with the goal your company can actually agree on. Your agent now has something better than an opinion to work from.',
    tail: 'One number. Fewer philosophical debates.',
  },
  {
    kicker: '② Connect what knows the truth',
    title: 'Give it context.',
    copy: 'Connect the places that know what customers did, what shipped, and what it cost. Your agent can finally see the same product you do.',
    tail: 'No new dashboard required.',
  },
  {
    kicker: '③ Ask away',
    title: 'Put it to work.',
    copy: 'Ask what to bet on, what changed, whether it worked, or what you should look at next. The answer comes back against the goal.',
    tail: 'With receipts.',
  },
]

export function HowItGrowsSection() {
  return (
    <section className="band section-tight" id="how">
      <div className="wrap">
        <p className="panel-label">How it grows</p>
        <h2 className="section-title">Plant once. Keep asking better questions.</h2>
        <p className="measure">No migration project. No new place for everyone to stare at charts.</p>
        <p className="takeaway">
          Golden Beans gives your agent the product context it needs to work alongside you.
        </p>
        <div className="cards3 section-lead">
          {steps.map((step) => (
            <Panel key={step.kicker}>
              <span className="kicker">{step.kicker}</span>
              <h3 className="card-title">{step.title}</h3>
              <p className="card-copy">{step.copy}</p>
              <p className="micro micro--gold panel-tail">{step.tail}</p>
            </Panel>
          ))}
        </div>
        <p className="note section-lead">
          We considered adding a twelve-week implementation phase here. It tested poorly.
        </p>
      </div>
    </section>
  )
}
