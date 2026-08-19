import { GoldenFrijolMark } from '@/components/brand/GoldenFrijolMark'

// landing-maker-ops · Sprint 2, Story 2.2 — the loop, in five steps.
//
// ── The kraft strip is the existing divider, not a new device ─────────────────────────────────
// The mockup calls this `.magicline` and gives it its own kraft ground, its own dashed rules and
// its own bean. All three already exist as `.divider` — the band every section on this page has
// opened with since the design system landed. So this is `.divider` with the numbered stamp
// swapped for the mark, which keeps the packaging family one family. A second near-identical kraft
// band is how a material family stops being one.
//
// ── Why five steps and not four ───────────────────────────────────────────────────────────────
// Release and Observe are one step in most "how it works" strips, and collapsing them here would
// have been tidier. They are separate because the gap between them is the product: shipping behind
// a flag and then finding out what it did are two different acts, and a maker who does the first
// without the second is exactly the reader this page is for.
const steps = [
  { n: '01', title: 'Shape', copy: 'Turn an idea into a bounded Bet, with your agents in the room.' },
  { n: '02', title: 'Build', copy: 'Give agents coherent work and the context it depends on.' },
  { n: '03', title: 'Release', copy: 'Change reality behind flags, rules and guardrails.' },
  { n: '04', title: 'Observe', copy: 'Watch journeys, signals, experiments and operating evidence.' },
  { n: '05', title: 'Grow', copy: 'Keep what worked. Learn. Place the next Bet.' },
]

export function MakerLoopSection() {
  return (
    <>
      <div className="divider divider--statement">
        <div className="wrap">
          <GoldenFrijolMark size={22} />
          <p>
            The surprise was never that agents can build. It is that one maker can now operate the whole
            thing.
          </p>
        </div>
      </div>

      <section id="loop">
        <div className="wrap">
          <p className="eyebrow">The new maker loop</p>
          <h2 className="section-title">From an idea to something real</h2>
          <p className="measure">
            Golden Frijoles does not ask you to make less. It gives everything you are already making
            somewhere to go: shared context, bounded action, real product operations, and evidence that
            survives the conversation it came from.
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
