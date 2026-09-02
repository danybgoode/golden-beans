'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'
import { Button, Field } from '@/design-system/primitives'

// multi-tenant-activation · Sprint 1, Story 1.1 — SIGN-IN ONLY. Account creation lives on
// `/signup`, behind `SIGNUP_ENABLED`, and the door links there only when that gate is open.
// On success we push to /app and refresh so the server shell re-reads the freshly-set session.
//
// design-system-rails · Sprint 6, Story 6.2 — the approved `door-login` form. It is the design
// system's `Field` and `Button`, not `.auth-form`: the label/error/`aria-describedby` wiring lives
// in the primitive, so this file cannot forget it.

/**
 * What the door says when the credentials do not match.
 *
 * ⚠️ **It is OUR sentence, not Supabase's, and that is a deliberate narrowing.** GoTrue answers
 * `Invalid login credentials` for a wrong password AND for an address that has never been
 * registered — which is correct and non-enumerating — but it answers other messages that are not,
 * `Email not confirmed` being the plain one: it confirms the account exists. Passing every message
 * through verbatim means the page's non-enumeration property depends on which strings a dependency
 * happens to return this release.
 *
 * So the credential-shaped failures collapse into one sentence on the password field, and anything
 * else is shown as what it is — an operational failure, which tells a stranger nothing about an
 * account either way.
 */
const CREDENTIALS_MESSAGE =
  'That password does not match this email. Try again — nothing here tells anybody whether an account exists.'

/**
 * Which GoTrue failures are "these credentials did not work".
 *
 * Matched on the STATUS plus a small set of codes rather than on the message text, because the text
 * is localisable and the codes are not. `400`/`422` with no recognised code still lands here: a
 * rejected sign-in is a rejected sign-in, and the safe default on this page is the sentence that
 * reveals nothing.
 */
function isCredentialFailure(status: number | undefined, code: string | undefined): boolean {
  if (code === 'invalid_credentials' || code === 'email_not_confirmed' || code === 'user_not_found') {
    return true
  }
  return status === 400 || status === 422
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFieldError(null)
    setFormError(null)
    const supabase = createAuthBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      if (isCredentialFailure(error.status, error.code)) setFieldError(CREDENTIALS_MESSAGE)
      // Rate limits, outages and misconfiguration are shown as themselves. A person who is being
      // told "wrong password" when the auth service is down retypes a correct password forever.
      else setFormError(error.message)
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <form className="ds-doorform" onSubmit={onSubmit}>
      <Field label="Email" controlId="login-email">
        {(control) => (
          <input
            {...control}
            className="ds-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        )}
      </Field>
      {/* `error` is passed (as `null` when valid) rather than omitted: that is what reserves the
          message's line height, so a failed sign-in does not shove the button a cursor is already
          moving towards. */}
      <Field label="Password" controlId="login-password" error={fieldError}>
        {(control) => (
          <input
            {...control}
            className="ds-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        )}
      </Field>
      <Button type="submit" variant="primary" state={busy ? 'loading' : 'idle'}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {formError !== null && (
        <p className="ds-field-error" role="alert">
          {formError}
        </p>
      )}
    </form>
  )
}
