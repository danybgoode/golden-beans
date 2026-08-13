import { isResilienceScenariosEnabled, isSecuritySimulationsEnabled } from '@/lib/flags'
import { Badge } from '@/components/ui/Badge'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'

// landing-frijoles-rebrand · Sprint 2, Story 2.3 (epic D5) — Break glass, on purpose.
//
// ── This section describes a capability whose gates are OFF, and it says so ───────────────────
// Chaos scenarios and security simulations are BUILT. They are not switched on in production, and
// that was confirmed by exercising the behaviour rather than by reading `vercel env ls` (which never
// shows values anyway):
//
//   POST /api/v1/scenarios/execution → 404   (RESILIENCE_SCENARIOS_ENABLED off)
//   POST /api/v1/scenarios/security  → 404   (SECURITY_SIMULATIONS_ENABLED off)
//   POST /api/v1/scenarios/admin     → 400   ← the route family IS deployed; only the gates are shut
//
// That last line is the load-bearing one. A 404 on its own is ambiguous between "gated" and "never
// shipped"; the sibling route answering 400 to the same malformed body proves the code is live and
// the gate is what is closing the door.
//
// So each card's badge READS ITS OWN GATE rather than stating a position (CODE-QUALITY.md #2: a
// value that must not go stale is computed, not written down; #9: do not state a capability as live
// while its flag is off). This is the same device §3's RISK row already uses, deliberately — one
// honesty vocabulary on this page, not two.
//
// ── What "no code change" does and does NOT mean ──────────────────────────────────────────────
// Turning a drill on needs **no edit to this file**: the badge is derived, and the page is
// `force-dynamic`, so the flag is read fresh on every request. It still needs a **new Git-tracked
// deployment** — Vercel snapshots environment variables into a deployment at build time, so the
// running functions keep serving whatever they captured at their own build (AGENTS.md rule #4;
// disproved empirically during the multi-tenant-activation launch, where `SIGNUP_ENABLED=true` sat
// unobserved for seven minutes). "Set" and "live" are two separate facts. An earlier version of
// this comment said "no deploy", which read as though setting the var were sufficient — corrected
// after cross-family review (Codex, PR #95).
//
// ── The LEAD claim has to survive the gates being shut too, not just the cards ────────────────
// This comment used to say the copy "never says you can run this today" — and the lead paragraph
// said Golden Frijoles "turns them into scenarios you can run with your agent", in the unqualified
// present tense, one paragraph above two badges saying the opposite. A comment asserting a property
// the code does not have is precisely the failure CODE-QUALITY.md #3 names, and it is worse here
// than an ordinary wrong comment because it is the thing a reviewer reads INSTEAD of re-checking
// the copy. Caught in cross-family review of PR #95.
//
// The lead now reads "is building them into" — true while the gates are shut and still true once
// they open, since a shipped capability is one you are still building on. The badges supply the
// precise tense per card; the lead must not contradict them before the reader gets there.
//
// ── The CARD copy had the same problem, and round 3 only fixed the lead ───────────────────────
// The cards opened "Simulate the traffic spike…" and "Run controlled attack scenarios…" — bare
// imperatives, which read as instructions for something you can do right now. A badge underneath
// saying "not switched on yet" does not retract an instruction; it just makes the card argue with
// itself. Both are noun phrases now ("A dress rehearsal for…", "Controlled attack scenarios
// against…"), which describe what the drill IS without telling the reader to go and run it. Caught
// in cross-family review of PR #95, one round after the identical fix to the lead — the lesson
// being that "grep for its siblings" applies to copy too, not only to code.
type Drill = {
  kicker: string
  title: string
  copy: string
  note: string
  /** Read per request from this card's own gate. The gate NAME is deliberately not carried on the
   *  object: nothing renders it, and this repo has already paid for one dead constant that every
   *  reader assumed was wiring something (see `PROSE_MODEL`, Roadmap/LEARNINGS.md). The names live
   *  in this file's header and in `lib/landing-sections.ts`, where they are prose a person acts on
   *  rather than data pretending to be plumbing. */
  live: boolean
}

const METERS = [
  { label: 'Traffic', fill: 'meter--92', value: '10×', tone: '' },
  { label: 'Checkout latency', fill: 'meter--72', value: '1.8s', tone: '' },
  { label: 'Orders completed', fill: 'meter--84', value: 'holds', tone: 'status-ok' },
] as const

const FINDINGS: ReadonlyArray<{ icon: IconName; label: string; tail: string }> = [
  {
    icon: 'warning-triangle',
    label: 'Weak point found:',
    tail: ' payment retries pile up after 8× traffic.',
  },
  { icon: 'refresh', label: 'Next move:', tail: ' cap retries and rerun the scenario.' },
]

const PROBES: ReadonlyArray<{ icon: IconName; label: string; result: string; tone: string }> = [
  { icon: 'lock', label: 'Try unauthorized account access', result: 'blocked', tone: 'status-ok' },
  { icon: 'server', label: 'Probe rate-limit behavior', result: '1 weakness', tone: 'status-warn' },
  { icon: 'refresh', label: 'Check recovery path', result: 'held', tone: 'status-ok' },
]

/** The honest badge, or nothing. Rendered only while a gate is shut — a badge on every card is
 *  decoration, and decoration is what empties a badge of meaning for the card that needs one.
 *
 *  The env-var name is deliberately NOT in the badge. It was, briefly, on a "maximum checkability"
 *  argument, and it does not survive contact with the reader: nobody outside this repo can check an
 *  environment variable, so the name buys a PM nothing and reads as a leak rather than candour. */
function GateBadge({ live }: { live: boolean }) {
  if (live) return null
  return (
    <Badge status="next" className="drill-card__gate">
      Built · not switched on yet
    </Badge>
  )
}

export function ResilienceSection() {
  const drills: [Drill, Drill] = [
    {
      kicker: 'Chaos engineering · controlled mayhem',
      title: 'What if Black Friday actually works?',
      copy: 'A dress rehearsal for the traffic spike, the slow dependency and the checkout service wobble — so you find where the customer experience bends before the campaign budget arrives, not during it.',
      note: 'The campaign can still traumatize you emotionally. Just ideally not infrastructurally.',
      live: isResilienceScenariosEnabled(),
    },
    {
      kicker: 'Security · friendly mutiny',
      title: 'Ask your agents to turn on you',
      copy: 'Controlled attack scenarios against the protections you expect to hold. Your agent plays the troublemaker, the run records what got through, and the aftermath comes back as work you can actually prioritize.',
      note: 'A betrayal, but the kind with an action list.',
      live: isSecuritySimulationsEnabled(),
    },
  ]

  return (
    <section className="band" id="resilience">
      <div className="wrap">
        <p className="panel-label">Break glass · on purpose</p>
        <h2 className="display measure measure--wide">
          Let your agents <em className="foil">mutiny</em>
          <br />
          Then see what survives
        </h2>
        <p className="measure section-lead">
          Chaos engineering and security testing are things PMs usually hear about after someone else has
          scheduled them. Golden Frijoles is building them into scenarios you and your agent shape and run
          together — before the campaign, the launch, or the very expensive lesson.
        </p>
        <p className="takeaway">Break the rehearsal. Not launch day.</p>

        <div className="drill-grid">
          <Panel className="drill-card">
            <span className="kicker">{drills[0].kicker}</span>
            <h3 className="card-title">{drills[0].title}</h3>
            <p className="card-copy">{drills[0].copy}</p>
            <GateBadge live={drills[0].live} />
            <div className="drill-visual">
              <p className="panel-label">Black Friday dress rehearsal</p>
              {METERS.map((meter) => (
                <div className="meter-row" key={meter.label}>
                  <span>{meter.label}</span>
                  {/* The fill is a class from a bounded set, not an inline width: this is a fixed
                      illustration, and /app's RolloutBar is where a COMPUTED width belongs. */}
                  <span className="meter">
                    <i className={meter.fill} />
                  </span>
                  <b className={meter.tone}>{meter.value}</b>
                </div>
              ))}
              <div className="drill-actions">
                {FINDINGS.map((finding) => (
                  <p className="drill-action" key={finding.label}>
                    <Icon name={finding.icon} />
                    <span>
                      <b>{finding.label}</b>
                      {finding.tail}
                    </span>
                  </p>
                ))}
              </div>
            </div>
            <p className="note section-lead">{drills[0].note}</p>
          </Panel>

          <Panel className="drill-card">
            <span className="kicker">{drills[1].kicker}</span>
            <h3 className="card-title">{drills[1].title}</h3>
            <p className="card-copy">{drills[1].copy}</p>
            <GateBadge live={drills[1].live} />
            <div className="drill-visual">
              <p className="panel-label">Auth mutiny · simulation</p>
              <div className="drill-actions">
                {PROBES.map((probe) => (
                  <p className="drill-action" key={probe.label}>
                    <Icon name={probe.icon} />
                    <span>
                      {probe.label} <b className={probe.tone}>{probe.result}</b>
                    </span>
                  </p>
                ))}
              </div>
              <div className="shared-plan">
                <div className="shared-plan__head">
                  <strong>After-action list</strong>
                  <span className="tag tag-next">3 ITEMS</span>
                </div>
                <p>
                  One protection to tighten. One scenario to rerun. One thing that worked exactly as intended.
                </p>
              </div>
            </div>
            <p className="note section-lead">{drills[1].note}</p>
          </Panel>
        </div>
      </div>
    </section>
  )
}
