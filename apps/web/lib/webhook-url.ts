// event-destination-router · Sprint 2, Story 2.1 — the SSRF guard for a webhook target URL.
//
// Zero-import (no framework, no runtime-only deps) so it is asserted DIRECTLY in a spec, the same
// discipline as safe-redirect.ts's open-redirect guard: the guard only runs on a create/rotate the
// UI gates behind auth, so an HTTP-level spec can't reach it deterministically — and a security
// guard that isn't mutation-checkable in isolation is one a "looks right" edit can quietly weaken.
//
// target_url is owner-supplied and we make an OUTBOUND request to it, so it is an SSRF vector. Two
// layers guard it: the DB CHECK (20260723100000_destination_lifecycle.sql) enforces https-only (http
// only for localhost/127.0.0.1 test receivers) so a seed/backfill can't smuggle a cleartext target
// past the app; this function adds the check the DB CHECK can't cheaply express — a real https
// target must not point at a PRIVATE / loopback / link-local literal IP, which is how SSRF reaches
// cloud metadata (169.254.169.254) and internal services.
//
// SCOPE OF THIS FILE: it classifies a LITERAL host (or hostname) at create/rotate time. A hostname
// that RESOLVES to a private IP is caught elsewhere, by the two send-time layers in
// lib/webhook-delivery.ts: a fail-CLOSED DNS pre-check, and — the airtight one — a connection-PINNED
// sender whose custom `lookup` re-runs THIS classifier on the resolved address and pins the socket to
// it, so there is no second resolution for a DNS-rebinding attacker to flip. Redirects are never
// followed (`redirect: 'manual'`), so a 3xx cannot pivot around the pin either.

export type UrlCheck = { ok: true } | { ok: false; error: string }

const IS_LOCAL_TARGET = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/

// The http://localhost / http://127.0.0.1 test-receiver carve-out is a DEV/CI convenience, and it is
// DANGEROUS in production: on a serverless function, "localhost" is the function's own loopback
// interface, so an unconditional carve-out would let a tenant point delivery at internal services
// (cross-review, Codex round 4). So it is gated behind an explicit opt-in env, born OFF — in
// production (env unset) a localhost target is treated like any other and must be public https.
// Dev/CI set WEBHOOK_ALLOW_LOCALHOST=true to use a disposable localhost receiver. Read fresh (no
// module capture) so a spec can toggle it.
export function localhostWebhooksAllowed(): boolean {
  // BOTH conditions, and the second is not overridable by config (cross-review, Codex round 17):
  // setting the env var in production must NOT open a loopback path, because there "localhost" is the
  // serverless function's own interface. VERCEL_ENV is set by the platform and is 'production' only
  // on production deployments — it is absent locally and in CI, and 'preview' on previews.
  if (process.env.VERCEL_ENV === 'production') return false
  return process.env.WEBHOOK_ALLOW_LOCALHOST === 'true'
}

// True only when the raw URL is the localhost test target AND the opt-in above is on. Exported so the
// send-time SSRF guard (lib/webhook-delivery.ts) grants the SAME exception the create-time guard does
// — kept consistent end-to-end so the documented dev receiver can actually be delivered to.
export function isLocalTestTarget(raw: string): boolean {
  return IS_LOCAL_TARGET.test(raw) && localhostWebhooksAllowed()
}

export function assertDeliverableUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: 'Enter a valid URL.' }
  }

  // The localhost/127.0.0.1 test-receiver carve-out — ONLY when explicitly opted in (dev/CI). In
  // production (env unset) this is false, so a localhost target falls through to the https-required
  // path below and is rejected. See localhostWebhooksAllowed().
  if (isLocalTestTarget(raw)) return { ok: true }

  if (url.protocol !== 'https:') return { ok: false, error: 'Webhook URL must be https://.' }

  if (isPrivateOrLoopbackHost(url.hostname)) {
    return { ok: false, error: 'Webhook URL must be a public https endpoint, not an internal address.' }
  }
  return { ok: true }
}

export function isPrivateOrLoopbackHost(host: string): boolean {
  // new URL() keeps IPv6 hosts in brackets; strip them to compare.
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  // Loopback HOSTNAMES, not just literal 127/::1. `https://localhost` and anything under the
  // reserved `.localhost` TLD resolve to loopback but are NOT literal IPs, so the IPv4/IPv6 checks
  // below would miss them (cross-review, Codex 2026-07-21) — an https target claiming to be
  // localhost is an SSRF pivot, never a real receiver. The http://localhost TEST carve-out is
  // handled earlier in assertDeliverableUrl and never reaches here.
  if (h === 'localhost' || h.endsWith('.localhost')) return true

  // IPv4-MAPPED / -embedded IPv6, e.g. `::ffff:169.254.169.254` or `::ffff:a9fe:a9fe` (cross-review,
  // both families) — these route to an IPv4 address, so decode the embedded v4 and apply the v4
  // rules. Checked BEFORE the generic IPv6 branch so a mapped PUBLIC v4 (e.g. ::ffff:8.8.8.8) is
  // correctly allowed rather than swept up by "not global-unicast IPv6".
  const embeddedV4 = extractEmbeddedIPv4(h)
  if (embeddedV4) return isPrivateIPv4(embeddedV4)

  // Any OTHER IPv6 literal: allow ONLY global unicast (2000::/3 — first nibble 2 or 3), reject
  // everything else (cross-review, Codex round 7: "reject every address that is not global unicast").
  // That one rule subsumes loopback (::1), unspecified (::), link-local (fe80::/10), site-local
  // (fec0::/10, deprecated), unique-local (fc00::/7), multicast (ff00::/8), NAT64 (64:ff9b::/96) and
  // all reserved blocks — an allowlist is safer than chasing an ever-growing blocklist.
  //
  // …with TWO carve-outs INSIDE 2000::/3 for transition mechanisms that tunnel to an IPv4 target
  // (cross-review, Codex round 22). These look global but route to whatever v4 they encode:
  //   • 6to4, 2002::/16 — the next 32 bits ARE the IPv4 address, so 2002:7f00:0001:: is 127.0.0.1.
  //     Decode it and apply the v4 rules.
  //   • Teredo, 2001:0::/32 — encodes a v4 server and an obfuscated client address; refused outright
  //     rather than partially decoded, since it exists to traverse NATs into private networks.
  if (h.includes(':')) {
    if (!/^[23]/.test(h)) return true // outside global unicast
    const sixToFour = h.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(:|$)/)
    if (sixToFour) {
      const g1 = parseInt(sixToFour[1], 16)
      const g2 = parseInt(sixToFour[2], 16)
      return isPrivateIPv4([(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff])
    }
    if (/^2001:0{0,3}:/.test(h)) return true // Teredo 2001:0::/32
    return false
  }

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false // a hostname, not a literal IPv4 — allowed (its resolved IP is re-checked)
  return isPrivateIPv4([Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])])
}

// Pulls an IPv4 out of an IPv4-mapped/embedded IPv6 literal, in either form:
//   ::ffff:1.2.3.4  /  ::1.2.3.4        (dotted tail)
//   ::ffff:0102:0304                    (hex pair — the same 4 octets)
// Returns null when `h` is not such a literal.
function extractEmbeddedIPv4(h: string): [number, number, number, number] | null {
  if (!h.includes(':')) return null
  const dotted = h.match(/:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (dotted) return [Number(dotted[1]), Number(dotted[2]), Number(dotted[3]), Number(dotted[4])]
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const g1 = parseInt(hex[1], 16)
    const g2 = parseInt(hex[2], 16)
    return [(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff]
  }
  return null
}

// TRUE for any IPv4 that is NOT global unicast — the special-use ranges of RFC 6890 (cross-review,
// Codex round 7: "reject every address that is not global unicast"). Enumerated because the global
// space is the majority for IPv4 (an allowlist would be the whole internet minus these).
function isPrivateIPv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT (Antigravity round 5)
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true // 192.88.99.0/24 6to4 relay anycast (deprecated)
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking (Codex round 7)
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false
}
