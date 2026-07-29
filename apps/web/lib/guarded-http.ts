import { lookup as lookupCb } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import {
  assertDeliverableUrl,
  isLocalTestTarget,
  isPrivateOrLoopbackHost,
  localhostWebhooksAllowed,
} from './webhook-url'

// Shared outbound transport for the two closed, registered-target callers that need it:
// signed webhooks today and the defensive-simulation runner later. Target ownership, template
// selection and request caps remain the caller's policy; this module owns the properties that must
// never vary by caller: public HTTPS (apart from the exact dev/CI localhost carve-out), fail-closed
// DNS, connection-time address validation/pinning, no redirect following, a deadline, and no
// response-body/header exposure.

/** A DNS pre-check that stalls must fail closed before the request deadline is consumed. */
const RESOLVE_TIMEOUT_MS = 3_000

/** Error text may be logged by a caller, so an attacker-controlled network error stays bounded. */
const MAX_ERROR_CHARS = 500

// The caller needs only the status. Reading zero response bytes is the tightest possible body bound:
// cancel the stream immediately after headers instead of buffering a receiver-controlled body or
// waiting for an endless one. The default Node sender also drains body-forbidden statuses so their
// sockets are released without constructing an invalid Response.
const MAX_RESPONSE_BODY_BYTES = 0

export type GuardedHttpFailure =
  'invalid_target' | 'blocked_target' | 'dns_failure' | 'timeout' | 'network_error'

export type GuardedHttpResult =
  | {
      outcome: 'response'
      status: number
      latencyMs: number
    }
  | {
      outcome: 'failure'
      classification: GuardedHttpFailure
      /** Lets a caller apply its own bounded retry policy without parsing error prose. */
      retryable: boolean
      status: null
      latencyMs: number
      error: string
    }

export type GuardedHttpPost = {
  targetUrl: string
  headers: Readonly<Record<string, string>>
  body: string
  timeoutMs: number
}

type GuardedConnectionLookup = (
  hostname: string,
  options: unknown,
  callback: (err: Error | null, address?: unknown, family?: number) => void
) => void

/**
 * Dependency seams exist only so the fail-closed properties can be exercised hermetically. The
 * production call omits this argument. Even injected DNS is still classified by both guard layers;
 * there is deliberately no option to follow redirects, return a response body, allow a private
 * address or raise the response bound.
 */
type GuardedHttpDependencies = {
  fetchImpl?: typeof fetch
  resolveHost?: (hostname: string) => Promise<string[]>
  connectionLookup?: GuardedConnectionLookup
}

class GuardedTargetError extends Error {
  readonly classification: GuardedHttpFailure

  constructor(classification: GuardedHttpFailure, message: string) {
    super(message)
    this.name = 'GuardedTargetError'
    this.classification = classification
  }
}

function abortError(): Error {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}

// The connection-time guard is the airtight DNS-rebinding defence. The pre-check below can resolve
// a public address and an attacker can flip the record before connect; Node calls this lookup for
// the actual socket, where every returned address is checked and the accepted answer is handed
// straight back to the request. There is no unguarded second resolution.
function createGuardedLookup(
  dnsLookup: GuardedConnectionLookup = lookupCb as unknown as GuardedConnectionLookup
): Parameters<typeof httpsRequest>[1]['lookup'] {
  return ((
    hostname: string,
    options: unknown,
    callback: (err: Error | null, address?: unknown, family?: number) => void
  ) => {
    dnsLookup(hostname, options, (err, address, family) => {
      if (err) return callback(err, address, family)

      // This is the same narrow exception as create-time and pre-check validation. It is born off,
      // and localhostWebhooksAllowed() additionally refuses it on a Vercel production deployment.
      const loopbackOk = localhostWebhooksAllowed() && (hostname === 'localhost' || hostname === '127.0.0.1')
      const addresses = Array.isArray(address)
        ? (address as Array<{ address: string }>).map((record) => record.address)
        : [address as string]

      if (addresses.length === 0 || addresses.some((ip) => typeof ip !== 'string' || ip.length === 0)) {
        return callback(new GuardedTargetError('dns_failure', 'target DNS resolution failed'))
      }
      for (const ip of addresses) {
        if (!loopbackOk && isPrivateOrLoopbackHost(ip)) {
          return callback(
            new GuardedTargetError(
              'blocked_target',
              'blocked: target resolves to a private or loopback address'
            )
          )
        }
      }
      callback(null, address, family)
    })
  }) as unknown as Parameters<typeof httpsRequest>[1]['lookup']
}

// A minimal fetch-shaped sender keeps the already-shipped webhook injection seam intact while the
// safe public result below exposes only status/latency/classification. Node http(s) does not follow
// redirects. The explicit `redirect: manual` passed by guardedHttpPost also pins that contract for
// an injected fetch implementation.
function pinnedFetch(
  url: string,
  init: RequestInit,
  connectionLookup?: GuardedConnectionLookup
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return reject(new GuardedTargetError('invalid_target', 'invalid target URL'))
    }

    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const request = requestFn(
      parsed,
      {
        method: init.method ?? 'POST',
        headers: init.headers as Record<string, string>,
        lookup: createGuardedLookup(connectionLookup),
      },
      (response) => {
        try {
          const status = response.statusCode ?? 0
          // 204/205/304 forbid a Response body. Draining is safe here because a compliant HTTP
          // parser exposes no message body for these statuses; constructing Response(stream) would
          // throw and used to strand a claimed delivery.
          if (status === 204 || status === 205 || status === 304) {
            response.resume()
            resolve(new Response(null, { status }))
          } else {
            const webBody = Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>
            resolve(new Response(webBody, { status }))
          }
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    )

    request.on('error', reject)
    const signal = init.signal as AbortSignal | undefined
    if (signal) {
      if (signal.aborted) {
        request.destroy()
        return reject(abortError())
      }
      signal.addEventListener(
        'abort',
        () => {
          request.destroy()
          reject(abortError())
        },
        { once: true }
      )
    }
    if (typeof init.body === 'string') request.write(init.body)
    request.end()
  })
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true })
  return records.map((record) => record.address)
}

type TargetGuard =
  | { ok: true }
  | {
      ok: false
      classification: 'invalid_target' | 'blocked_target' | 'dns_failure'
      retryable: boolean
      error: string
    }

async function guardTarget(
  targetUrl: string,
  resolveHost: (hostname: string) => Promise<string[]>
): Promise<TargetGuard> {
  // Preserve the documented local receiver exactly: only raw http://localhost or 127.0.0.1, only
  // under the explicit dev/CI opt-in, and never when VERCEL_ENV=production.
  if (isLocalTestTarget(targetUrl)) return { ok: true }

  // Reuse the create-time classifier rather than letting a future caller forget the HTTPS/literal
  // layer. This adds no new webhook restriction: stored destinations already pass this exact guard.
  const urlCheck = assertDeliverableUrl(targetUrl)
  if (!urlCheck.ok) {
    const internal = urlCheck.error.includes('internal address')
    return {
      ok: false,
      classification: internal ? 'blocked_target' : 'invalid_target',
      retryable: false,
      error: internal ? 'blocked: target resolves to a private or loopback address' : 'invalid target URL',
    }
  }

  const hostname = new URL(targetUrl).hostname
  const literal = hostname.replace(/^\[|\]$/g, '')
  if (/^[0-9.]+$/.test(literal) || literal.includes(':')) {
    return isPrivateOrLoopbackHost(literal)
      ? {
          ok: false,
          classification: 'blocked_target',
          retryable: false,
          error: 'blocked: target resolves to a private or loopback address',
        }
      : { ok: true }
  }

  let addresses: string[]
  try {
    addresses = await withTimeout(resolveHost(hostname), RESOLVE_TIMEOUT_MS)
  } catch {
    return {
      ok: false,
      classification: 'dns_failure',
      retryable: true,
      error: 'target DNS resolution failed',
    }
  }

  // An empty resolver answer is not permission to fall through to an unguarded connect-time lookup.
  // Real dns.lookup({all:true}) never reports a successful empty set, but an adapter bug must fail
  // closed too.
  if (addresses.length === 0) {
    return {
      ok: false,
      classification: 'dns_failure',
      retryable: true,
      error: 'target DNS resolution failed',
    }
  }
  for (const address of addresses) {
    if (isPrivateOrLoopbackHost(address)) {
      return {
        ok: false,
        classification: 'blocked_target',
        retryable: false,
        error: 'blocked: target resolves to a private or loopback address',
      }
    }
  }
  return { ok: true }
}

/**
 * Performs one guarded POST and never throws. A response exposes only status + header latency; its
 * headers and body are discarded inside this boundary. HTTP status is not interpreted here—the
 * webhook retry policy and the later closed simulation template each own their domain meaning.
 */
export async function guardedHttpPost(input: GuardedHttpPost): Promise<GuardedHttpResult> {
  return runGuardedHttpPost(input)
}

/**
 * Test-only dependency injection. Production callers use guardedHttpPost(), whose signature makes
 * replacing the pinned sender impossible. This remains separate rather than an optional argument
 * on the reusable API so a later caller cannot casually pass global fetch and reopen DNS rebinding.
 */
export async function guardedHttpPostForTest(
  input: GuardedHttpPost,
  dependencies: GuardedHttpDependencies
): Promise<GuardedHttpResult> {
  return runGuardedHttpPost(input, dependencies)
}

async function runGuardedHttpPost(
  input: GuardedHttpPost,
  dependencies: GuardedHttpDependencies = {}
): Promise<GuardedHttpResult> {
  const target = await guardTarget(input.targetUrl, dependencies.resolveHost ?? defaultResolveHost)
  if (!target.ok) {
    return {
      outcome: 'failure',
      classification: target.classification,
      retryable: target.retryable,
      status: null,
      latencyMs: 0,
      error: target.error,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await (
      dependencies.fetchImpl ??
      ((url: string, init: RequestInit) => pinnedFetch(url, init, dependencies.connectionLookup))
    )(input.targetUrl, {
      method: 'POST',
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
      // No caller can relax this. A 3xx is returned as a status and never followed to a second host.
      redirect: 'manual',
    })
    const latencyMs = Date.now() - startedAt

    // The fixed zero-byte bound is deliberate: neither current nor planned callers need a body.
    // Cancelling here keeps an oversized/endless receiver from retaining the worker or entering a
    // durable error/audit record. Ignore cancellation errors exactly as the shipped webhook path did.
    if (MAX_RESPONSE_BODY_BYTES === 0) await response.body?.cancel().catch(() => {})

    return { outcome: 'response', status: response.status, latencyMs }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const aborted = error instanceof Error && error.name === 'AbortError'
    const guarded = error instanceof GuardedTargetError ? error : null
    const classification = aborted ? 'timeout' : (guarded?.classification ?? 'network_error')
    return {
      outcome: 'failure',
      classification,
      // Preserve the webhook contract: a connect-time refusal behaves like its previous network
      // error path (retryable), while pre-check private targets above remain permanent.
      retryable: true,
      status: null,
      latencyMs,
      error: aborted ? `timed out after ${input.timeoutMs}ms` : boundedError(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('resolve timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_CHARS)
}
