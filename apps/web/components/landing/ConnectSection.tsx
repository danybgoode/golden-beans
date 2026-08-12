import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ⑧ Bring your agent.
//
// All three routes land on /install, and that is not laziness: /install is where a real, revocable,
// tokenized connector URL is minted, and there is exactly one of those flows. Three buttons that
// pretend to be three different integrations — a "Claude button", a "ChatGPT button" — would be
// three names for the same MCP endpoint, and the first reader to notice would be right to wonder
// what else on the page is decoration.
//
// The ChatGPT caveat is deliberate and stays until it stops being true: MCP connector support
// varies by plan and by month, and this page cannot make a promise on OpenAI's behalf.
const routes = [
  {
    kicker: 'Claude',
    title: 'Connect Golden Beans',
    copy: 'Add your Golden Beans MCP connection and start asking product questions from Claude.',
    cta: 'Connect to Claude',
    note: null,
  },
  {
    kicker: 'ChatGPT',
    title: 'Bring Golden Beans into ChatGPT',
    copy: 'Connect the remote MCP and let ChatGPT work from the same product context.',
    cta: 'Connect to ChatGPT',
    note: 'Availability and capabilities vary by plan. Yes, we also wish these sentences aged more slowly.',
  },
  {
    kicker: 'Your own agent',
    title: "It's MCP. Go wild.",
    copy: "Point a compatible agent at Golden Beans. Your product context shouldn't depend on which model won Twitter this week.",
    cta: 'Read the MCP docs',
    note: null,
  },
]

export function ConnectSection() {
  return (
    <>
      <SectionDivider number="⑧" title="Bring your agent" />
      <section className="band" id="connect">
        <div className="wrap">
          <h2 className="section-title">Your agent. Your call.</h2>
          <p className="measure">Claude person? Great. ChatGPT person? Also great.</p>
          <p className="takeaway">
            Golden Beans isn&apos;t here to start another AI preference war. We have roadmaps to ship.
          </p>

          <div className="cards3 section-lead">
            {routes.map((route) => (
              <Panel key={route.kicker}>
                <span className="kicker">{route.kicker}</span>
                <h3 className="card-title">{route.title}</h3>
                <p className="card-copy">{route.copy}</p>
                <Button href="/install" variant="ghost" className="panel-tail">
                  {route.cta}
                  <Icon name="arrow-right" />
                </Button>
                {route.note && <p className="note">{route.note}</p>}
              </Panel>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
