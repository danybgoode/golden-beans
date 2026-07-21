import { NextResponse, type NextRequest, after } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase-auth'
import { getSiteUrl } from '@/lib/site-url'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { isSignupEnabled } from '@/lib/flags'
import { provisionTenantForUser, registerStarterFeature } from '@/lib/provisioning'
import { trackSelfEvent, ACCOUNT_CONFIRMED_EVENT } from '@/lib/self-track'
import { setOnboardingKeyCookie } from '@/lib/onboarding-key'

// multi-tenant-activation · Sprint 1, Story 1.1 — the code-exchange landing. Supabase links back
// here with a `code`; we exchange it for a session (setting the auth cookies) and send the user on.
// Redirect base comes from getSiteUrl() (AGENTS rule #5 — never the request Host header).
//
// `next` is attacker-controlled — the origin-comparing guard lives in lib/safe-redirect.ts as a
// pure, zero-import function so it can be asserted directly by the e2e suite (this route only
// consults `next` after a successful code exchange, so an HTTP-level spec can't reach that branch).
//
// Sprint 2, Story 2.1 extends it: a successful exchange is also the moment an email is CONFIRMED,
// so this is where a self-serve tenant gets provisioned. Sign-in confirmations flow through here
// too — which is exactly why provisionTenantForUser is idempotent on membership: an existing
// member arriving here gets `created: false` and nothing is written.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const target = safeRedirectPath(searchParams.get('next'), getSiteUrl())

  if (code) {
    const supabase = await createAuthServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user
      // The gate is re-checked HERE, not only on the signup route. Flipping SIGNUP_ENABLED back
      // off must stop provisioning immediately — including for confirmation links already sitting
      // in inboxes when the flip happened. A gate checked only at the front door leaves a queue of
      // pending links that can still create tenants behind it.
      if (user && isSignupEnabled()) {
        const result = await provisionTenantForUser(user.id, user.email ?? '')
        if (!result.ok) {
          console.error('[auth/callback] provisioning failed:', result.error)
          // The session is real and sign-in succeeded, so we do NOT fail the login. /app honestly
          // shows "no projects yet" and the next sign-in retries provisioning — stranding a user
          // who now has a working account would be the worse outcome.
        } else if (result.created) {
          // The plaintext key exists for exactly this one request and is never stored. Hand it to
          // the onboarding page through a short-lived, httpOnly, single-read cookie — never a
          // query parameter, which would land in server logs, browser history, and any Referer
          // header the destination page emits.
          if (result.plaintextKey) {
            await setOnboardingKeyCookie(result.plaintextKey)
            // Off the request path deliberately — see registerStarterFeature's own comment.
            const starterKey = result.plaintextKey
            after(() => registerStarterFeature(starterKey))
          }
          after(() => trackSelfEvent(ACCOUNT_CONFIRMED_EVENT, user.id))
          return NextResponse.redirect(
            new URL(`/app/onboarding/${result.projectSlug}`, getSiteUrl()),
          )
        }
      }
      return NextResponse.redirect(target)
    }
  }
  return NextResponse.redirect(new URL('/login?error=auth', getSiteUrl()))
}
