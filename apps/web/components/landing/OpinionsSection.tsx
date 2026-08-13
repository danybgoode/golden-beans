import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ① Everyone has a good reason.
//
// The section that earns the rest of the page. It does NOT claim the reader's colleagues are
// wrong, which is the move every competing product makes and the reason PMs distrust the category:
// a tool that tells you sales is biased and engineering is obstructive is a tool nobody can bring
// to a meeting. The argument here is narrower and survives contact with a real org — everyone has
// real information, and none of it is comparable until there is a shared yardstick.
const frictions = [
  {
    title: 'The loudest idea travels furthest',
    copy: "A good idea shouldn't become a great idea because someone outranks the room.",
    takeaway: 'Seniority is useful context. Not a confidence interval.',
  },
  {
    title: 'Every metric has a lawyer',
    copy: 'Retention says yes. Revenue says maybe. That dashboard nobody fully trusts says absolutely.',
  },
  {
    title: 'Eventually, someone has to call it',
    copy: 'Usually you. Preferably before the meeting about the meeting.',
  },
]

export function OpinionsSection() {
  return (
    <>
      <SectionDivider number={1} title="Everyone has a good reason" />
      <section id="opinions">
        <div className="wrap">
          <h2 className="section-title">Product decisions get complicated when humans are involved</h2>
          <p className="measure">
            Sales heard it from a prospect. Engineering knows where the bodies are buried. The CEO has seen
            this movie before.
          </p>
          <p className="takeaway">None of them are necessarily wrong.</p>

          <div className="cards3 section-lead">
            {frictions.map((friction) => (
              <Panel key={friction.title}>
                <h3 className="card-title">{friction.title}</h3>
                <p className="card-copy">{friction.copy}</p>
                {friction.takeaway && <p className="takeaway panel-tail">{friction.takeaway}</p>}
              </Panel>
            ))}
          </div>

          <div className="section-lead measure">
            <p className="big-quote">Opinions aren&apos;t the problem.</p>
            <p className="measure">
              Good product teams should disagree. Golden Frijoles gives your agent the same quantifiable goal
              to test those ideas against — regardless of who suggested them.
            </p>
            <p className="takeaway">The idea gets a fair hearing. The org chart doesn&apos;t get a vote.</p>
          </div>
        </div>
      </section>
    </>
  )
}
