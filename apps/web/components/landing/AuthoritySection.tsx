import {
  isConnectorWritesEnabled,
  isResilienceScenariosEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { gatedDrillNote } from '@/lib/maker-ops'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'

// landing-maker-ops · Sprint 2, Story 2.5 — agents move, authority stays put.
//
// ── The icons ─────────────────────────────────────────────────────────────────────────────────
// The mockup fills each activity row's icon slot with a bare capital — `<i>A</i>`, `<i>✓</i>`,
// `<i>R</i>`, `<i>S</i>`, `<i>E</i>`. The tick is a `check` glyph the drift guard rejects outright
// (`ui-pictograph`), and the four letters are the "I placeholder" pattern that
// `landing-frijoles-rebrand` already removed from this page once. Every row here takes a real
// `Icon`, and every row renders through `ActivityFeedItem` — the single device for agent activity
// in this codebase, shared with the signed-in rail, so the landing and the product cannot drift
// into two different pictures of the same thing.
//
// ── The right-hand panel reads the gates ──────────────────────────────────────────────────────
// Its whole subject is the drills, and the drills' two gates are OFF in production today (verified
// by exercising the routes — see `lib/maker-ops.ts`). Describing a rehearsal a reader cannot
// currently run, without saying so, is the failure CODE-QUALITY #9 names on the surface where it
// costs most. So the panel keeps its argument — the capability is built, and it is the reason the
// evidence exists — and states the current position by READING it, so the sentence disappears on
// its own the day the gates open.
const staged = [
  {
    icon: 'sparkles' as const,
    name: 'Agent proposed',
    detail: 'Widen the first-value rollout to 25%',
    when: '12:41',
  },
  {
    icon: 'check-circle' as const,
    name: 'Checks passed',
    detail: 'Rule schema, targeting, rollback path',
    when: '12:42',
  },
  {
    icon: 'lock' as const,
    name: 'Your call required',
    detail: 'This one increases production exposure',
    when: 'now',
  },
]

const rehearsed = [
  {
    icon: 'refresh' as const,
    name: 'Resilience drill',
    detail: 'A destination starts answering slowly',
    when: 'bounded',
  },
  {
    icon: 'shield' as const,
    name: 'Security scenario',
    detail: 'An unauthorized transition is attempted',
    when: 'blocked',
  },
  {
    icon: 'book' as const,
    name: 'Evidence kept',
    detail: 'What happened, and what stopped it',
    when: 'verified',
  },
]

export function AuthoritySection() {
  // Shares `gatedDrillNote` with the Ops panel rather than re-deriving the sentence. Two components
  // making the same claim about the same two flags is two claims to keep in step; the first version
  // hardcoded this one and would have said "no drill can run" while one of them ran. Codex, PR #100.
  const gates = {
    resilienceScenariosEnabled: isResilienceScenariosEnabled(),
    securitySimulationsEnabled: isSecuritySimulationsEnabled(),
  }
  const gatedNote = gatedDrillNote(gates)
  const drillsRunnable = gatedNote === ''

  // ── The gate read that retired with PrincipleSection, restored ──────────────────────────────
  // §4 of the page this replaced closed on a sentence that READ this flag: staged writes are live,
  // or they are built and deliberately switched off. Retiring that section took the flag read with
  // it — and this panel inherited the argument ("let agents move") without inheriting the gate that
  // made the claim checkable. A repositioning is exactly when this happens: the claim survives the
  // section that qualified it. Caught by Codex in cross-family review round 3 of PR #100.
  const writesLive = isConnectorWritesEnabled()

  return (
    <section className="band" id="authority">
      <div className="wrap">
        <p className="eyebrow">Agents with somewhere to work</p>
        <h2 className="section-title">More than an endpoint</h2>
        {/* The second sentence was 33 words and four stacked noun phrases, and it landed on "a box
            you cannot see into" — flagged by both external families, one for the rhythm and one for
            the dead metaphor. Split, and the metaphor replaced with the actual mechanism rather than
            with "black box", which is the same cliché wearing a shorter coat. */}
        <p className="measure">
          Your agents can investigate, propose and act. What they cannot do is act unseen: the context they
          used, the permission they had and the change they staged are all on the record before anything
          happens.
        </p>

        <div className="authority-grid section-lead">
          <Panel className="authority-card">
            {writesLive ? (
              <Badge status="live">Accountable actors</Badge>
            ) : (
              <Badge status="next">Built, writes gated</Badge>
            )}
            <h3>Let agents move, keep the last word</h3>
            <p>
              Scoped credentials, staged actions, explicit approvals and an append-only record. The
              agent&apos;s work is something you can inspect, not something you have to trust.
            </p>
            <div className="authority-feed">
              {staged.map((row) => (
                <ActivityFeedItem
                  key={row.name}
                  actor="agent"
                  icon={row.icon}
                  name={row.name}
                  when={row.when}
                >
                  {row.detail}
                </ActivityFeedItem>
              ))}
            </div>
            <p className="note">
              {writesLive
                ? 'Live today: the staged write tools are switched on, and every one of them still needs your explicit confirmation before it applies.'
                : 'The staged write path is built and deliberately switched off until it is verified end to end — so this page does not claim a live write surface before there is one.'}
            </p>
          </Panel>

          <Panel className="authority-card">
            {drillsRunnable ? (
              <Badge status="live">Built for reality</Badge>
            ) : (
              <Badge status="next">Built, currently gated</Badge>
            )}
            <h3>Break glass on purpose</h3>
            <p>
              Flags, circuit breakers, resilience drills and security scenarios let you exercise the product
              before the unpleasant version of the lesson arrives on its own.
            </p>
            <div className="authority-feed">
              {rehearsed.map((row) => (
                <ActivityFeedItem
                  key={row.name}
                  actor="agent"
                  icon={row.icon}
                  name={row.name}
                  when={row.when}
                >
                  {row.detail}
                </ActivityFeedItem>
              ))}
            </div>
            {drillsRunnable ? null : (
              <p className="note">
                The drills are built and deployed. {gatedNote}, so this shows the shape rather than a run you
                could start here today.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </section>
  )
}
