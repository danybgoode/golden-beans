import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ⑦ Yes, you can build this yourself.
//
// The section that names the competition and concedes the point, because the reader has already
// thought of it and a page that pretends otherwise loses them here. Note what it does NOT do: it
// does not claim PostHog or GrowthBook lack these features, and it does not compare our shipped
// product against anybody's unreleased one. CODE-QUALITY.md #9 is explicit about that second
// failure, and this repo has done it before — an earlier landing compared the inverted loop
// against PostHog Desktop, which is announced for Summer 2026 and not a product a reader can buy.
//
// The comparison table's left column is therefore "stitch it yourself", not a competitor's name.
// That is the honest axis: the alternative to Golden Beans is not another product, it is the
// integration work between the good products you already have.
const rows = [
  ['Your agent knows', "Whatever you've wired up", 'The product context behind the decision'],
  ['A bet becomes', 'Work across several systems', 'One case against the goal'],
  ['An action becomes', 'Whatever each tool permits', 'Staged → confirmed → logged'],
  ['What shipped', 'Somewhere in the repo', 'One line a PM can actually read'],
  ['Did it work?', 'Back to the dashboards', 'Back to the original bet'],
] as const

export function BuildItYourselfSection() {
  return (
    <>
      <SectionDivider number="⑦" title="Yes, you can build this yourself" />
      <section id="build-it-yourself">
        <div className="wrap">
          <h2 className="section-title">PostHog is great. GrowthBook is great.</h2>
          <p className="measure">
            Your warehouse probably works just fine too. Connect them. Normalize the concepts. Give your agent
            safe access. Build approvals. Correlate releases to outcomes. Maintain the glue.
          </p>
          <p className="takeaway">Or don&apos;t.</p>

          <Panel className="cmp-panel">
            <table className="cmp">
              <caption className="sr-only">
                Stitching the tools you already have, compared with Golden Beans
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Concern</span>
                  </th>
                  <th scope="col">Stitch it yourself</th>
                  <th scope="col" className="us">
                    Golden Beans
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([concern, diy, us]) => (
                  <tr key={concern}>
                    <th scope="row">{concern}</th>
                    <td>{diy}</td>
                    <td className="us">{us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <p className="takeaway">
            Golden Beans isn&apos;t another place to analyze your product. It&apos;s the product layer your
            agent was missing.
          </p>
        </div>
      </section>
    </>
  )
}
