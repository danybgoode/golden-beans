// golden-frijoles-cli · Sprint 1 — the only place this package speaks HTTP.
//
// ── One client, so one place decides what a failure MEANS ─────────────────────────────────────
// Every command returns `ApiResult`, which carries the server's own `code` (`unauthorized`,
// `not_found`, `conflict`, `invalid`, `disabled`) rather than an HTTP status. The status is an
// implementation detail of the transport; the code is the contract `lib/cli-auth.ts` publishes, and
// `exitForServerCode` is the one mapping from it to an exit code.
//
// ── A network failure is NOT a 500 and must not read like one ─────────────────────────────────
// `fetch` rejecting (DNS, a dropped connection, a timeout) produces `kind: 'network'`, separate
// from a server that answered badly. The remedy differs: one is "check your connection or the URL",
// the other is "the deployment is unwell". `gf doctor`'s whole job is telling those apart, and it
// cannot if the client has already collapsed them.
//
// ── A non-JSON body is a failure, not an empty success ────────────────────────────────────────
// A proxy's HTML error page parses as nothing; treating that as `{}` would let a command report
// success against a response it never understood (CODE-QUALITY #7).

export type ApiSuccess<T> = { kind: 'ok'; status: number; body: T }
export type ApiFailure =
  | { kind: 'error'; status: number; code: string; message: string; body: Record<string, unknown> }
  | { kind: 'network'; message: string }

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type ApiClient = {
  readonly baseUrl: string
  get<T>(path: string, query?: Record<string, string | undefined>): Promise<ApiResult<T>>
  post<T>(path: string, body: unknown): Promise<ApiResult<T>>
  del<T>(path: string, query?: Record<string, string | undefined>): Promise<ApiResult<T>>
}

/** How long any single request may take. A CLI that hangs is a CI job that hangs. */
const TIMEOUT_MS = 30_000

export function createApiClient(options: {
  baseUrl: string
  token: string
  userAgent: string
  fetchImpl?: typeof fetch
}): ApiClient {
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(
    method: string,
    path: string,
    init: { query?: Record<string, string | undefined>; body?: unknown }
  ): Promise<ApiResult<T>> {
    const url = new URL(path, `${options.baseUrl}/`)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response: Response
    try {
      response = await doFetch(url.toString(), {
        method,
        headers: {
          // The credential. Never in the URL — a URL travels through history, proxy logs and
          // screenshots, which is the argument the connector-token migration makes at length.
          authorization: `Bearer ${options.token}`,
          accept: 'application/json',
          'user-agent': options.userAgent,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      })
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `No answer from ${options.baseUrl} within ${TIMEOUT_MS / 1000}s.`
          : `Could not reach ${options.baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      return { kind: 'network', message }
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text()
    let parsed: unknown
    try {
      parsed = text === '' ? {} : JSON.parse(text)
    } catch {
      // An HTML error page from a proxy, or a 404 from a deployment that does not have these routes.
      // Reported with the STATUS in the sentence, because that is the only thing we actually learned.
      return {
        kind: 'error',
        status: response.status,
        code: 'server_error',
        message: `${options.baseUrl} answered ${response.status} with a body that is not JSON.`,
        body: {},
      }
    }

    const body = (parsed ?? {}) as Record<string, unknown>
    if (response.ok && body.ok !== false) return { kind: 'ok', status: response.status, body: body as T }

    return {
      kind: 'error',
      status: response.status,
      // The server's own vocabulary, with a status-derived fallback for a response that came from
      // somewhere else in the stack (a Vercel 502, an upstream 404) and carries no `code`.
      code: typeof body.code === 'string' ? body.code : codeFromStatus(response.status),
      message: typeof body.error === 'string' ? body.error : `Request failed with status ${response.status}.`,
      body,
    }
  }

  function codeFromStatus(status: number): string {
    if (status === 401 || status === 403) return 'unauthorized'
    if (status === 404) return 'not_found'
    if (status === 409) return 'conflict'
    if (status === 400 || status === 422) return 'invalid'
    return 'server_error'
  }

  return {
    baseUrl: options.baseUrl,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    del: (path, query) => request('DELETE', path, { query }),
  }
}
