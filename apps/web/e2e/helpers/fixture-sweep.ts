// The orphan-sweep predicate for the authed browser fixture — PURE, and deliberately in its own
// file.
//
// It started life inside `authed-fixture.ts`, which also computes filesystem paths from
// `__dirname`. Playwright transpiles that fine; a plain `node --test` run does not — `__dirname` is
// not defined in ES module scope — so the unit test failed on module load, before reaching a single
// assertion. That is precisely the trap Roadmap/LEARNINGS.md records: a unit-tested pure helper
// cannot share a file with environment-dependent code, because the runner throws an opaque,
// unrelated-looking error just importing it.
//
// So the decision logic lives here (no imports at all, testable anywhere) and the paths stay next
// door.

/**
 * The email prefix every disposable fixture user carries.
 *
 * Exported from here rather than from the path module so this file has zero dependencies — the
 * path module re-exports it for the fixture's own use.
 */
export const FIXTURE_PREFIX = 'gb-e2e-authed'

/** The reserved TLD fixture emails use. RFC 2606 guarantees it is unroutable, so it can never be a real inbox. */
export const FIXTURE_EMAIL_DOMAIN = '@example.invalid'

/**
 * Whether an auth user may be swept as an orphan from an earlier crashed run.
 *
 * This authorises a DESTRUCTIVE action on real auth users, so all four guards must hold, and each
 * one has a test. The dangerous direction is a false positive — deleting something that is not ours
 * or that another run is actively using — so every uncertain case returns false.
 *
 *   1. the email starts with the fixture prefix (never a real account),
 *   2. it is on the reserved `.invalid` TLD — an independent second guard, since a real user could
 *      in principle be given an address beginning with the prefix, but never on that TLD,
 *   3. it is older than `minAgeMs`. This is the CONCURRENCY floor: a live parallel run's user is
 *      seconds old, so without it a sibling teardown deletes the account another worker is
 *      mid-session on,
 *   4. it is not the current run's own user (teardown already deletes that one directly).
 */
export function shouldSweepFixtureUser(
  user: { id: string; email?: string | null; created_at: string },
  opts: { now: number; currentUserId: string | null; minAgeMs?: number }
): boolean {
  const minAge = opts.minAgeMs ?? 60 * 60 * 1000
  const email = user.email ?? ''
  if (!email.startsWith(FIXTURE_PREFIX)) return false
  if (!email.endsWith(FIXTURE_EMAIL_DOMAIN)) return false
  if (user.id === opts.currentUserId) return false
  const created = Date.parse(user.created_at)
  // An unparseable timestamp is NOT swept: "I could not tell how old this is" is a reason to leave
  // a real user alone, never a reason to delete it.
  if (Number.isNaN(created)) return false
  return opts.now - created > minAge
}
