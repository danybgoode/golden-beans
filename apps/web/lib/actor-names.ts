import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { displayNameFrom, type ActorIdentity } from './display-name'

// mockups-as-built · Story 3.5 — resolve audit actors to the words a person reads.
//
// ── The boundary this adds, and why it is narrow ──────────────────────────────────────────────
// This is the first code in the product that reads another person's auth record. It exists because
// the approved `ship-activity` state names who acted ("Daniel turned …") and Daniel ruled to show
// the name when set and the email until then (2026-09-10). Three properties keep it narrow:
//
// 1. **It never takes a user id from a request.** Callers pass the `actor_user_id`s of audit rows
//    they ALREADY read project-scoped, behind `requireProjectMembership`. So a page can only ever
//    name people who acted on that page's project — this cannot be turned into an email lookup for
//    arbitrary accounts, because nothing reaching it chooses whose record is read.
// 2. **It returns two fields and nothing else** — a name and an email. The auth record carries far
//    more (last sign-in, providers, confirmation state), and none of it leaves this function.
// 3. **It is bounded.** At most `ACTOR_LOOKUP_CAP` distinct ids per render, fetched in parallel.
//    Anyone beyond the cap is shown by id, which is what the page showed before this existed.
//
// ── Why the admin API and not a migration ─────────────────────────────────────────────────────
// A `SECURITY DEFINER` function over `auth.users` would be one query instead of N, and a prod
// migration to get it — which this epic already needed Daniel's name for once (D17). An audit page
// shows twelve rows, and on every project so far they have one or two distinct authors, so N is
// small and the admin API is the one already-trusted path to the same record.

/** The most distinct actors one render will look up. Twelve rows per page fits well inside it. */
export const ACTOR_LOOKUP_CAP = 25

/**
 * Who each actor is, keyed by user id. An id with NO entry means the lookup failed, was skipped by
 * the cap, or found no account — and `actorLabel` then shows the id, never a blank.
 *
 * ⚠️ **Never throws.** A name is a courtesy on an audit page whose facts are the rows themselves; an
 * auth API hiccup must not turn "who changed this flag" into an error page. A failure is logged
 * once, with a count rather than the ids.
 */
export async function resolveActorIdentities(
  actorUserIds: readonly string[]
): Promise<Record<string, ActorIdentity>> {
  const unique = [...new Set(actorUserIds)].slice(0, ACTOR_LOOKUP_CAP)
  if (unique.length === 0) return {}

  const supabase = getSupabaseServiceClient()
  let failures = 0
  const found = await Promise.all(
    unique.map(async (id): Promise<[string, ActorIdentity] | null> => {
      try {
        const { data, error } = await supabase.auth.admin.getUserById(id)
        if (error || !data.user) {
          failures += 1
          return null
        }
        return [id, { name: displayNameFrom(data.user.user_metadata), email: data.user.email ?? null }]
      } catch {
        failures += 1
        return null
      }
    })
  )
  if (failures > 0) {
    console.error(`[actor-names] ${failures} of ${unique.length} actor lookup(s) failed; shown by id`)
  }
  return Object.fromEntries(found.filter((entry): entry is [string, ActorIdentity] => entry !== null))
}
