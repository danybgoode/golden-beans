import type { ReactNode } from 'react'

export function AgentWindow({
  title = 'claude',
  status = 'connected',
  children,
  className = '',
}: {
  title?: string
  status?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`agent-win ${className}`.trim()}>
      <div className="agent-bar">
        <span className="agent-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {title}
        <span className="agent-chip">{status}</span>
      </div>
      <div className="agent-body">{children}</div>
    </div>
  )
}
