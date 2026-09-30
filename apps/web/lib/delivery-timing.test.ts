// verify-spike finding F3 — the timing order that "nothing is sent after a row is finished" rests on.
//
// The Quint model of the outbox (Roadmap/09-platform-infra/verify-spike/quint/outbox.qnt, landed with
// the spike's docs; findings table in DECISION.md there) shows that
// with stale reclaim allowed at ANY time, a row can be reclaimed while its first worker is still
// alive, and both workers send — including after the row is already `delivered`. In production that
// cannot happen only because of three numbers in two files:
//
//   TICK_BUDGET_MS (route)  <  maxDuration (route, seconds)  <=  STALE_CLAIM_MS (dispatcher)
//
// A worker stops sending by the tick budget and is killed by the platform at maxDuration, so by the
// time a claim is old enough to reclaim, the worker that made it is gone. Equality (300s = 300s today)
// is deliberate and safe: `claimed_at` is stamped per project, AFTER the invocation started, so the
// kill lands no later than claimed_at + maxDuration, while reclaim needs now > claimed_at + STALE
// (the strictness lives in the SQL: `claimed_at < p_now - interval`, 20260724100000_delivery_retry.sql). The margin that actually protects SENDS is the first test's:
// the dispatcher stops sending at TICK_BUDGET_MS, 60s before the kill. Equality only leaves a worker
// hung past its own send timeout at the kill instant, separated by cross-instance clock skew. Nothing enforced the order;
// raising maxDuration (Vercel allows far more than 300s) would have silently re-opened the window.
// The route cannot be imported here (Next.js `@/` aliases), so the constants are read as literals, and
// a missing pattern FAILS rather than passing on a file this test could not read.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const route = readFileSync(join(here, '../app/api/internal/dispatch-deliveries/route.ts'), 'utf8')
const dispatch = readFileSync(join(here, 'delivery-dispatch.ts'), 'utf8')
const deliveries = readFileSync(join(here, 'deliveries.ts'), 'utf8')
const vercelJson = JSON.parse(readFileSync(join(here, '../vercel.json'), 'utf8'))

/** A literal like `240_000` or `5 * 60 * 1000` — digits, underscores and `*` only, nothing evaluated. */
function literalMs(source: string, pattern: RegExp, name: string): number {
  const match = pattern.exec(source)
  assert.ok(match, `${name} not found — this guard must be updated with the constant, not skipped`)
  const expr = match[1].trim()
  assert.match(expr, /^[\d_]+(\s*\*\s*[\d_]+)*$/, `${name} is no longer a plain literal: ${expr}`)
  return expr.split('*').reduce((product, part) => product * Number(part.trim().replace(/_/g, '')), 1)
}

const maxDurationMs = literalMs(route, /^export const maxDuration = ([^\n]+)$/m, 'maxDuration') * 1000
const tickBudgetMs = literalMs(route, /^const TICK_BUDGET_MS = ([^\n]+)$/m, 'TICK_BUDGET_MS')
const staleClaimMs = literalMs(dispatch, /^export const STALE_CLAIM_MS = ([^\n]+)$/m, 'STALE_CLAIM_MS')
// The cron's enumeration (projects_with_due_work) has its OWN default stale window, and the route calls
// it without an override. Enumeration and claim must agree (deliveries.ts says so), or a stale row the
// claim would take is never enumerated — or the reverse.
const enumerationStaleMs = literalMs(
  deliveries,
  /^\s*staleAfterMs = ([^\n]+?),?$/m,
  'projectsWithDueWork staleAfterMs'
)

test('the dispatcher stops sending before the platform kills it (TICK_BUDGET_MS < maxDuration)', () => {
  assert.ok(
    tickBudgetMs < maxDurationMs,
    `TICK_BUDGET_MS ${tickBudgetMs} must be < maxDuration ${maxDurationMs}ms`
  )
})

test('a claim is only reclaimable once the worker that made it is dead (maxDuration <= STALE_CLAIM_MS)', () => {
  assert.ok(
    maxDurationMs <= staleClaimMs,
    `maxDuration ${maxDurationMs}ms must be <= STALE_CLAIM_MS ${staleClaimMs}ms, or a live worker's claim can be ` +
      'reclaimed and the same delivery sent twice, even after it was delivered (verify-spike F3)'
  )
})

test('the enumeration and the claim use the same stale window', () => {
  assert.equal(
    enumerationStaleMs,
    staleClaimMs,
    'projectsWithDueWork() staleAfterMs default must equal STALE_CLAIM_MS'
  )
})

test('no vercel.json functions block overrides the route maxDuration this guard reads', () => {
  assert.equal(
    vercelJson.functions,
    undefined,
    'apps/web/vercel.json now has a `functions` block — extend this guard to read its maxDuration'
  )
})
