import type { ReactNode } from 'react'

export function SectionDivider({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="divider">
      <div className="wrap">
        <span className="num">{number}</span>
        <span className="stamp-title">{title}</span>
        {children}
      </div>
    </div>
  )
}
