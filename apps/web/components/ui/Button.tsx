import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

type SharedProps = {
  children: ReactNode
  className?: string
  variant?: 'gold' | 'ghost'
}

type ButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never
  }

type LinkProps = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
  }

export function Button(props: ButtonProps | LinkProps) {
  const { children, className = '', variant = 'gold', ...rest } = props
  const classes = `btn btn-${variant} ${className}`.trim()

  if ('href' in rest && typeof rest.href === 'string') {
    return (
      <a className={classes} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
