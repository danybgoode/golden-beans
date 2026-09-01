// The three bands Today is made of — pure, and zero-import so it can be tested without a database.
//
// ── DD1, as arithmetic ────────────────────────────────────────────────────────────────────────
// A task's real states are `open | claimed | resolved | dismissed`, and `claimedBy` names the actor.
// Today already asked one question in two registers — *"waiting on you"* and *"what changed"* —
// which are the two ENDS of that lifecycle with the middle missing: the part where something has
// been picked up and is being worked. So Today gains its third band, and `/app/tasks` is the same
// bands mounted as its own page (DD5).
//
//   open                → Waiting on you
//   claimed             → Your agent is working      ← the missing middle
//   resolved/dismissed  → What changed
//
// ── Why this is a module and not four `.filter()` calls in a component ───────────────────────
// Two surfaces render these bands and a third counts them for a stat tile. Three call sites
// splitting the same array by hand is three chances for the tile to disagree with the list beneath
// it — and a headline number that contradicts the rows under it is worse than no headline
// (CODE-QUALITY #2: two things that must agree get one implementation).

/** The lifecycle status, restated locally so this module imports nothing. */
export type BandTaskStatus = 'open' | 'claimed' | 'resolved' | 'dismissed'

/** The shape of a task this module needs — a structural subset of `lib/tasks.ts`'s `TaskRow`. */
export type BandTask = {
  id: string
  status: BandTaskStatus
  title: string
  claimedBy: string | null
  evidence: Record<string, unknown> | null
  impactRank: number
}

export type TaskBands<T> = {
  open: T[]
  claimed: T[]
  resolved: T[]
  dismissed: T[]
  /** `resolved` and `dismissed` together — Today's third band shows both under one heading. */
  done: T[]
}

/**
 * Split a queue into its four states, preserving the order it arrived in.
 *
 * ⚠️ **A status this module does not recognise is DROPPED, and `unknown` records it.** The database
 * `CHECK` allows exactly the four above today, so this is unreachable — but a fifth status added by
 * a migration would otherwise vanish from every band silently, and a task that exists and appears
 * nowhere is the worst available outcome for a queue whose whole promise is that humans see what
 * agents see. The caller can assert `unknown` is empty; `today-bands.test.ts` does.
 */
export function splitTaskBands<T extends { status: BandTaskStatus }>(
  tasks: readonly T[]
): TaskBands<T> & { unknown: T[] } {
  const bands: TaskBands<T> & { unknown: T[] } = {
    open: [],
    claimed: [],
    resolved: [],
    dismissed: [],
    done: [],
    unknown: [],
  }
  for (const task of tasks) {
    switch (task.status) {
      case 'open':
        bands.open.push(task)
        break
      case 'claimed':
        bands.claimed.push(task)
        break
      case 'resolved':
        bands.resolved.push(task)
        bands.done.push(task)
        break
      case 'dismissed':
        bands.dismissed.push(task)
        bands.done.push(task)
        break
      default:
        bands.unknown.push(task)
    }
  }
  return bands
}

/**
 * Which signal a task came from, for the row's dot.
 *
 * ⚠️ Returns `null` rather than guessing. The dot is a colour, and a colour that stands for
 * "probably an error" is worse than no dot: the row's own words already say which it is when the
 * evidence carries it, and inventing a kind for a task whose bundle does not name one would put a
 * red mark against something nobody classified.
 */
export function taskSignalKind(task: Pick<BandTask, 'evidence'>): 'error' | 'friction' | null {
  const signal = task.evidence?.signal
  if (typeof signal !== 'object' || signal === null) return null
  const kind = (signal as Record<string, unknown>).kind
  return kind === 'error' || kind === 'friction' ? kind : null
}

/** Who holds a task. Deliberately NOT whether that holder is a person or an agent — see below. */
export type TaskHolder = { name: string; held: boolean }

/**
 * The holder of a task, as a label.
 *
 * ⚠️ **This does NOT say whether the holder is a person or an agent, and the approved design paints
 * them differently. That is a deliberate correction, and this repo has written the reason down
 * twice already.**
 *
 * `lib/task-lifecycle-facts.ts` and `lib/agent-activity-read.ts` both state it: agent attribution
 * comes from `metadata.via === 'connector'` — a fact about which credential and code path performed
 * the mutation — and *never* from an actor string, because `claimed_by` is a caller-supplied
 * free-text label. Matching it against `claude` or `-bot` would let a tenant relabel a human as an
 * agent, or the reverse, and change what the product says about them. `deriveActor` exists
 * precisely so nobody does that.
 *
 * `listTasksByProjectId` returns no `via`, so **the per-task actor kind is not derivable here at
 * all.** The honest rendering is therefore one treatment for every holder plus the holder's own
 * name — and the band HEADING carries the distinction that IS a fact: `open` means nothing has
 * picked it up, `claimed` means something has. The agent line above the claimed band gets its
 * counts from `getTaskLifecycleFacts`, which reads `via` properly.
 *
 * A colour that stands for "probably an agent" on the one page whose subject is who is doing the
 * work would be the most expensive possible place to guess.
 */
export function taskHolder(task: Pick<BandTask, 'claimedBy'>): TaskHolder {
  const claimedBy = task.claimedBy?.trim()
  if (!claimedBy) return { name: 'nobody yet', held: false }
  return { name: claimedBy, held: true }
}

/**
 * The two inputs to a task's rank, as a phrase — *"seen 41×, 12 users"*.
 *
 * ⚠️ Every part is OMITTED when the evidence does not carry it, rather than rendered as a zero. An
 * error seen zero times is not a thing that can be promoted, so a `0` here would only ever mean the
 * bundle was missing a field — which is a different statement, and the reader has to be able to
 * tell (CODE-QUALITY #8).
 */
export function taskEvidencePhrase(task: Pick<BandTask, 'evidence'>): string | null {
  const signal = task.evidence?.signal
  if (typeof signal !== 'object' || signal === null) return null
  const record = signal as Record<string, unknown>
  const parts: string[] = []
  const events = record.eventCount
  const users = record.usersAffected
  if (typeof events === 'number' && Number.isFinite(events) && events > 0) {
    parts.push(`seen ${events.toLocaleString('en-US')}×`)
  }
  if (typeof users === 'number' && Number.isFinite(users) && users > 0) {
    parts.push(`${users.toLocaleString('en-US')} ${users === 1 ? 'person' : 'people'} affected`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}
