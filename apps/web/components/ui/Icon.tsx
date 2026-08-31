import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Binary,
  BookOpenText,
  Cable,
  CalendarClock,
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
  House,
  KeyRound,
  Flag,
  Link2,
  ListChecks,
  Lock,
  MapPin,
  PanelsTopLeft,
  RefreshCw,
  Rocket,
  Route,
  Server,
  Settings2,
  SlidersHorizontal,
  Shield,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

// The names live in `icon-names.ts` so the fast unit layer can read them without JSX.
// Re-exported here so every existing `from '@/components/ui/Icon'` import is unchanged.
// Imported for use here, and re-exported so every existing `from '@/components/ui/Icon'` keeps
// working. One import and one export beat the earlier re-export-then-re-import-under-an-alias,
// which needed a second name for the same type purely to use it in its own file (cross-family
// review).
import type { IconName } from './icon-names'
export { ICON_NAMES } from './icon-names'
export type { IconName }

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
  activity: Activity,
  'calendar-clock': CalendarClock,
  home: House,
  key: KeyRound,
  link: Link2,
  'list-checks': ListChecks,
  rocket: Rocket,
  route: Route,
  settings: Settings2,
  sliders: SlidersHorizontal,
  webhook: Webhook,
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
