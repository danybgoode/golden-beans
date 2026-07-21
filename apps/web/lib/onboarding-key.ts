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

const COOKIE_NAME = 'gb_onboarding_key'
// Long enough to survive the redirect plus a slow first render; short enough that a shared or
// walked-away-from browser isn't holding a live credential. If it expires, onboarding renders the
// "issue a key" path instead — a recoverable inconvenience, not a lockout.
const MAX_AGE_SECONDS = 15 * 60

export async function setOnboardingKeyCookie(plaintextKey: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, plaintextKey, {
    httpOnly: true,
    // Not `secure: true` unconditionally — that would silently drop the cookie over plain HTTP on
    // localhost and make onboarding untestable locally. In production the site is HTTPS-only.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // must survive the cross-site navigation FROM the email client's link
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * Reads the key and clears it in the same call — "show once" is enforced here rather than trusted
 * to the page. Returns null when there is nothing to show (expired, already consumed, or an
 * ordinary revisit), which the onboarding page renders as the "issue a new key" path.
 *
 * Must be called from a Route Handler or Server Action, not a Server Component: the cookie store
 * is read-only during a Server Component render, so the delete would silently no-op there and the
 * key would keep re-displaying on every refresh — the exact opposite of show-once.
 */
export async function consumeOnboardingKeyCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value?.trim() || null
  if (value) cookieStore.delete(COOKIE_NAME)
  return value
}

/** Read without consuming — for the Server Component render path, where a delete cannot land. */
export async function peekOnboardingKeyCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value?.trim() || null
}

export { COOKIE_NAME as ONBOARDING_KEY_COOKIE }
