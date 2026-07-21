import 'server-only'
import { cookies } from 'next/headers'

// multi-tenant-activation · Sprint 2, Stories 2.1 + 2.3 — the one-time hand-off of a freshly
// provisioned tenant's plaintext API key, from the auth callback that mints it to the onboarding
// page that shows it once.
//
// Why a cookie and not a query parameter: a `?key=gb_key_…` redirect writes the credential into
// the server access log, the browser's history and address bar, and any Referer header the
// onboarding page emits to a third party. httpOnly also keeps it out of reach of any script on
// the page, so a compromised dependency can't read it back out of the DOM.
//
// Why a cookie and not a DB column: the plaintext is deliberately unrecoverable by design (Story
// 1.3 stores only its sha256). Persisting it — even briefly, even "just for onboarding" — would
// undo exactly the property that makes a leaked DB dump not a credential leak.
//
// The cookie is BOUND TO A PROJECT SLUG, not a bare key string. Without that binding a user who
// belongs to more than one project could open a *different* project's onboarding page inside the
// hand-off window and be shown the new tenant's live credential under the wrong project's
// heading — a cross-tenant credential exposure on a page whose whole job is to display a secret
// (cross-review, Codex 2026-07-20).

const COOKIE_NAME = 'gb_onboarding_key'
// Deliberately short. This is a live credential sitting in a cookie jar; the window only needs to
// cover a redirect plus a first render plus a moment to copy. If it expires, onboarding renders
// the "issue a key" path — a recoverable inconvenience, not a lockout.
const MAX_AGE_SECONDS = 10 * 60

type OnboardingKey = { slug: string; key: string }

export async function setOnboardingKeyCookie(projectSlug: string, plaintextKey: string): Promise<void> {
  const cookieStore = await cookies()
  const payload: OnboardingKey = { slug: projectSlug, key: plaintextKey }
  cookieStore.set(COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    // Not `secure: true` unconditionally — that would silently drop the cookie over plain HTTP on
    // localhost and make onboarding untestable locally. In production the site is HTTPS-only.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // must survive the cross-site navigation FROM the email client's link
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

function parse(raw: string | undefined): OnboardingKey | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as OnboardingKey).slug === 'string' &&
      typeof (parsed as OnboardingKey).key === 'string'
    ) {
      return parsed as OnboardingKey
    }
    return null
  } catch {
    // A cookie from an older deploy (the pre-binding format was a bare key string) or a corrupted
    // value. Treat as absent — the page falls back to "issue a new key", which is always safe.
    return null
  }
}

/**
 * The key to show on `projectSlug`'s onboarding page, or null.
 *
 * Returns null when the stored key belongs to a DIFFERENT project — that mismatch is the
 * cross-tenant case above, and the correct answer is "nothing to show here", never the other
 * tenant's secret.
 *
 * Read-only: a Server Component's cookie store cannot be written during render, so this cannot
 * clear the cookie. One-time-ness is therefore enforced by the short TTL plus the explicit
 * `consumeOnboardingKeyCookie()` the page's "I've saved it" control calls — stated plainly here
 * because an earlier version of this file claimed show-once while only ever peeking, which meant
 * a refresh re-displayed the credential for the whole window.
 */
export async function readOnboardingKeyFor(projectSlug: string): Promise<string | null> {
  const cookieStore = await cookies()
  const stored = parse(cookieStore.get(COOKIE_NAME)?.value)
  if (!stored || stored.slug !== projectSlug) return null
  return stored.key.trim() || null
}

/**
 * Clears the hand-off cookie. MUST be called from a Route Handler or Server Action — a Server
 * Component render cannot delete a cookie, so calling it there silently no-ops.
 */
export async function consumeOnboardingKeyCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export { COOKIE_NAME as ONBOARDING_KEY_COOKIE }
