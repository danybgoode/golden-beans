import { Bean } from 'lucide-react'

type GoldenBeanMarkProps = {
  className?: string
  size?: number
  decorative?: boolean
}

/**
 * The canonical Golden Beans mark.
 *
 * Lucide supplies the familiar food-bean silhouette. The two-layer treatment turns that outline
 * into a Material-style object: a dark translated keyline for elevation, a filled #FFD700 face,
 * and a specular flare supplied by CSS.
 */
export function GoldenBeanMark({ className = '', size = 28, decorative = true }: GoldenBeanMarkProps) {
  const labelProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': 'Golden Beans' } as const)

  return (
    <span
      className={`golden-bean-mark ${className}`.trim()}
      style={{ '--bean-size': `${size}px` } as React.CSSProperties}
      {...labelProps}
    >
      <Bean className="golden-bean-mark__depth" strokeWidth={1.9} />
      <Bean className="golden-bean-mark__face" strokeWidth={1.65} />
      <span className="golden-bean-mark__glint" />
    </span>
  )
}
