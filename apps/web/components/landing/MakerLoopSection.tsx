import { GoldenFrijolMark } from '@/components/brand/GoldenFrijolMark'

// landing-maker-ops · Sprint 2, Story 2.2 — the loop.
// methodology-experience · Sprint 1, Story 1.1 — five mechanical steps become three portfolio moves.
//
// ── The kraft strip is the existing divider, not a new device ─────────────────────────────────
// The mockup calls this `.magicline` and gives it its own kraft ground, its own dashed rules and
// its own bean. All three already exist as `.divider` — the band every section on this page has
// opened with since the design system landed. So this is `.divider` with the numbered stamp
// swapped for the mark, which keeps the packaging family one family. A second near-identical kraft
// band is how a material family stops being one.
//
// ── Why three moves and not five ──────────────────────────────────────────────────────────────
// This comment replaces one titled "Why five steps and not four", which argued that Release and
// Observe had to stay separate because "the gap between them is the product". That argument was
// about a five-step PROCESS strip, and the strip is gone — leaving the old note in place would
// explain a property the code no longer has (CODE-QUALITY #3), and deleting it silently would
// throw away the reasoning that replaced it.
//
// The method is not a process, it is a portfolio: every move here is a decision about whether
// something deserves to keep drawing budget. Consider is the decision to fund. Exit is the
// decision to stop, change, or fund more. Everything in between — the old Release, Observe and
// Grow — is one act, Operate: deploying the investment you already made. Splitting Operate into
// three implied the reader's judgment was needed three times during execution, when in fact the
// two judgments that matter both sit at the boundaries.
//
// The copy below is the product owner's, verbatim (epic README, D4). Titles carry no terminal
// punctuation: they are titles, and `scripts/check-design-drift.mjs`'s `heading-period` rule reads
// the final character of heading text.
const steps = [
  { n: '01', title: 'Consider', copy: 'Consider whether it deserves investment.' },
  {
    n: '02',
    title: 'Operate',
    copy: 'Operate by deploying that investment through humans and agents.',
  },
  { n: '03', title: 'Exit', copy: 'Exit by deciding what the Evidence justifies.' },
]

export function MakerLoopSection() {
  return (
    <>
      <div className="divider divider--statement">
        <div className="wrap">
          <GoldenFrijolMark size={22} />
          <p>Plant Golden Frijoles and operate across the board, grow with no limit.</p>
        </div>
      </div>

      <section id="loop">
        <div className="wrap">
          <p className="eyebrow">The new maker loop</p>
          <h2 className="section-title">From an idea to something real</h2>
          <p className="measure">
            Golden Frijoles enables makers. It gives what you are already making somewhere to go — shared
            context, bounded action, real product operations. Then it keeps the evidence.
          </p>

          <ol className="maker-flow section-lead">
            {steps.map((step) => (
              <li className="maker-flow__item" key={step.n}>
                <span className="maker-flow__n">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  )
}
