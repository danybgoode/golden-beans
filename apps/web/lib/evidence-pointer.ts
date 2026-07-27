// signals-loop · Sprint 3, Story 3.2 — classifying a resolution's evidence pointer.
//
// Amendment 4.2 (epic README): `resolve` carries an evidence pointer — a commit SHA, a PR URL or a
// note — and **a resolution with no RESOLVABLE pointer is recorded as resolved *without evidence*,
// never silently as evidenced.** That is pod-report's honesty rule one layer in: there, a maturity
// criterion with no resolvable evidence pointer is downgraded rather than asserted.
//
// The distinction is not decorative. "This task was fixed" and "this task was fixed, here is the
// commit" are different claims, and the whole point of closing the loop in the customer's agent is
// that the close is AUDITABLE. An agent that resolves fifty tasks with the note "done" has produced
// fifty unfalsifiable assertions; the system must be able to say so rather than counting them as
// evidence. Story 3.3 then feeds exactly this distinction into the AI-adoption ladder, so a
// misclassification here becomes an inflated maturity score on the landing page.
//
// ── Why this file has ZERO imports ─────────────────────────────────────────────────────────────
// Roadmap/LEARNINGS.md, from multi-tenant-activation S1: a guard sitting behind an auth/state
// precondition the test harness cannot satisfy is structurally unreachable by an HTTP-level spec —
// four specs there passed identically against a deliberately re-broken build. The write tools are
// behind two credentials AND two flags, so an end-to-end spec cannot cheaply reach every branch of
// this logic. Keeping it pure and import-free (the lib/flags.ts precedent) means the classification
// can be asserted directly, in a unit test, with no server, no database and no credentials.

/**
 * What kind of evidence a resolution carries.
 *
 * - `commit` — a git SHA. Resolvable: someone can look it up.
 * - `url`    — an http(s) URL (a PR, an issue, a build). Resolvable.
 * - `note`   — free text. A human explanation, accepted and stored, but NOT evidence.
 * - `none`   — nothing supplied.
 */
export type EvidenceKind = 'commit' | 'url' | 'note' | 'none'

export type EvidenceClassification = {
  kind: EvidenceKind
  /** The normalised pointer to store, or null when nothing usable was supplied. */
  value: string | null
  /**
   * Whether this counts as EVIDENCE — i.e. something a third party could go and check.
   * `note` is deliberately false. That is the entire point of this module.
   */
  resolvable: boolean
}

/**
 * A git commit SHA: 7–40 hexadecimal characters, nothing else.
 *
 * The lower bound is 7 because that is git's own conventional short form. The upper is 40 (SHA-1);
 * a 64-char SHA-256 object id would classify as `note`, which is a deliberate under-claim rather
 * than a guess — this repo is SHA-1 and widening the pattern to admit hashes we cannot resolve would
 * be inventing resolvability. Anchored, so `deadbeef and also nonsense` is a note, not a commit.
 */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/i

/**
 * An absolute http(s) URL.
 *
 * Deliberately NOT a permissive "contains a dot" check, and deliberately not accepting other
 * schemes. `javascript:`, `data:` and `file:` are not evidence and one of them is an XSS vector if a
 * renderer ever turns a pointer into a link — which the dashboard drawer plausibly will. Refusing
 * them here means no downstream renderer has to remember to.
 */
function isHttpUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  // `new URL('https://')` throws, but `new URL('https://?x')` does not and yields an empty host.
  return parsed.hostname.length > 0
}

/** Bound on a stored pointer. A "note" is a pointer, not a changelog. */
export const MAX_EVIDENCE_POINTER_LENGTH = 500

/**
 * Classify a caller-supplied evidence pointer.
 *
 * Never throws and never rejects: any string is ACCEPTABLE input. What varies is whether it counts
 * as evidence. Refusing a free-text note outright would push an agent toward fabricating a
 * plausible-looking SHA to satisfy the API, which is strictly worse than recording an honest note
 * and labelling it as not-evidence.
 */
export function classifyEvidencePointer(raw: unknown): EvidenceClassification {
  if (typeof raw !== 'string') return { kind: 'none', value: null, resolvable: false }

  const trimmed = raw.trim()
  if (trimmed.length === 0) return { kind: 'none', value: null, resolvable: false }

  const value = trimmed.slice(0, MAX_EVIDENCE_POINTER_LENGTH)

  // URL before commit: neither pattern can match the other (a URL contains `:` and `/`, which the
  // anchored hex pattern forbids), so the order is for readability, not disambiguation.
  if (isHttpUrl(value)) return { kind: 'url', value, resolvable: true }
  if (COMMIT_SHA.test(value)) return { kind: 'commit', value, resolvable: true }

  return { kind: 'note', value, resolvable: false }
}

/**
 * The one-line summary an agent gets back, and the audit row records.
 *
 * Phrased so a resolution WITHOUT evidence says so in its own words rather than being distinguished
 * only by a boolean the caller might not read. An agent reading "recorded without evidence" is being
 * told something; an agent reading `resolvable: false` is being given a field to ignore.
 */
export function describeEvidence(classification: EvidenceClassification): string {
  switch (classification.kind) {
    case 'commit':
      return 'Resolved with evidence: a commit SHA.'
    case 'url':
      return 'Resolved with evidence: a link.'
    case 'note':
      return 'Resolved WITHOUT evidence — the pointer supplied is a note, not something a third party can check. The note is stored.'
    case 'none':
      return 'Resolved WITHOUT evidence — no pointer was supplied.'
  }
}
