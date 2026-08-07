import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// The tool-call line vocabulary, extracted from three hand-rolled landing components (D5). One
// device for the agent's activity — the landing's "you ▸ / tool call" lines and the signed-in
// rail's audit-row lines render through the same component, or they drift into two brand promises.
export function ActivityFeedItem({
  actor,
  icon,
  name,
  when,
  children,
}: {
  /** 'human' renders the "you" prompt line; 'agent' renders the tool-call line. */
  actor: 'human' | 'agent'
  /** Leading glyph for an agent line. Defaults to 'settings' (the tool-call marker). */
  icon?: IconName
  /** The tool or action name, emphasised. Optional — an agent line may be prose only. */
  name?: ReactNode
  /** Already-formatted relative time, e.g. "4m ago". Optional; omitted on the landing. */
  when?: string
  children?: ReactNode
}): ReactNode {
  if (actor === 'human') {
    return (
      <div className="you">
        <b>
          you <Icon name="arrow-right" size={12} />
        </b>{' '}
        {children}
      </div>
    )
  }

  return (
    <div className="tool">
      <Icon name={icon ?? 'settings'} />
      {name ? <b>{name}</b> : null} {children}
      {when ? <small>{when}</small> : null}
    </div>
  )
}
