import { Badge } from '@/components/ui/Badge'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

const routes: Array<{
  number: string
  label: string
  icon: IconName
  status: 'live' | 'next'
  badge: string
  title: string
  body: React.ReactNode
  tail: string
  href?: string
}> = [
  {
    number: '①',
    label: 'CONNECTOR URL',
    icon: 'cable',
    status: 'live',
    badge: 'LIVE',
    title: 'Paste it into Claude',
    body: (
      <>
        Copy your tokenized MCP URL, hit <b>Add to Claude</b>. Your PM asks their agent for the funnel. Revoke
        the token, revoke the access.
      </>
    ),
    tail: '/install → copy the demo URL',
    href: '/install',
  },
  {
    number: '②',
    label: 'THE POD PLUGIN',
    icon: 'panels',
    status: 'next',
    badge: 'multi-tenant-activation',
    title: 'Cowork / Claude Code',
    body: 'The full pods experience — grooming, build order, benchmarks — installed as a plugin for your whole team.',
    tail: '/plugin install golden-beans',
  },
  {
    number: '③',
    label: 'SDK IMPORT',
    icon: 'binary',
    status: 'live',
    badge: 'LIVE',
    title: 'For your engineers',
    body: (
      <>
        An npm-installed SDK, first event out in minutes. Few lines to your first North Star input —
        <code> track</code>, <code>trackAdoption</code>, <code>bucket</code>.
      </>
    ),
    tail: 'npm install @golden-beans/sdk',
    href: '/install',
  },
]

function RoutePanel({ route }: { route: (typeof routes)[number] }) {
  const content = (
    <>
      <div className="panel-heading">
        <Icon name={route.icon} size={18} />
        <span className="panel-heading__label">
          {route.number} {route.label}
        </span>
        <Badge status={route.status}>{route.badge}</Badge>
      </div>
      <h3>{route.title}</h3>
      <p>{route.body}</p>
      <div className="panel-code panel-tail">{route.tail}</div>
    </>
  )

  return route.href ? (
    <a href={route.href} className="panel">
      {content}
    </a>
  ) : (
    <Panel className="panel--next">{content}</Panel>
  )
}

export function OperateRoutes() {
  return (
    <>
      <SectionDivider number="③" title="Three ways in — zero integrated AI" />
      <section>
        <div className="wrap">
          <h2 className="section-title">Bring the agent you already pay for.</h2>
          <div className="cards3">
            {routes.map((route) => (
              <RoutePanel route={route} key={route.label} />
            ))}
          </div>
          <p className="note hero-note">
            The SDK is always the data-in layer. The routes above are how humans — and their agents — operate
            what it collects.
          </p>
        </div>
      </section>
    </>
  )
}
