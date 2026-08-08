import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Binary,
  BookOpenText,
  Cable,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  Gauge,
  Flag,
  MapPin,
  PanelsTopLeft,
  Settings2,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

export const ICON_NAMES = [
  // app-component-kit-adoption S1.1 — DataTable's sort indicator. Added here rather than drawn as a
  // ▲/▼ glyph so the direction stays an SVG like every other mark in the system, and so the drift
  // guard's no-pictograph rule has nothing to catch.
  'arrow-down',
  'arrow-right',
  'arrow-up',
  'binary',
  'book',
  'cable',
  'check',
  'clock',
  'copy',
  'external',
  'gauge',
  'flag',
  'map-pin',
  'panels',
  'settings',
  'sparkles',
  'star',
  'trend-down',
  'trend-up',
  'warning',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const icons: Record<IconName, LucideIcon> = {
  'arrow-down': ArrowDown,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  binary: Binary,
  book: BookOpenText,
  cable: Cable,
  check: Check,
  clock: Clock3,
  copy: Copy,
  external: ExternalLink,
  gauge: Gauge,
  flag: Flag,
  'map-pin': MapPin,
  panels: PanelsTopLeft,
  settings: Settings2,
  sparkles: Sparkles,
  star: Star,
  'trend-down': TrendingDown,
  'trend-up': TrendingUp,
  warning: CircleAlert,
}

type IconProps = {
  name: IconName
  className?: string
  size?: number
  label?: string
}

export function Icon({ name, className, size = 16, label }: IconProps) {
  const Glyph = icons[name]
  return label ? (
    <Glyph className={className} size={size} role="img" aria-label={label} />
  ) : (
    <Glyph className={className} size={size} aria-hidden="true" />
  )
}
