import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'
import { generateApiKey, hashApiKey } from './api-keys'
import { generateConnectorToken } from './connector-tokens'
import { slugFromEmail, normalizeSlug, isReservedSlug } from './tenant-slug'
import { recordAudit } from './audit'
import { DEMO_PROJECT_SLUG } from './public-demo'
import { SELF_PROJECT_SLUG } from './self-track'

// multi-tenant-activation · Sprint 2, Story 2.1 — turning a CONFIRMED auth user into a working
// tenant: a project, an owner membership, a first API key, and a connector token for onboarding.
//
// Called from ONE place: app/auth/callback/route.ts, after a successful auth-code exchange. That
// placement is the acceptance criterion "unconfirmed accounts own no tenant" made structural
// rather than checked — an account that never completes the email round-trip never reaches this
// function at all, so there is no unconfirmed-but-provisioned state to guard against.

const MAX_SLUG_ATTEMPTS = 6
const PG_UNIQUE_VIOLATION = '23505'

export type ProvisionResult =
  | { ok: true; created: boolean; projectSlug: string; plaintextKey: string | null }
  | { ok: false; error: string }

// Slugs no self-serve tenant may take, ON TOP of tenant-slug.ts's structural reservations.
// Read at call time, not module load: these are env-driven (DEMO_PROJECT_SLUG, SELF_PROJECT_SLUG)
// and a stranger registering either one would inherit a publicly-readable dashboard
// (assertPublicAllowedSlug gates the demo BY SLUG — AGENTS rule #2) or start writing into the
// landing's own dogfood funnel.
function isForbiddenSlug(slug: string): boolean {
  return isReservedSlug(slug) || slug === DEMO_PROJECT_SLUG || slug === SELF_PROJECT_SLUG
}

/** The name of the partial unique index that enforces one self-serve project per creator. Must
 *  match the migration exactly — a rename there without a rename here silently turns the race
 *  handling back into the stranding bug, so both sides name it in a comment. */
const CREATOR_CONSTRAINT = 'projects_one_per_creator_idx'

function isCreatorConstraintViolation(error: { message?: string; details?: string } | null): boolean {
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''}`
  return haystack.includes(CREATOR_CONSTRAINT)
}

/** The slug of the project this user CREATED, resolved without going through membership — the
 *  project row is what the unique violation proves exists, whereas the membership row may still
 *  be moments away from being written by the racing request. */
async function findProjectByCreator(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('slug')
    .eq('created_by', userId)
    .maybeSingle()
  if (error) {
    console.error('[provisioning] created_by lookup failed:', error)
    return null
  }
  return (data?.slug as string | undefined) ?? null
}

/** The slug of a tenant this user already belongs to, or null. `error` distinguishes "definitely
 *  no tenant" from "couldn't tell" — the caller must FAIL CLOSED on the latter rather than
 *  treating an outage as permission to mint a second tenant. */
async function findExistingTenant(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
): Promise<{ slug: string | null; error: unknown }> {
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id, projects(slug)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) return { slug: null, error }
  if (!data) return { slug: null, error: null }
  const project = data.projects as unknown as { slug: string } | null
  return { slug: project?.slug ?? '', error: null }
}

/**
 * Idempotent by design — the auth callback runs on EVERY confirmation link click, and a user who
 * clicks their link twice (or whose browser prefetches it) must not end up with two tenants.
 *
 * Returns `created: false` with a null key when the user already owns a project: the plaintext of
 * their original key is unrecoverable by construction (only its hash was stored), so a repeat
 * call cannot re-show it. The onboarding page handles that null by pointing at "issue a new key"
 * rather than pretending to have one.
 */
export async function provisionTenantForUser(
  userId: string,
  email: string,
): Promise<ProvisionResult> {
  // Every caller is a Route Handler and can therefore set the one-time key cookie, so there is no
  // "provision without revealing a key" mode. An earlier version had one, for a retry path that
  // lived in a Server Component — it produced tenants with a phantom credential nobody held and
  // no starter feature. The retry moved to a Route Handler instead (app/app/provision/route.ts),
  // which deleted the special case rather than accommodating it.
  const supabase = getSupabaseServiceClient()

  // ── idempotency gate ──────────────────────────────────────────────────────────────────────
  // Keyed on MEMBERSHIP, not on `projects.created_by`: a user hand-seeded into an existing
  // project (the three pre-self-serve tenants, or any future invite path) already has somewhere
  // to work and must not be handed a second, empty tenant on their next sign-in.
  const existing = await findExistingTenant(supabase, userId)
  if (existing.error) {
    console.error('[provisioning] membership pre-check failed:', existing.error)
    // FAIL CLOSED. Continuing here would risk minting a duplicate tenant on what may simply be a
    // transient DB blip — and a spurious extra tenant is unrecoverable-by-user, whereas a failed
    // provision is retried on the user's next visit to /app.
    return { ok: false, error: 'Could not verify your account state — try signing in again.' }
  }
  if (existing.slug !== null) {
    return { ok: true, created: false, projectSlug: existing.slug, plaintextKey: null }
  }

  // ── slug selection ────────────────────────────────────────────────────────────────────────
  // The email is only a SUGGESTION; a short/punctuation-only local part, or one that collides
  // with a reserved name, falls through to a generated slug. A confirmed signup must never fail
  // because of the shape of someone's email address.
  const suggested = slugFromEmail(email)
  const base = suggested && !isForbiddenSlug(suggested) ? suggested : `tenant-${randomBytes(4).toString('hex')}`

  const plaintextKey = generateApiKey()
  let projectId: string | null = null
  let projectSlug = ''

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !projectId; attempt++) {
    // First attempt uses the clean slug; later ones disambiguate with random entropy rather than
    // an incrementing counter — a counter leaks how many tenants share a name and turns a
    // collision into a probe. normalizeSlug re-runs so the suffix can't push it out of shape.
    const candidate =
      attempt === 0 ? base : normalizeSlug(`${base}-${randomBytes(2).toString('hex')}`)
    if (!candidate || isForbiddenSlug(candidate)) continue

    // A PLAIN INSERT, never an upsert on `slug`. This is the exact bug class cross-review caught
    // in S1's seed scripts (Roadmap/LEARNINGS.md): an `onConflict: 'slug', ignoreDuplicates`
    // upsert would report success while writing nothing when the slug already belongs to SOMEONE
    // ELSE — and this function would then hand back a plaintext key for a project the caller does
    // not own. A unique-violation must be a visible collision we retry, never a silent bind.
    const { data, error } = await supabase
      .from('projects')
      .insert({
        slug: candidate,
        created_by: userId,
        // api_key_hash is the retired single-key column (nullable as of this sprint's migration).
        // A self-serve tenant's credentials live ONLY in api_keys.
        api_key_hash: null,
      })
      .select('id, slug')
      .single()

    if (!error && data) {
      projectId = data.id as string
      projectSlug = data.slug as string
      break
    }
    if (error?.code === PG_UNIQUE_VIOLATION) {
      // TWO different unique constraints can fire here and Postgres reports both as 23505, so the
      // CONSTRAINT NAME is the only thing that distinguishes them:
      //   • projects_slug_key            → the NAME is taken; retry with another.
      //   • projects_one_per_creator_idx → a concurrent callback already created this user's
      //                                    project; we lost the race. Never retry — adopt it.
      //
      // Conflating them strands the user, and doing so is subtle enough that it survived one
      // review round: an earlier version claimed in a comment to inspect the constraint but
      // actually just re-read MEMBERSHIP. The winner writes its project row and its
      // project_members row in two separate round-trips, so during that gap membership is still
      // empty — the loser would read null, conclude "slug taken", retry, hit the creator
      // constraint again, and burn every attempt before failing (cross-review, Agy 2026-07-20).
      //
      // So: resolve by `created_by`, which is the row that CAUSED the violation and is therefore
      // guaranteed to exist, rather than by membership, which may not be written yet.
      if (isCreatorConstraintViolation(error)) {
        const winner = await findProjectByCreator(supabase, userId)
        if (winner) {
          return { ok: true, created: false, projectSlug: winner, plaintextKey: null }
        }
        // Constraint fired but the row is unreadable — bail rather than loop into the same wall.
        console.error('[provisioning] creator constraint fired but no project resolved')
        return { ok: false, error: 'Could not create your project — please try again.' }
      }
      continue // the slug was taken by someone else — try another name
    }
    console.error('[provisioning] project insert failed:', error)
    return { ok: false, error: 'Could not create your project.' }
  }

  if (!projectId) {
    console.error(`[provisioning] exhausted ${MAX_SLUG_ATTEMPTS} slug attempts for base "${base}"`)
    return { ok: false, error: 'Could not create your project — please try again.' }
  }

  // ── owner membership ──────────────────────────────────────────────────────────────────────
  // OWNER, not member: this user must be able to administer their own credentials (S1 made
  // credential admin owner-only — lib/roles.ts). A self-serve tenant provisioned as `member`
  // would 404 on its own API-keys page, which is exactly the trap the S1 rollout note warns about.
  const { error: memberError } = await supabase
    .from('project_members')
    .insert({ user_id: userId, project_id: projectId, role: 'owner' })
  if (memberError) {
    console.error('[provisioning] membership insert failed:', memberError)
    // The project row exists but nobody can reach it. Roll it back rather than leaving an orphan
    // squatting on a slug forever — there is no transaction across these calls (supabase-js
    // speaks REST, not sessions), so this compensating delete is the cleanup.
    await supabase.from('projects').delete().eq('id', projectId)
    return { ok: false, error: 'Could not set up your account.' }
  }

  // ── first credential ──────────────────────────────────────────────────────────────────────
  const { error: keyError } = await supabase.from('api_keys').insert({
    project_id: projectId,
    key_hash: hashApiKey(plaintextKey),
    label: 'first key',
  })
  if (keyError) {
    console.error('[provisioning] first key insert failed:', keyError)
    // Deliberately NOT fatal, and deliberately NOT rolled back: the user has a project and an
    // owner membership, so they can mint a key themselves from /app/keys. Tearing down a working
    // tenant over a recoverable missing credential would be the worse outcome.
    await recordAudit({
      action: 'tenant_provisioned',
      projectId,
      actorUserId: userId,
      metadata: { slug: projectSlug, firstKey: false },
    })
    return { ok: true, created: true, projectSlug, plaintextKey: null }
  }

  // ── connector token (Story 2.3's "copy your MCP URL") ──────────────────────────────────────
  // Best-effort: the MCP route is independently gated by CONNECTOR_ENABLED (AGENTS rule #3), and
  // onboarding renders an honest "not ready" state when there's no token — so a failure here
  // costs a convenience, not the tenant.
  const { error: tokenError } = await supabase
    .from('connector_tokens')
    .insert({ project_id: projectId, token: generateConnectorToken() })
  if (tokenError) console.error('[provisioning] connector token insert failed:', tokenError)

  await recordAudit({
    action: 'tenant_provisioned',
    projectId,
    actorUserId: userId,
    metadata: { slug: projectSlug, firstKey: true, connectorToken: !tokenError },
  })

  return { ok: true, created: true, projectSlug, plaintextKey }
}

/** The feature key the onboarding snippet's event is tagged with. Exported so the onboarding page
 *  and this provisioner name it from ONE place — a stringly-typed drift between what we register
 *  and what the snippet fires would produce exactly the empty funnel this exists to prevent. */
export const STARTER_FEATURE_KEY = 'first_integration'
export const STARTER_TARGET_EVENT = 'integration_connected'
export const STARTER_ADOPTED_EVENT = 'first_event_sent'

/**
 * Registers a starter feature so the new tenant's funnel page has SHAPE the moment their first
 * event lands. Without it they paste the onboarding snippet, the event ingests fine, and the
 * funnel they're sent to renders nothing — a TARS funnel is computed for a REGISTERED feature and
 * they have none. "Reaches their first ingested event; the funnel page shows it" would be half
 * true, which is the kind of half-true this project's honesty rules exist to stop.
 *
 * Goes through the REAL SDK against our own public API — AGENTS rule #1: no direct write to the
 * `features` table from app code, not even from the provisioner. Same seam lib/self-track.ts uses.
 *
 * MUST be scheduled via `after()`, never inline-awaited: it is a real network round-trip (this app
 * calling its own public URL) sitting inside a login redirect, and awaiting it would hold a user
 * who just clicked their confirmation link for up to the full timeout. That is the exact
 * inline-await bug cross-review caught on the waitlist and self-visit routes (Roadmap/LEARNINGS.md).
 */
export async function registerStarterFeature(apiKey: string): Promise<void> {
  try {
    const { createGrowthEngineClient } = await import('@golden-beans/sdk')
    const { getSiteUrl } = await import('./site-url')
    const engine = createGrowthEngineClient({
      baseUrl: getSiteUrl(),
      apiKey,
      userId: 'provisioner',
      fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }),
    })
    const result = await engine.syncFeatures([
      {
        key: STARTER_FEATURE_KEY,
        enabled: true,
        targetEvent: STARTER_TARGET_EVENT,
        adoptedEvent: STARTER_ADOPTED_EVENT,
        description: 'Your first integration — registered automatically so the funnel has shape.',
      },
    ])
    if (!result.ok) console.warn('[provisioning] starter feature sync did not land:', result.error)
  } catch (err) {
    // Total by construction, like lib/self-track.ts: this runs inside a login redirect and must
    // never throw into it.
    console.warn('[provisioning] starter feature sync threw:', err)
  }
}
