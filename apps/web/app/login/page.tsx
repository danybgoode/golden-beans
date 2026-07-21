import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { LoginForm } from './login-form'

// multi-tenant-activation · Sprint 1, Story 1.1 — the sign-in / sign-up front door. Already signed
// in? Skip straight to the app shell.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/app')
  return (
    <main>
      <h1>Golden Beans — sign in</h1>
      <LoginForm />
    </main>
  )
}
