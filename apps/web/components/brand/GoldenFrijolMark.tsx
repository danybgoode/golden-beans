import { Bean } from 'lucide-react'

type GoldenFrijolMarkProps = {
  className?: string
  size?: number
  decorative?: boolean
}

/**
 * The canonical Golden Frijoles mark.
 *
 * Lucide supplies the familiar food-bean silhouette. The two-layer treatment turns that outline
 * into a Material-style object: a dark translated keyline for elevation, a filled #FFD700 face,
 * and a specular flare supplied by CSS.
 */
export function GoldenFrijolMark({ className = '', size = 28, decorative = true }: GoldenFrijolMarkProps) {
  const labelProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': 'Golden Frijoles' } as const)

  return (
    <span
      className={`golden-frijol-mark ${className}`.trim()}
      style={{ '--bean-size': `${size}px` } as React.CSSProperties}
      {...labelProps}
    >
      <Bean className="golden-frijol-mark__depth" strokeWidth={1.9} />
      <Bean className="golden-frijol-mark__face" strokeWidth={1.65} />
      <span className="golden-frijol-mark__glint" />
    </span>
  )
}
