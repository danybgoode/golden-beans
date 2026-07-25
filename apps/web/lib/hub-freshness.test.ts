import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatFreshness, freshnessLabel } from './hub-freshness.ts'

// The stamp is the hub's honesty mechanism — a viewer of a shared link decides whether to trust the
// numbers based on it. So the cases worth pinning are the ones where a naive formatter would print
// something confident and WRONG: a missing date, an unparseable date, and a future date.

const now = new Date('2026-07-25T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

test('recent ages read in the units a human actually wants', () => {
  assert.equal(formatFreshness(ago(10_000), now).age, 'just now')
  assert.equal(formatFreshness(ago(5 * 60_000), now).age, '5m ago')
  assert.equal(formatFreshness(ago(2 * 3600_000), now).age, '2h ago')
  assert.equal(formatFreshness(ago(24 * 3600_000), now).age, 'yesterday')
  assert.equal(formatFreshness(ago(3 * 24 * 3600_000), now).age, '3 days ago')
})

test('tone degrades fresh → recent → stale as the push ages', () => {
  assert.equal(formatFreshness(ago(60_000), now).tone, 'fresh')
  assert.equal(formatFreshness(ago(2 * 3600_000), now).tone, 'fresh')
  assert.equal(formatFreshness(ago(18 * 3600_000), now).tone, 'recent')
  assert.equal(formatFreshness(ago(3 * 24 * 3600_000), now).tone, 'recent')
  // Seven days: past here, "nobody pushed" is the likely story and the viewer should know.
  assert.equal(formatFreshness(ago(8 * 24 * 3600_000), now).tone, 'stale')
})

test('a FUTURE timestamp is labelled clock skew, never laundered into "just now"', () => {
  // The failure this exists for. Treating a future date as zero-age would hide real clock skew or a
  // broken generator behind the most reassuring label the UI has.
  const future = new Date(now.getTime() + 3 * 3600_000).toISOString()
  const f = formatFreshness(future, now)
  assert.equal(f.age, 'clock skew')
  assert.equal(f.tone, 'unknown')
})

test('sub-minute future drift is tolerated as "just now" rather than alarming on clock jitter', () => {
  // Two machines are never perfectly synced; a few seconds of skew is normal and must not scream.
  const barelyFuture = new Date(now.getTime() + 20_000).toISOString()
  assert.equal(formatFreshness(barelyFuture, now).age, 'just now')
})

test('a missing or unparseable date is "unknown", not a crash and not a guess', () => {
  for (const bad of [null, undefined, '', 'not a date', 'yesterday']) {
    const f = formatFreshness(bad as string | null, now)
    assert.equal(f.age, 'unknown', `expected unknown for ${JSON.stringify(bad)}`)
    assert.equal(f.tone, 'unknown')
    assert.equal(f.iso, null)
  }
})

test('the commit is shortened, and its absence does not break the stamp', () => {
  assert.equal(formatFreshness(ago(0), now, '5e27e6e2572bc3dc50c6a88ac').shortCommit, '5e27e6e')
  assert.equal(formatFreshness(ago(0), now, null).shortCommit, null)
  assert.equal(formatFreshness(ago(0), now).shortCommit, null)
})

test('iso is a real instant a <time dateTime> can use', () => {
  const f = formatFreshness('2026-07-25T10:00:00.000Z', now)
  assert.equal(f.iso, '2026-07-25T10:00:00.000Z')
})

test('freshnessLabel degrades gracefully when a tenant pushed without provenance', () => {
  // A customer pushing from their own tooling may have no commit to cite. The age alone is still
  // the useful half — the label must not render "as of merge null".
  assert.equal(
    freshnessLabel(formatFreshness(ago(2 * 3600_000), now, 'abc1234def')),
    'as of merge abc1234, 2h ago'
  )
  assert.equal(freshnessLabel(formatFreshness(ago(2 * 3600_000), now)), 'as of 2h ago')
  assert.equal(freshnessLabel(formatFreshness(null, now)), 'as of an unknown time')
  assert.ok(!freshnessLabel(formatFreshness(ago(0), now)).includes('null'))
})
