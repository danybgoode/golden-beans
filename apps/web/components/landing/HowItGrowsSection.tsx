import { Panel } from '@/components/ui/Panel'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the three-step band.
// landing-frijoles-rebrand · Sprint 2 — the mockup's copy, and steps that are numbered as steps.
//
// Sits immediately after the try-it prompt so the reader who did NOT paste the prompt still gets
// the shape of the product in three sentences. Each card is deliberately about a decision the
// reader makes, not a feature we shipped: pick the goal, connect what knows the truth, work it.
// The primitives that make each one possible are named much later, in §9, for the engineer who
// will ask.
//
// The kickers used to be `① ② ③` glyphs, which the section-stamp work (epic D4) retired for the
// same legibility reason it retired them from the dividers — at 12px the enclosing ring eats most
// of the em box. "Step 1" is also simply clearer for a numbered procedure.
const steps = [
  {
    kicker: 'Step 1 · Pick what winning means',
    title: 'Give it a North Star',
    copy: 'Run the North Star workshop with your agent. Leave with one measurable goal and the inputs that move it.',
    tail: 'Roughly more useful than “growth”.',
  },
  {
    kicker: 'Step 2 · Connect what knows the truth',
    title: 'Connect Golden Frijoles',
    copy: 'Give your agent the live context behind the goal: what customers did, what changed, what you tried, and what happened.',
    tail: 'Now it knows your product too.',
  },
  {
    kicker: 'Step 3 · Figure things out together',
    title: 'Put it to work',
    copy: 'Shape an idea. Compare bets. Follow the build. Test the release. Miss occasionally. Learn. Go again.',
    tail: 'Congrats. That’s the loop.',
  },
]

export function HowItGrowsSection() {
  return (
    <section className="band section-tight" id="how">
      <div className="wrap">
        <p className="panel-label">How to start</p>
        <h2 className="section-title">Three steps. We tried to make it four</h2>
        <p className="measure">
          You already have an agent. Golden Frijoles gives the two of you a shared product world and a way to
          work inside it.
        </p>
        <p className="takeaway">No migration project. No certification required.</p>
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
          Setup time varies depending on how long step 1 becomes a philosophical discussion.
        </p>
      </div>
    </section>
  )
}
