import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from './Icon'

export type BadgeStatus = 'live' | 'next' | 'blocked'

const iconByStatus = {
  live: 'check',
  next: 'clock',
  blocked: 'warning',
} as const

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  status: BadgeStatus
  children: ReactNode
  onKraft?: boolean
}

export function Badge({ status, children, className = '', onKraft = false, ...props }: BadgeProps) {
  const surfaceClass = onKraft ? `tag-stamp-${status}` : `tag-${status}`
  return (
    <span className={`tag ${surfaceClass} ${className}`.trim()} {...props}>
      <Icon name={iconByStatus[status]} size={12} />
      {children}
    </span>
  )
}
