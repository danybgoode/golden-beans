// mockups-as-built · Story 3.5 — who made a change, in words a person reads.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────────────
// The approved `ship-activity` state draws *"**Daniel** turned `ml.sync_enabled` off in
// Development"*. The product rendered `actor_user_id` — a UUID — because NO name existed anywhere to
// render: sign-up collected an email and a password, and no screen let anyone set a name. Daniel's
// ruling, 2026-09-10: collect an optional name at sign-up and in the Account menu, and show the name
// when it is set, the EMAIL until then. The extra sign-up field is his approved deviation from
// `door-signup-open`.
//
// ⚠️ **ZERO imports, on purpose.** Sign-up is dark in CI, so an HTTP spec can only ever see its 404
// — the trap `e2e/signup.spec.ts` documents at length. The rules that decide what a name IS live
// here, where a unit test reaches them directly rather than inferring them from a status code that
// would be identical whether they were right or wrong.

/** Long enough for any real name; short enough that one cannot push a timeline row off screen. */
export const DISPLAY_NAME_MAX = 80

/**
 * Characters no one types into a name field: C0 and C1 controls, zero-width and direction marks,
 * bidi embeddings and overrides, invisible operators and the byte-order mark. Written as ESCAPES so
 * this file contains no invisible character itself — a reviewer must be able to see the rule.
 */
const UNSHOWABLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/

export type DisplayNameResult = { ok: true; value: string | null } | { ok: false; error: string }

/**
 * Validate a name somebody TYPED. `null` means "no name" — an empty field clears it.
 *
 * Ordinary whitespace is collapsed; every other unshowable character is REFUSED rather than
 * stripped. A name that arrives with a zero-width space or a right-to-left override in it was not
 * typed into a text field, and silently "fixing" it would store something the person never saw. The
 * override matters most: it can make one name in an audit read as a different name.
 */
export function parseDisplayName(raw: unknown): DisplayNameResult {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'A name must be text.' }
  // ⚠️ **Tab, newline and carriage return are the ONLY characters turned into spaces before the
  // check** — they are what a paste legitimately carries. Collapsing `\s` first, as the first draft
  // did, silently STRIPPED a byte-order mark: JavaScript's `\s` includes U+FEFF, so a leading BOM
  // became a space and `trim()` removed it, which is exactly the "silently fixed" outcome this
  // function refuses. Found by its own test. So the check reads everything else as it arrived.
  const pasted = raw.replace(/[\t\n\r]/g, ' ')
  if (UNSHOWABLE.test(pasted)) {
    return { ok: false, error: 'That name contains characters that cannot be shown.' }
  }
  const value = pasted.replace(/\s+/g, ' ').trim()
  if (value === '') return { ok: true, value: null }
  // Counted in code points, so a name in a script outside the Basic Multilingual Plane is not
  // charged double for the same number of characters a reader sees.
  if ([...value].length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Keep it to ${DISPLAY_NAME_MAX} characters.` }
  }
  return { ok: true, value }
}

/**
 * The name stored on an auth user's `user_metadata`, or `null`.
 *
 * `display_name` is what this product writes. `full_name` and `name` are read too, because they are
 * what Supabase's own dashboard and every OAuth provider write — so a user created by hand with a
 * name, or through a provider added later, is not shown by email for want of a key spelling. Every
 * candidate goes through `parseDisplayName`: metadata is user-writable, so it is input, not truth.
 *
 * ⚠️ **A PRESENT `display_name` is the person's decision, even when it is `null`** (cross-agent
 * review, agy, Blocking). Clearing the field in the Account menu writes `display_name: null`, and the
 * first version then skipped the null and read a provider's `full_name` — so anyone with one (a user
 * created in the Supabase dashboard with a name, or any future OAuth sign-in) cleared their name, saw
 * "Saved.", and kept it. The provider keys are a fallback for when the person has said NOTHING here,
 * never an override of having said "no name".
 */
export function displayNameFrom(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== 'object') return null
  const record = metadata as Record<string, unknown>
  if ('display_name' in record) {
    const own = parseDisplayName(record.display_name)
    return own.ok ? own.value : null
  }
  for (const key of ['full_name', 'name']) {
    const parsed = parseDisplayName(record[key])
    if (parsed.ok && parsed.value !== null) return parsed.value
  }
  return null
}

/** What the server learned about one actor. Absent entirely when the lookup failed or was skipped. */
export type ActorIdentity = { name: string | null; email: string | null }

/**
 * The words for who did something: the name, else the email, else the id itself.
 *
 * ⚠️ **The id is the LAST resort, never a blank and never an invented word.** It is what renders when
 * the lookup failed or the account no longer exists, and it is still the one fact that identifies
 * who acted — an audit that printed "someone" would be replacing an answer with a shrug.
 */
export function actorLabel(identity: ActorIdentity | undefined, actorUserId: string): string {
  return identity?.name ?? identity?.email ?? actorUserId
}
