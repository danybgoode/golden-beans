import { Icon } from '@/components/ui/Icon'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { isAgentRailEnabled } from '@/lib/flags'
import { shouldRenderAgentRail, pendingChipState, settleRailRead } from '@/lib/agent-rail-visibility'
import { getRecentAgentActivity } from '@/lib/agent-activity'
import { getPendingConfirmations } from '@/lib/pending-confirmations'
import { formatFreshness } from '@/lib/hub-freshness'
import { RailDisclosure } from './RailDisclosure'

// app-shell-and-agent-rail · Sprint 2, Stories 2.2 + 2.3 — the agent rail.
//
// The backend has modelled the agent as an accountable actor since signals-loop: scoped revocable
// credentials, staged writes bound to the credential that proposed them, an append-only trail. None
// of it reached a screen. This is that screen.
//
// ── D4: this is RECENT ACTIVITY, and the copy is an acceptance criterion, not polish ──────────
// `recordAudit` swallows its own failure by design, so a successful revoke is never rolled back by
// a failed log write. Its own comment says so: "this trail is best-effort, not a ledger you can
// prove completeness against." Every string below respects that. Nothing here says "everything",
// "all", "complete" or "full history" — a rail claiming a completeness the data structurally cannot
// support would be the same failure as an artifact that lost its caveats, on the one surface whose
// entire pitch is that it shows its work.
//
// ── D8: the pending list is TASK-scoped, and says so on the surface ───────────────────────────
// `task_write_confirmations.task_id` is NOT NULL REFERENCES tasks(id). There is no staged row for a
// flag activation or a scenario launch. The section names what it covers rather than implying it
// shows every pending agent action. Generalising the mechanic is P2, not this bet.
//
// ── What this component must NEVER do ─────────────────────────────────────────────────────────
// It never calls `consume_write_confirmation`. Reading a proposal here does not spend it — spending
// stays on the agent's path, under the agent credential the token is bound to (and it is a POST, so
// there is nothing on this read-only surface that could accidentally become one). The rail reads.
//
// Tenancy: both reads take the project id ProductShell resolved from the session user's memberships
// (lib/shell-nav.ts). No slug from a URL reaches this file.

const ACTIVITY_LIMIT = 12
const PENDING_LIMIT = 5

export async function AgentRail({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  if (!shouldRenderAgentRail({ enabled: isAgentRailEnabled(), projectId })) return null

  // Both reads return null — never [] — when they fail, and that distinction is carried all the way
  // into the copy below. "We could not read this" and "nothing is happening" are opposite messages;
  // rendering them identically would turn an outage into a calm, wrong reassurance.
  //
  // ── Why the try/catch, when both functions already return null on a query error ──────────────
  // (cross-review round 1, Agy on PR #72.) They return null for a *Postgrest* error. They can still
  // THROW: `getSupabaseServiceClient()` throws when SUPABASE_URL or the service-role key is missing,
  // and supabase-js can reject on a transport failure. An uncaught throw in a server component
  // fails the whole render — and this component sits in ProductShell, so one missing env var would
  // take down EVERY signed-in route rather than one sidebar.
  //
  // Catching to null lands in exactly the copy that is already written for an unreadable read. The
  // rail is an annotation on the page; it must never be the reason the page is gone.
  // `settleRailRead` lives in lib/agent-rail-visibility.ts, where a REJECTING read can be handed to
  // it directly — the epic shipped this guarantee stated and untested, which is the gap this closes.
  const [activity, pending] = await Promise.all([
    settleRailRead(getRecentAgentActivity(projectId, ACTIVITY_LIMIT), 'activity'),
    settleRailRead(getPendingConfirmations(projectId, PENDING_LIMIT), 'pending-confirmations'),
  ])

  // One clock for the whole render, so two lines written a millisecond apart cannot disagree about
  // what "now" was.
  const now = new Date()

  return (
    <aside className="agent-rail" aria-label="Recent activity">
      <RailDisclosure
        summary={
          <>
            <Icon name="sparkles" />
            Recent activity
            {/*
              The count chip carries the null-vs-zero distinction, and it has to (fresh-reviewer
              finding). `pending?.length ?? 0` was here, and 0 rendered no chip — so an UNREADABLE
              proposals table looked exactly like an empty one. That is the epic's own bug class on
              the epic's own surface, and worse here than elsewhere: the panel is server-rendered
              CLOSED, so on a phone (and everywhere pre-hydration) the honest sentence inside is
              behind a disclosure nobody has a reason to open. The summary is the whole message.
            */}
            <PendingChip pending={pending} />
          </>
        }
      >
        <section className="agent-rail__section">
          <h2>Waiting on you</h2>
          {pending === null ? (
            <p className="note">Couldn’t read staged proposals just now. Reload to try again.</p>
          ) : pending.length === 0 ? (
            <p className="note">
              Nothing staged for your approval. Your agent proposes a task action here before it applies one.
            </p>
          ) : (
            <ul className="agent-rail__list">
              {pending.map((confirmation) => (
                <li key={confirmation.id}>
                  <ActivityFeedItem
                    actor="agent"
                    icon="clock"
                    name={confirmation.action}
                    when={formatFreshness(confirmation.proposedAt, now).age}
                  >
                    {' '}
                    task {confirmation.taskId.slice(0, 8)}
                    {confirmation.resolution ? ` · ${confirmation.resolution}` : ''}
                    {confirmation.evidencePointer ? ` · ${confirmation.evidencePointer}` : ''}
                  </ActivityFeedItem>
                </li>
              ))}
            </ul>
          )}
          {/* D8, stated where a user reads it rather than only in a comment above. */}
          <p className="note agent-rail__scope">
            Task actions only — that is what your agent can stage today.{' '}
            <a href={`/app/tasks/${projectSlug}`}>Open tasks</a>
          </p>
        </section>

        <section className="agent-rail__section">
          <h2>Lately</h2>
          {activity === null ? (
            <p className="note">Couldn’t read the activity trail just now. Reload to try again.</p>
          ) : activity.length === 0 ? (
            <p className="note">Nothing recorded on this project recently.</p>
          ) : (
            <ul className="agent-rail__list">
              {activity.map((entry) => (
                <li key={entry.id}>
                  {/*
                    `name` is the actor VERBATIM — the two values lib/agent-activity-read.ts derives
                    from `metadata.via`, and nothing more. The tempting label here is "you", which is
                    what the landing's human variant says; it would be a lie on this surface, because
                    a human audit row may be any member of the project, not the person reading.
                  */}
                  <ActivityFeedItem
                    actor="agent"
                    icon={entry.actor === 'agent' ? 'sparkles' : 'check'}
                    name={entry.actor}
                    when={formatFreshness(entry.occurredAt, now).age}
                  >
                    {' '}
                    {entry.summary}
                  </ActivityFeedItem>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* D4. The caveat is the last word deliberately: it qualifies everything above it. */}
        <p className="note agent-rail__caveat">
          A best-effort operational trail, not a complete record — a failed log write never rolls back the
          action it describes, so a missing entry does not mean it did not happen.
        </p>
      </RailDisclosure>
    </aside>
  )
}

/** The summary chip. Its three states live in lib/agent-rail-visibility.ts, where they are tested. */
function PendingChip({ pending }: { pending: Awaited<ReturnType<typeof getPendingConfirmations>> }) {
  const chip = pendingChipState(pending)
  if (chip.kind === 'empty') return null
  if (chip.kind === 'unreadable') {
    return (
      <span
        className="agent-rail__count"
        data-unreadable="true"
        aria-label="staged proposals could not be read"
      >
        <Icon name="warning" size={12} />
        unread
      </span>
    )
  }
  return (
    <span className="agent-rail__count" aria-label={`${chip.value} awaiting you`}>
      {chip.value}
    </span>
  )
}
