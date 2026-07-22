import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertDeliverableUrl, isPrivateOrLoopbackHost } from '@/lib/webhook-url'

// The localhost webhook carve-out is env-gated (off in production). Set/restore around the specs
// that exercise it, so the "production rejects localhost" spec can observe the OFF behaviour.
function withLocalhostAllowed(on: boolean, body: () => void) {
  const prev = process.env.WEBHOOK_ALLOW_LOCALHOST
  if (on) process.env.WEBHOOK_ALLOW_LOCALHOST = 'true'
  else delete process.env.WEBHOOK_ALLOW_LOCALHOST
  try {
    body()
  } finally {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_LOCALHOST
    else process.env.WEBHOOK_ALLOW_LOCALHOST = prev
  }
}

// event-destination-router · Sprint 2, Story 2.1 — destination lifecycle + signed webhook.
//
// TWO LAYERS, the house discipline (see delivery-outbox.spec.ts, event-context.spec.ts):
//   • PURE — assertDeliverableUrl (the SSRF guard) is asserted directly, mutation-checkable in
//     isolation, because it runs only on an auth-gated create/rotate an HTTP spec can't reach.
//   • DB CONSTRAINTS — the tenancy + secret invariants that must hold regardless of app code are
//     pinned at the database, driven with the service-role client (mirrors api-keys.spec.ts). These
//     are the "a seed/backfill/careless writer can't smuggle it past" backstops.
//
// The AUTHENTICATED management flow (create → send-test → enable → rotate → disable through
// /app/destinations) is a real-session BROWSER smoke owed to Daniel — the same boundary
// app-auth.spec.ts draws for the key manager. The api-testable negatives (unauthed → /login) live in
// app-auth.spec.ts alongside the other /app surfaces.

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function disposableProject(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({ slug: `disp-dest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: `h-${Math.random()}` })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create disposable project: ${error?.message}`)
  return data.id as string
}

// ── the SSRF guard (pure, mutation-checked) ───────────────────────────────────────────────────
test('assertDeliverableUrl ACCEPTS a public https endpoint always, and localhost only when opted in', () => {
  expect(assertDeliverableUrl('https://receiver.example.com/hook').ok).toBe(true)
  // The localhost carve-out requires the explicit dev/CI opt-in (off in production).
  withLocalhostAllowed(true, () => {
    expect(assertDeliverableUrl('http://localhost:4000/hook').ok).toBe(true)
    expect(assertDeliverableUrl('http://127.0.0.1:4000/hook').ok).toBe(true)
  })
})

test('in PRODUCTION (opt-in unset) a localhost target is REJECTED — no loopback SSRF path', () => {
  // Cross-review (Codex round 4): on a serverless function "localhost" is the function's own
  // loopback, so the carve-out must be dev/CI-only. Unset → localhost is treated like any host and
  // must be public https.
  withLocalhostAllowed(false, () => {
    expect(assertDeliverableUrl('http://localhost:4000/hook').ok).toBe(false)
    expect(assertDeliverableUrl('http://127.0.0.1:4000/hook').ok).toBe(false)
  })
})

test('assertDeliverableUrl REJECTS cleartext http to a real host, and non-http(s) schemes', () => {
  expect(assertDeliverableUrl('http://receiver.example.com/hook').ok).toBe(false)
  expect(assertDeliverableUrl('ftp://receiver.example.com').ok).toBe(false)
  expect(assertDeliverableUrl('file:///etc/passwd').ok).toBe(false)
  expect(assertDeliverableUrl('not a url').ok).toBe(false)
})

test('assertDeliverableUrl REJECTS https to a private / loopback / metadata address (SSRF)', () => {
  // The whole reason this guard exists: an https URL whose HOST is an internal literal IP.
  for (const hostile of [
    'https://169.254.169.254/latest/meta-data/', // cloud metadata — the canonical SSRF target
    'https://10.0.0.5/hook',
    'https://192.168.1.10/hook',
    'https://172.16.5.5/hook',
    'https://127.0.0.1/hook', // loopback over https (the localhost carve-out is http-only)
    'https://[::1]/hook',
    'https://localhost/hook', // loopback HOSTNAME over https — a hostname, not a literal IP
    'https://api.localhost/hook', // the reserved .localhost TLD
    'https://[::ffff:169.254.169.254]/hook', // IPv4-mapped IPv6 → metadata (the round-2 bypass)
    'https://[::ffff:10.0.0.1]/hook', // IPv4-mapped IPv6 → private
  ]) {
    expect(assertDeliverableUrl(hostile), hostile).toEqual({
      ok: false,
      error: 'Webhook URL must be a public https endpoint, not an internal address.',
    })
  }
})

test('isPrivateOrLoopbackHost classifies literal IPs + loopback hostnames, treats real hostnames as public', () => {
  expect(isPrivateOrLoopbackHost('169.254.169.254')).toBe(true)
  expect(isPrivateOrLoopbackHost('172.15.0.1')).toBe(false) // just OUTSIDE 172.16/12 — a public range
  expect(isPrivateOrLoopbackHost('172.32.0.1')).toBe(false) // just above the /12
  expect(isPrivateOrLoopbackHost('8.8.8.8')).toBe(false)
  expect(isPrivateOrLoopbackHost('receiver.example.com')).toBe(false)
  // Loopback HOSTNAMES (cross-review, Codex 2026-07-21) — not literal IPs, but they resolve inward.
  expect(isPrivateOrLoopbackHost('localhost')).toBe(true)
  expect(isPrivateOrLoopbackHost('anything.localhost')).toBe(true)
  // A hostname that merely CONTAINS "localhost" is not the reserved TLD — must stay public.
  expect(isPrivateOrLoopbackHost('localhost.evil.com')).toBe(false)
  // IPv4-mapped IPv6 (cross-review round 2, both families) — routes to the embedded v4, so it must
  // be classified by the v4 rules, both dotted and hex forms.
  expect(isPrivateOrLoopbackHost('[::ffff:169.254.169.254]')).toBe(true)
  expect(isPrivateOrLoopbackHost('::ffff:10.0.0.1')).toBe(true)
  expect(isPrivateOrLoopbackHost('::ffff:a9fe:a9fe')).toBe(true) // hex form of 169.254.169.254
  expect(isPrivateOrLoopbackHost('::ffff:0808:0808')).toBe(false) // 8.8.8.8 mapped — public
  // IPv6: ONLY global unicast (2000::/3) is allowed — everything else is non-global (cross-review,
  // Codex rounds 5 & 7). Link-local fe80::/10, site-local fec0::/10 (deprecated), ULA, multicast all
  // rejected; a real 2xxx/3xxx public address is allowed.
  expect(isPrivateOrLoopbackHost('fe80::1')).toBe(true) // link-local
  expect(isPrivateOrLoopbackHost('feaa::1')).toBe(true) // link-local
  expect(isPrivateOrLoopbackHost('fec0::1')).toBe(true) // site-local (deprecated) — non-global
  expect(isPrivateOrLoopbackHost('fc00::1')).toBe(true) // unique-local
  expect(isPrivateOrLoopbackHost('ff02::1')).toBe(true) // multicast
  expect(isPrivateOrLoopbackHost('2606:4700:4700::1111')).toBe(false) // global unicast — allowed
  expect(isPrivateOrLoopbackHost('2001:db8::1')).toBe(false) // within 2000::/3 (doc range, not routable inward)
  // CGNAT 100.64.0.0/10 (cross-review, Antigravity round 5) — internal cloud/metadata surfaces.
  expect(isPrivateOrLoopbackHost('100.64.0.1')).toBe(true)
  expect(isPrivateOrLoopbackHost('100.127.255.255')).toBe(true)
  expect(isPrivateOrLoopbackHost('100.63.0.1')).toBe(false) // just below the /10 — public
  expect(isPrivateOrLoopbackHost('100.128.0.1')).toBe(false) // just above the /10 — public
  // Other special-use v4 the strict filter now rejects (cross-review, Codex round 7).
  expect(isPrivateOrLoopbackHost('198.18.0.1')).toBe(true) // benchmarking 198.18.0.0/15
  expect(isPrivateOrLoopbackHost('192.0.2.5')).toBe(true) // TEST-NET-1
  expect(isPrivateOrLoopbackHost('255.255.255.255')).toBe(true) // broadcast / reserved
  expect(isPrivateOrLoopbackHost('8.8.8.8')).toBe(false) // still public
})

// ── DB-enforced invariants (service-role, driven directly) ─────────────────────────────────────
test('the DB rejects a cleartext http target to a real host (app validation can be bypassed; this cannot)', async () => {
  const client = db()
  const pid = await disposableProject(client)
  try {
    const { error } = await client.from('event_destinations').insert({
      project_id: pid,
      name: 'cleartext',
      target_url: 'http://evil.example.com/hook', // not localhost → must violate the CHECK
      signing_secret: 'whsec_0123456789abcdef',
      secret_set_at: new Date().toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('target_url_shape')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('the DB requires signing_secret and secret_set_at to travel together', async () => {
  const client = db()
  const pid = await disposableProject(client)
  try {
    // secret without a timestamp → the paired CHECK fires.
    const { error } = await client.from('event_destinations').insert({
      project_id: pid,
      name: 'unpaired',
      target_url: 'https://ok.example.com/hook',
      signing_secret: 'whsec_0123456789abcdef',
      secret_set_at: null,
    })
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('secret_paired')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('the DB enforces a signing_secret length floor (a too-short secret is refused)', async () => {
  const client = db()
  const pid = await disposableProject(client)
  try {
    const { error } = await client.from('event_destinations').insert({
      project_id: pid,
      name: 'shortsecret',
      target_url: 'https://ok.example.com/hook',
      signing_secret: 'tooshort', // < 16 chars
      secret_set_at: new Date().toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('signing_secret_shape')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

// ── Story 3.3: the operating view leaks nothing ───────────────────────────────────────────────
test('delivery_health() reports counts but NEVER a signing secret or target URL', async () => {
  // The acceptance is "view shows … without secret/PII". Asserted as a PROPERTY of the RPC's actual
  // output — a future edit that adds `d.signing_secret` to the SELECT for convenience turns this red.
  const client = db()
  const pid = await disposableProject(client)
  try {
    const { error: destErr } = await client.from('event_destinations').insert({
      project_id: pid,
      name: 'health-dest',
      enabled: true,
      target_url: 'https://receiver.example.test/hook',
      signing_secret: 'whsec_health_spec_secret_0123456789',
      secret_set_at: new Date().toISOString(),
    })
    expect(destErr).toBeNull()

    const { data, error } = await client.rpc('delivery_health', { p_project_id: pid })
    expect(error).toBeNull()
    expect(data).toHaveLength(1) // a destination with ZERO deliveries still appears (LEFT JOIN)

    const row = data![0] as Record<string, unknown>
    expect(row.name).toBe('health-dest')
    expect(row.enabled).toBe(true)
    expect(Number(row.delivered)).toBe(0)
    // The whole point: no credential, no target, anywhere in the payload.
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain('whsec_')
    expect(serialized).not.toContain('receiver.example.test')
    expect(Object.keys(row)).not.toContain('signing_secret')
    expect(Object.keys(row)).not.toContain('target_url')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('delivery_health() is scoped to ONE project — another tenant\'s destinations never appear', async () => {
  const client = db()
  const p1 = await disposableProject(client)
  const p2 = await disposableProject(client)
  try {
    await client.from('event_destinations').insert({ project_id: p2, name: 'other-tenant-dest' })
    const { data } = await client.rpc('delivery_health', { p_project_id: p1 })
    expect(data).toHaveLength(0) // p1 has none; p2's must not leak in
  } finally {
    await client.from('projects').delete().in('id', [p1, p2])
  }
})

test('every delivery RPC is service-role-only — the REVOKEs have teeth', async () => {
  // Cross-review (Codex round 19): DROPping and re-CREATEing a function silently restores Postgres'
  // PUBLIC-by-default EXECUTE, and a later GRANT to service_role does NOT remove it. Assert the
  // PROPERTY (an anon caller is refused) for every RPC this epic added, so a future re-create that
  // forgets its REVOKE turns this red. Same discipline as the ingest_event spec in delivery-outbox.
  const url = process.env.SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  test.skip(!url || !anon, 'anon key not in env')
  const anonClient = createClient(url!, anon!, { auth: { persistSession: false } })

  const zero = '00000000-0000-0000-0000-000000000000'
  const calls: [string, Record<string, unknown>][] = [
    ['claim_deliveries', { p_project_id: zero, p_limit: 1, p_now: new Date().toISOString(), p_stale_after_ms: 1000 }],
    ['projects_with_due_work', { p_now: new Date().toISOString(), p_limit: 1, p_stale_after_ms: 1000 }],
    ['delivery_health', { p_project_id: zero }],
    ['delete_destination', { p_project_id: zero, p_destination_id: zero, p_now: new Date().toISOString() }],
    ['replay_delivery', { p_project_id: zero, p_delivery_id: zero, p_now: new Date().toISOString() }],
    ['release_deliveries', { p_project_id: zero, p_delivery_ids: [zero], p_claim_token: new Date().toISOString(), p_now: new Date().toISOString() }],
    ['settle_delivery', {
      p_delivery_id: zero, p_project_id: zero, p_claim_token: new Date().toISOString(), p_status: 'dead',
      p_next_attempt_at: null, p_last_error: null, p_attempt_count: 1, p_now: new Date().toISOString(),
      p_log: false, p_destination_id: zero, p_event_id: zero, p_outcome: 'skipped', p_http_status: null, p_latency_ms: null,
    }],
  ]

  for (const [fn, args] of calls) {
    const { error } = await anonClient.rpc(fn, args)
    expect(error, `${fn} must refuse an anon caller`).not.toBeNull()
    const code = error?.code ?? ''
    const message = (error?.message ?? '').toLowerCase()
    // A FUNCTION-level denial specifically — 42501 mentioning "function", or PostgREST hiding a
    // function the role cannot call. Never an RLS failure, which would mean EXECUTE leaked and the
    // body actually ran.
    const functionLevelDenial =
      (code === '42501' && message.includes('function')) ||
      code === 'PGRST202' ||
      message.includes('could not find the function')
    expect(functionLevelDenial, `${fn}: expected a function-level denial, got ${code} ${message}`).toBe(true)
    expect(message).not.toContain('row-level security')
  }
})

test('the per-project destination CAP is enforced in-transaction (write-amplification guard)', async () => {
  // Cross-review (Codex round 10): every enabled destination multiplies each ingested event into
  // another outbox row, so the count must be bounded. Enforced by trigger (not a Node count, which
  // would be check-then-act). Fill to the cap, then assert the next insert is refused.
  const client = db()
  const pid = await disposableProject(client)
  try {
    const rows = Array.from({ length: 20 }, (_, i) => ({ project_id: pid, name: `cap-${i}` }))
    const { error: fillErr } = await client.from('event_destinations').insert(rows)
    expect(fillErr).toBeNull()

    const { error } = await client.from('event_destinations').insert({ project_id: pid, name: 'one-too-many' })
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('destination cap reached')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('a soft-deleted destination frees a cap slot and releases its name — the cap is survivable', async () => {
  // Cross-review (Codex round 11): a cap with no removal path is a permanent dead end. Soft delete
  // (deleted_at + enabled=false) frees the slot AND the name, while retaining history.
  const client = db()
  const pid = await disposableProject(client)
  try {
    const rows = Array.from({ length: 20 }, (_, i) => ({ project_id: pid, name: `slot-${i}` }))
    expect((await client.from('event_destinations').insert(rows)).error).toBeNull()
    // At the cap.
    expect((await client.from('event_destinations').insert({ project_id: pid, name: 'blocked' })).error).not.toBeNull()

    // Soft-delete one — the slot AND the name free up.
    const { error: delErr } = await client
      .from('event_destinations')
      .update({ deleted_at: new Date().toISOString(), enabled: false })
      .eq('project_id', pid)
      .eq('name', 'slot-0')
    expect(delErr).toBeNull()

    // A new destination now fits, and can even REUSE the deleted name (live-only uniqueness).
    expect((await client.from('event_destinations').insert({ project_id: pid, name: 'slot-0' })).error).toBeNull()
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('a soft-deleted destination can never be ENABLED (the DB forbids the state)', async () => {
  const client = db()
  const pid = await disposableProject(client)
  try {
    const { data } = await client
      .from('event_destinations')
      .insert({
        project_id: pid,
        name: 'gone',
        deleted_at: new Date().toISOString(),
        target_url: 'https://receiver.example.test/hook',
        signing_secret: 'whsec_deleted_spec_0123456789',
        secret_set_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    const { error } = await client.from('event_destinations').update({ enabled: true }).eq('id', data!.id)
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('deleted_not_enabled')
  } finally {
    await client.from('projects').delete().eq('id', pid)
  }
})

test('destination names are unique WITHIN a project but may repeat ACROSS projects', async () => {
  const client = db()
  const p1 = await disposableProject(client)
  const p2 = await disposableProject(client)
  try {
    const ins = (pid: string) =>
      client.from('event_destinations').insert({ project_id: pid, name: 'crm-webhook' })

    expect((await ins(p1)).error).toBeNull()
    // Same name, same project → conflict (project-scoped uniqueness, never global — a global unique
    // would leak another tenant's destination existence through the conflict).
    const dupe = await ins(p1)
    expect(dupe.error).not.toBeNull()
    expect(dupe.error!.code).toBe('23505')
    // Same name, DIFFERENT project → fine.
    expect((await ins(p2)).error).toBeNull()
  } finally {
    await client.from('projects').delete().in('id', [p1, p2])
  }
})
