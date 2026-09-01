'use client'

import { useState, type FormEvent } from 'react'
import { Button, Field } from '@/design-system/primitives'
import { MIN_PASSWORD_LENGTH } from '@/lib/signup-schema'

// multi-tenant-activation · Sprint 3, Story 3.1/3.2 — posts to /api/v1/public/signup (Sprint 2,
// Story 2.1). The honeypot + submit-state + error-handling idiom is lifted from
// WaitlistForm.tsx (components/landing/WaitlistForm.tsx) rather than reinvented — this route
// deliberately does NOT call supabase.auth.signUp() straight from the browser (see the route's
// own header comment: a client-side call would bypass the enablement gate, the honeypot, and the
// rate limit entirely, so the gate would be decoration).
//
// design-system-rails · Sprint 6, Story 6.2 — the approved `door-signup-open` form, on the design
// system's `Field` and `Button`. It reads the same way as `login-form.tsx` next door, which is the
// point: two auth doors that share a stylesheet and not a component are two doors.

type Status = 'idle' | 'submitting' | 'success' | 'error'

// ⚠️ **The approved state's placeholder says "At least 12 characters". The product's floor is 8.**
// `lib/signup-schema.ts` sets `MIN_PASSWORD_LENGTH = 8` with a written reason ("a floor and not a
// composition rule"), and the API rejects on that number — so the prototype's 12 is a claim this
// form cannot keep, and a person typing 9 characters would have been told nothing until the server
// said no. Imported rather than retyped: a hint about a limit that does not read the limit is a
// second source of truth for the same rule, which is what this whole epic is about.
const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters`

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/v1/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, company }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        setStatus('error')
        setError(body?.error ?? 'Something went wrong — try again.')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Something went wrong — try again.')
    }
  }

  // Success replaces the form outright — the account exists but is unconfirmed (no tenant yet,
  // see lib/provisioning.ts), so there is nothing left for this form to do except tell the
  // visitor where to go next.
  if (status === 'success') {
    return (
      <div className="ds-doornote" role="status">
        <b>Check your email for a confirmation link.</b> Click it and your project, your API key and your
        connector URL are ready — there are no manual steps after this.
      </div>
    )
  }

  return (
    <form className="ds-doorform" onSubmit={onSubmit}>
      <Field label="Email" controlId="signup-email">
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
      <Field label="Password" controlId="signup-password" hint={PASSWORD_HINT}>
        {(control) => (
          <input
            {...control}
            className="ds-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>
      {/* Honeypot — visually off-screen (not display:none, which some bots skip filling), same
          idiom as WaitlistForm.tsx. */}
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="form-honeypot"
      />
      <Button type="submit" variant="primary" state={status === 'submitting' ? 'loading' : 'idle'}>
        {status === 'submitting' ? 'Starting…' : 'Create account'}
      </Button>
      {status === 'error' && (
        <p className="ds-field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
