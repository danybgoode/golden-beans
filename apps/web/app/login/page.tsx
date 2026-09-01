import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { isSignupEnabled } from '@/lib/flags'
import { Frame } from '@/design-system/Frame'
import { LoginForm } from './login-form'

// multi-tenant-activation · Sprint 1, Story 1.1 — the sign-in front door. Already signed in? Skip
// straight to the app shell.
//
// design-system-rails · Sprint 6, Story 6.2 — it renders the approved `door-login` state from
// `design-system/`. What it replaces is `.auth-shell`, a card that existed only here and on
// `/signup`: the first screen a customer ever saw was the one surface in the product with its own
// private stylesheet.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/app')

  // Gate-aware, and it has to be: `/signup` calls `notFound()` while `SIGNUP_ENABLED` is off
  // (`app/signup/page.tsx`), so an unconditional "Create one" would be a link to a hard 404 on the
  // one screen a locked-out person is already frustrated on. Read fresh per request, which is what
  // `force-dynamic` above buys.
  const signupOpen = isSignupEnabled()

  return (
    <Frame variant="door" brandHref="/">
      <h1>Sign in</h1>
      <p className="ds-doorlede">
        Your projects, your numbers, and whatever your agent got done while you were away.
      </p>
      <LoginForm />
      {signupOpen && (
        <div className="ds-doorfoot">
          No account yet? <a href="/signup">Create one</a>
        </div>
      )}
      {/* The state's actual subject. `door-login` exists to show an error that says what to do
          WITHOUT saying whether the email is registered — an error that distinguishes the two is a
          way to test which of your customers uses this product. */}
      <div className="ds-doornote">
        <b>The error is on the field and says what to do.</b> It does not say whether the email is
        registered — that would be a way to test which of your customers uses this product.
      </div>
    </Frame>
  )
}
