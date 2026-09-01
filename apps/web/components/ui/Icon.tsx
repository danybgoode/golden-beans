/** @jsxImportSource react */
// ⚠️ **A no-op under Next, load-bearing for the test rail** — design-system-rails Sprint 6.
// Playwright's transform pins its own jsx runtime, whose elements `react-dom/server` refuses to
// render, and a pragma is PER FILE: a caller having one does nothing for the JSX inside the
// component it calls. `design-system/primitives.tsx` carries the same line for the same reason, and
// `Callout` renders an `Icon` — so a `.spec.tsx` rendering the pod report's REFUSAL state (the one
// branch that has a callout in it) died here while every other branch passed.
//
// This is the seam every icon in the product goes through, so the line covers all of them at once.
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
  Info,
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
  Search,
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
  // design-system-rails S4 — the callout's marker. The approved prototype draws it as `◆`, a
  // geometric shape the drift guard happens not to ban; an SVG is what D4 asks for anyway, and it
  // keeps every mark in the console coming from the one seam.
  info: Info,
  lock: Lock,
  'map-pin': MapPin,
  panels: PanelsTopLeft,
  refresh: RefreshCw,
  search: Search,
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
