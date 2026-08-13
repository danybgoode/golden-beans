import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ⑤ Less coordination. More product management.
//
// Two columns of the same journey. The joke in the left column (a meeting about the previous
// meeting) is doing real work: it is the only place on the page that names the actual cost being
// removed, which is not analysis time but the coordination overhead around it.
const without = [
  'Question',
  'Find the dashboard',
  'Ask analytics',
  'Ask engineering',
  'Meeting',
  'Meeting about previous meeting',
  'Decision',
]

const withGoldenBeans = ['Question', 'Ask your agent', 'Inspect the case', 'Decision']

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flow">
      {steps.map((step, index) => (
        // Index is part of the key because a flow legitimately repeats a step label, and the
        // sequence is static — there is no reorder for a positional key to go wrong against.
        <div key={`${step}-${index}`}>
          {index > 0 && (
            <p className="arrow" aria-hidden="true">
              ↓
            </p>
          )}
          <p className="step">{step}</p>
        </div>
      ))}
    </div>
  )
}

export function LeverageSection() {
  return (
    <>
      <SectionDivider number={5} title="Less coordination. More product management" />
      <section id="leverage">
        <div className="wrap">
          <h2 className="section-title">The question shouldn&apos;t take longer than the answer</h2>
          <p className="measure">
            You don&apos;t need Golden Frijoles to replace your engineers, analysts, executives — or your
            judgment.
          </p>
          <p className="takeaway">
            You need less work between having a question and being able to make a good call. That&apos;s
            leverage.
          </p>

          <div className="row2 section-lead row2--start">
            <Panel>
              <p className="panel-label">Without Golden Frijoles</p>
              <Flow steps={without} />
              <p className="note section-lead">We considered adding another meeting here for realism.</p>
            </Panel>
            <Panel>
              <p className="panel-label">With Golden Frijoles</p>
              <Flow steps={withGoldenBeans} />
              <p className="note section-lead">Your calendar may experience side effects.</p>
            </Panel>
          </div>
        </div>
      </section>
    </>
  )
}
