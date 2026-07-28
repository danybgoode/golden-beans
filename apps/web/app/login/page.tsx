import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { LoginForm } from './login-form'

// multi-tenant-activation · Sprint 1, Story 1.1 — the sign-in / sign-up front door. Already signed
// in? Skip straight to the app shell.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/app')
  return (
    <main className="auth-shell">
      <BrandLockup />
      <section className="auth-shell__card">
        <p className="kicker">Welcome back, climber</p>
        <h1>Sign in</h1>
        <p style={{ color: 'var(--dim)', marginBottom: 24 }}>
          Your signals are planted. Pick up where the growth left off.
        </p>
        <LoginForm />
      </section>
    </main>
  )
}
