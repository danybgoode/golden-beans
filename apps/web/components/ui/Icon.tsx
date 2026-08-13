import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Binary,
  BookOpenText,
  Cable,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  Code,
  Copy,
  Database,
  ExternalLink,
  FlaskConical,
  Gauge,
  Flag,
  Lock,
  MapPin,
  PanelsTopLeft,
  RefreshCw,
  Server,
  Settings2,
  Shield,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
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
  // landing-frijoles-rebrand S1.6 (epic D3) — the glyphs the Frijoles sections need: the journey
  // nodes, the chaos/security drill rows, and the release room. The mockup's implementation notes
  // ask for Iconoir; the product-owner call was to keep ONE icon seam rather than run a second
  // library for the same job (CODE-QUALITY.md #1), so the mockup's intent — real icons, never an
  // emoji, never an "I" placeholder — ships from the map that already exists. Nothing outside this
  // file imports lucide-react, which is what makes swapping the underlying set later a one-file job.
  'check-circle',
  'clock',
  'code',
  'copy',
  'database',
  'external',
  'flask',
  'gauge',
  'flag',
  'group',
  'help',
  'lock',
  'map-pin',
  'panels',
  'refresh',
  'server',
  'settings',
  'shield',
  'sparkles',
  'star',
  'trend-down',
  'trend-up',
  'warning',
  'warning-triangle',
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
  'check-circle': CircleCheck,
  clock: Clock3,
  code: Code,
  copy: Copy,
  database: Database,
  external: ExternalLink,
  flask: FlaskConical,
  gauge: Gauge,
  flag: Flag,
  group: Users,
  help: CircleHelp,
  lock: Lock,
  'map-pin': MapPin,
  panels: PanelsTopLeft,
  refresh: RefreshCw,
  server: Server,
  settings: Settings2,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  'trend-down': TrendingDown,
  'trend-up': TrendingUp,
  warning: CircleAlert,
  'warning-triangle': TriangleAlert,
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
