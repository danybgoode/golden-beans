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
// ── Both panels still READ their gate; only the prose under them is gone ─────────────────────
// The drills' two gates are OFF in production today, and so is the connector's write path. Each
// panel used to carry a computed sentence saying so underneath its activity feed. Those sentences
// were cut in the readability pass, and the qualification did NOT go with them: each panel's badge
// is still resolved from the live flag, so a gated capability is still labelled as gated and the
// label still disappears on its own the day the gate opens (epic D3). What is gone is the second,
// longer statement of the same fact — not the fact.
//
// `e2e/landing.browser.spec.ts` checks this against the real routes rather than against the flag,
// and it was re-pointed at the badge in the same commit.
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
  // Shares `gatedDrillNote` with the Ops panel rather than re-deriving the answer. Two components
  // making the same claim about the same two flags is two claims to keep in step; the first version
  // hardcoded this one and would have said "no drill can run" while one of them ran. Codex, PR #100.
  const gates = {
    resilienceScenariosEnabled: isResilienceScenariosEnabled(),
    securitySimulationsEnabled: isSecuritySimulationsEnabled(),
  }
  // Empty note = every drill can be started, so nothing needs qualifying.
  const drillsRunnable = gatedDrillNote(gates) === ''

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
        {/* Epic D1 — governance and control over policy, without a department. The enterprise
            version of this argument ends in an admin console someone administers full-time. Ours
            ends in the same property arriving as a default, because there is nobody to staff it. */}
        <p className="measure">
          Your agents can investigate, propose and act. Golden Frijoles keeps the context, permissions,
          staged changes and evidence visible, so autonomy can expand without the product becoming a black
          box. Governance and control over what your agents may do, without a department to enforce it.
        </p>

        <div className="authority-grid section-lead">
          <Panel className="authority-card">
            {writesLive ? null : <Badge status="next">Built, writes gated</Badge>}
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
          </Panel>

          <Panel className="authority-card">
            {drillsRunnable ? null : <Badge status="next">Built, currently gated</Badge>}
            <h3>Break glass on purpose</h3>
            {/* Describes what the capability IS, not what you can do right now — the badge above
                carries the runnability qualification, and with the note below it gone this
                sentence is the only other claim in the panel. Codex, round 9 of PR #100. */}
            <p>
              Flags, circuit breakers, resilience drills and security scenarios exist so a product can be put
              under the unpleasant version of the lesson deliberately, rather than waiting for it to arrive on
              its own.
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
          </Panel>
        </div>
      </div>
    </section>
  )
}
