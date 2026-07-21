// multi-tenant-activation · Sprint 2, Story 2.1 — deriving a project slug from a signup email.
//
// Deliberately ZERO-IMPORT (no `server-only`, no crypto, no DB) — the same rule lib/flags.ts,
// lib/roles.ts and lib/safe-redirect.ts follow (Roadmap/LEARNINGS.md): a pure helper that a spec
// must assert directly cannot share a file with runtime-only imports, or a plain test runner
// throws an opaque unrelated error just importing it. Uniqueness is the DB's job (a UNIQUE
// constraint plus a retry loop in lib/provisioning.ts); this file only decides SHAPE.

// A slug lands in public URLs (/app/funnel/<slug>/...), so the character set is deliberately
// narrow: lowercase alphanumerics and single inner hyphens, nothing else.
const MIN_SLUG_LENGTH = 3
const MAX_SLUG_LENGTH = 40

// Slugs that must never be handed to a self-serve tenant. Two distinct dangers, both real:
//   • `assertPublicAllowedSlug` (AGENTS rule #2) gates the public demo BY SLUG — a stranger who
//     could register the demo slug would inherit a publicly-readable dashboard. The env-driven
//     demo/self slugs are checked separately at provisioning time (see lib/provisioning.ts);
//     these are the STRUCTURAL reservations that hold regardless of configuration.
//   • a slug that collides with an /app route segment or an obvious impersonation target.
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'demo', 'docs', 'experiments', 'funnel',
  'golden-beans', 'help', 'impact', 'install', 'internal', 'keys', 'login', 'logout', 'mcp',
  'north-star', 'onboarding', 'public', 'root', 'settings', 'signup', 'staff', 'static',
  'superuser', 'support', 'system', 'test', 'www',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}

/**
 * The slug shape a raw candidate normalizes to, or null if nothing usable survives.
 *
 * Lowercases, replaces every run of non-alphanumerics with a single hyphen, and trims hyphens
 * from both ends — so `Daniel.Perez+gb@Example.com` and `daniel-perez` both land on the same
 * well-formed shape rather than smuggling a `+`, a dot or a leading hyphen into a URL.
 */
export function normalizeSlug(candidate: string): string | null {
  const slug = candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing hyphen can reappear after the length truncation above.
    .replace(/-+$/g, '')
  return slug.length >= MIN_SLUG_LENGTH ? slug : null
}

/**
 * The slug a signup email suggests — the local part only, never the domain.
 *
 * Returns null when the email yields nothing usable (`a@b.com`, `--@x.com`, an address that is
 * all punctuation). Callers MUST handle null with a generated fallback rather than assuming an
 * email always produces a slug: `provisionTenantForUser` must never fail a confirmed signup just
 * because the address was short.
 *
 * Only the local part is used, so two people at the same company get distinct suggestions rather
 * than fighting over their shared domain — and a corporate domain never becomes a slug that looks
 * like an official tenant of that company.
 */
export function slugFromEmail(email: string): string | null {
  const localPart = email.split('@')[0] ?? ''
  const slug = normalizeSlug(localPart)
  if (!slug || isReservedSlug(slug)) return null
  return slug
}
