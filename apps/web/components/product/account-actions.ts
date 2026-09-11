'use server'
import { revalidatePath } from 'next/cache'
import { createAuthServerClient, getSessionUser } from '@/lib/supabase-auth'
import { parseDisplayName } from '@/lib/display-name'

// mockups-as-built · Story 3.5 — set your own name, from the Account menu.
//
// ── Every call re-authenticates from scratch ──────────────────────────────────────────────────
// A Server Action is a public POST endpoint. Rendering the menu proved nothing, so the session is
// read again here — and the write goes through THAT session's own client, not the service role.
// `auth.updateUser` can only ever change the signed-in user's own record, so there is no id to
// forge: whose name changes is decided by the cookie, never by an argument.

export type SetDisplayNameResult = { ok: true; name: string | null } | { ok: false; error: string }

export async function setDisplayNameAction(raw: unknown): Promise<SetDisplayNameResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again, then set your name.' }

  // The SAME rules sign-up applies — one function, so the two doors cannot disagree about what a
  // name may contain. An empty field is a valid answer: it clears the name and the email shows.
  const parsed = parseDisplayName(raw)
  if (!parsed.ok) return parsed

  const supabase = await createAuthServerClient()
  // `display_name: null` rather than deleting the key: `updateUser` MERGES metadata, so an omitted
  // key would leave the old name in place — a "clear" that did nothing.
  const { error } = await supabase.auth.updateUser({ data: { display_name: parsed.value } })
  if (error) {
    console.error('[account] could not update display_name:', error.message)
    return { ok: false, error: 'Could not save your name. Try again.' }
  }

  // Every signed-in page renders the shell, and Activity renders the name — both read it on the
  // server, so the layout is what has to re-render.
  revalidatePath('/app', 'layout')
  return { ok: true, name: parsed.value }
}
