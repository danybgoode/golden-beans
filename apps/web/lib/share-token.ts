import { randomBytes } from 'node:crypto'

// pod-report · Sprint 3, Story 3.1 — the share token's pure half.
//
// Split out of lib/report-shares.ts because that module imports 'server-only', and a unit-tested
// pure helper cannot share a file with a runtime-only import — a generic test runner throws an
// opaque, unrelated-looking error the moment it loads the file at all (Roadmap/LEARNINGS.md, the
// lib/flags.ts precedent). These are the functions a security spec most needs to reach directly, so
// they live where a spec can reach them.
//
// Hashing is deliberately NOT here: it belongs to lib/credential-hash.ts, shared with ingest keys
// because both land in the same UNIQUE `key_hash` column. Keeping it there also keeps THIS module
// free of local imports — Node's type-stripping test runner resolves no extensionless relative
// import, which is why every unit-tested module in this lib/ is import-free. That constraint is
// load-bearing, not incidental: it is what makes these branches reachable by a spec at all.

/** Prefix on every share token, so one is recognisable on sight in a log or a support ticket. */
export const SHARE_TOKEN_PREFIX = 'gbs_'

/**
 * A new opaque token.
 *
 * 32 random bytes, against the 24 used for ingest keys. Deliberately larger for two reasons: this
 * credential is handed to people outside the company and ends up in browser history, Referer
 * headers and screenshots; and it is redeemed by a plain GET with no rate limiter in front of it,
 * where an ingest key sits behind one that makes guessing expensive.
 */
export function generateShareToken(): string {
  return `${SHARE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

/**
 * Cheap shape check before a database round-trip.
 *
 * Returns false for anything that cannot be one of our tokens. This is a load-shedder and NOT a
 * security control — it must never be the only thing between a caller and a resolution, because a
 * well-formed guess passes it. The real check is the hash lookup.
 *
 * It deliberately does NOT reject on length alone beyond a floor: a future token could be longer,
 * and a shape check that rejects valid credentials after a format change is worse than one that
 * occasionally lets a doomed lookup through.
 */
export function looksLikeShareToken(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.startsWith(SHARE_TOKEN_PREFIX) &&
    raw.length >= SHARE_TOKEN_PREFIX.length + 32
  )
}
