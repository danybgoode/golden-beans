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
export { ICON_NAMES, type IconName } from './icon-names'
import { type IconName as Name } from './icon-names'

const icons: Record<Name, LucideIcon> = {
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
  name: Name
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
