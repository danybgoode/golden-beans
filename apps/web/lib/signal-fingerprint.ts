import { createHash } from 'node:crypto'

// signals-loop · Story 1.0 — the deterministic grouping key.
//
// One thousand repeats of the same crash must read as ONE problem with a count of a thousand, and
// two genuinely different crashes must never merge. Everything else in the epic — impact ranking,
// promotion thresholds, dedupe, the whole task queue — is downstream of this function being both
// stable and discriminating.
//
// ── The fingerprint is computed HERE, server-side, and never read from the payload ────────────
// A tenant could send `tags.fingerprint` and we would ignore it. Not because a tenant would attack
// their own project, but because "the engine decides what is one problem" is the product: a client
// that fingerprints its own errors has re-implemented the grouping, badly, in n places, and the
// engine's counts stop meaning anything comparable across releases.
//
// Zero framework imports (node:crypto only, the same shape as lib/credential-hash.ts) so every
// normalization branch below is reachable directly from a unit test.

/** Placeholder tokens left behind by normalization. Visible in tests, and in the stored title. */
const NUM = '<n>'
const HEX = '<hex>'
const UUID = '<uuid>'
const STR = '<s>'

/**
 * Strips the parts of a message that VARY between occurrences of the same bug.
 *
 * This is the whole trick, and getting it wrong fails in one of two loud ways: too aggressive and
 * every error in the app collapses into one useless signal; too timid and `User 41 not found`
 * versus `User 42 not found` become two thousand signals nobody can act on. The rules below are
 * ordered most-specific-first so a UUID is replaced as a UUID rather than being chewed into
 * `<hex>-<hex>-…` by the hex rule underneath it.
 */
export function normalizeMessage(message: string): string {
  return (
    message
      .toLowerCase()
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, UUID)
      .replace(/\b0x[0-9a-f]+\b/g, HEX)
      .replace(/\b[0-9a-f]{8,}\b/g, HEX)
      // Quoted literals are almost always the varying datum ("could not find 'order_8821'").
      .replace(/"[^"]*"/g, STR)
      .replace(/'[^']*'/g, STR)
      // Any remaining number, including decimals and negatives.
      .replace(/-?\d+(?:\.\d+)?/g, NUM)
      // Collapse whitespace last, so the replacements above can't leave ragged spacing that makes two
      // identical messages hash differently.
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Reduces a stack to its single most identifying frame: the first line that names application
 * code.
 *
 * Deliberately NOT the whole stack. A stack's tail varies with the caller — the same bug reached
 * from two routes has two stacks — so hashing all of it splits one problem into as many signals as
 * there are call sites. The top application frame is the thing that is the same in both.
 *
 * Node-internal and dependency frames are skipped, because a crash "in" node_modules is virtually
 * always the caller's bug and grouping by the library frame merges unrelated problems.
 */
export function topAppFrame(stack: string | null | undefined): string | null {
  if (!stack) return null
  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('at ')) continue
    if (/node_modules|node:internal|\(native\)|<anonymous>/.test(line)) continue

    // Keep function name + file basename + line, drop the absolute path and the column. The path
    // varies by machine and by deploy (a /vercel/path0/ prefix, a developer's home directory), and
    // the column moves on any reformat — neither is a property of the bug.
    const withoutColumn = line.replace(/:(\d+):(\d+)\)?$/, ':$1')
    const normalized = withoutColumn
      .replace(/\(?(?:[A-Za-z]:)?[^\s()]*[/\\]/g, '(')
      .replace(/^at\s+/, '')
      .trim()
    if (normalized) return normalized
  }
  return null
}

export type FingerprintInput = {
  /** 'error' or 'friction' — never merged, even if everything else matched. */
  kind: string
  /** The error class or the friction rule key. */
  name: string
  /** The error message, or the friction finding's stable description. */
  message: string
  /** The raw stack, if any. Ignored entirely for friction signals. */
  stack?: string | null
  /** The feature registry key, when the event carried one. */
  featureId?: string | null
}

/**
 * A stable 32-hex-char grouping key.
 *
 * Truncated from sha256 rather than used whole: 128 bits is far past collision-relevant for a
 * per-project namespace (the uniqueness constraint is on `(project_id, fingerprint)`, not global),
 * and the shorter value is one a human can actually compare in a dashboard or paste into a query.
 *
 * The parts are joined with a delimiter that cannot appear in a normalized part, so
 * `{name: 'a\0b', message: 'c'}` and `{name: 'a', message: 'b\0c'}` cannot collide by
 * concatenation — the classic mistake in every hand-rolled composite key.
 */
export function computeSignalFingerprint(input: FingerprintInput): string {
  const parts = [
    input.kind,
    normalizeMessage(input.name),
    normalizeMessage(input.message),
    input.kind === 'error' ? (topAppFrame(input.stack) ?? '') : '',
    input.featureId ?? '',
  ]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
}

/**
 * The human-readable one-liner stored alongside the fingerprint.
 *
 * Uses the RAW message, not the normalized one — a title reading `user <n> not found` is accurate
 * and useless. The caller passes an already-scrubbed message (lib/signal-scrub.ts); this function
 * only bounds it.
 */
export function signalTitle(name: string, message: string, maxChars = 160): string {
  const combined = message.trim() ? `${name}: ${message.trim()}` : name
  const oneLine = combined.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxChars ? oneLine.slice(0, maxChars - 1) + '…' : oneLine
}
