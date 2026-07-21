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
// RESIDUAL, stated rather than glossed: a HOSTNAME that RESOLVES to a private IP via DNS is NOT
// caught here (we validate the literal host, not the resolved socket). A full fix pins the socket to
// the resolved-and-checked address; that is deliberately out of scope for a webhook an owner points
// at their OWN endpoint — the threat model here is "a public URL that redirects/resolves inward",
// mitigated by redirect:'manual' on the send (lib/webhook-delivery.ts) and this literal-IP block.

export type UrlCheck = { ok: true } | { ok: false; error: string }

const IS_LOCAL_TARGET = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/

// The http://localhost(:port) / http://127.0.0.1 test-receiver carve-out — the ONE target allowed to
// be loopback (the specs' and smoke walkthrough's disposable sink). Exported so the send-time SSRF
// guard (lib/webhook-delivery.ts) grants the SAME exception its resolver would otherwise block as a
// loopback address (cross-review, Codex round 3): without this the documented localhost receiver
// could be created but never actually delivered to.
export function isLocalTestTarget(raw: string): boolean {
  return IS_LOCAL_TARGET.test(raw)
}

export function assertDeliverableUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: 'Enter a valid URL.' }
  }

  // The localhost/127.0.0.1 test-receiver carve-out (http only) matches the DB CHECK exactly — the
  // disposable sink the specs and the smoke walkthrough POST to. Everything else must be https.
  if (IS_LOCAL_TARGET.test(raw)) return { ok: true }

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
  if (h === '::1' || h === '::') return true // IPv6 loopback / unspecified
  if (h.startsWith('fe80:')) return true // IPv6 link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true // IPv6 unique-local (fc00::/7)

  // IPv4-MAPPED / -embedded IPv6, e.g. `::ffff:169.254.169.254` or `::ffff:a9fe:a9fe` (cross-review,
  // both families 2026-07-21): these route to an IPv4 address, so `[::ffff:169.254.169.254]` would
  // otherwise sail past the dotted-quad regex below and hit cloud metadata. Extract the embedded v4
  // and apply the v4 rules.
  const embeddedV4 = extractEmbeddedIPv4(h)
  if (embeddedV4) return isPrivateIPv4(embeddedV4)

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false // a hostname, not a literal IPv4 — allowed (DNS caveat documented above)
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

function isPrivateIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  return false
}
