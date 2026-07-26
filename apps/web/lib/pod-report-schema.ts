// pod-report · Sprint 2.5a — the pod_report push contract.
//
// Sibling of lib/roadmap-artifact-schema.ts, deliberately NOT an extension of it. The two artifact
// kinds share a rail (one table, one advisory-locked version RPC) and share nothing about their
// payloads: a roadmap is a list of rows, a Pod Report is a computed document. Folding both into one
// parser would mean a validator whose every branch asks "which kind is this?" — and a version bump
// on one kind silently loosening the other.
//
// Zero framework imports: the route parses with it, `scripts/pod-report.mjs` can be checked against
// it, and a unit test reaches every branch without a server.

/** The payload contract version. Must match POD_REPORT_SCHEMA_VERSION in scripts/pod-report.mjs. */
export const POD_REPORT_SCHEMA_VERSION = 1

/**
 * The maximum accepted payload, in bytes of its JSON encoding.
 *
 * Measured on EXACTLY the bytes the read path returns — `getLatestArtifact` hands back `payload`
 * and nothing derived, so write-accept implies read-accept by construction rather than by two
 * numbers happening to agree (Roadmap/LEARNINGS.md, the experiment-governance-v2 S3 trap: a write
 * cap counting one field while the read bound summed three made a valid write permanently
 * unreadable, in an immutable table that can never be shrunk).
 *
 * The real medusa-bonsai artifact is ~40 KB. 2 MiB is generous headroom for a decade of growth and
 * still far under the row cap the migration enforces.
 */
export const POD_REPORT_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export type PodReportPushValue = {
  generatedAt: Date
  payload: Record<string, unknown>
  source: { commit?: string; ref?: string } | null
}

export type PodReportParseResult =
  | { ok: true; value: PodReportPushValue }
  | { ok: false; error: string; issues?: string[] }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validate a pod_report push body.
 *
 * ── What is checked, and what deliberately is not ─────────────────────────────────────────────
 * Checked: the version, the timestamp, the size, and that the three sections a renderer depends on
 * are objects of the right SHAPE. Not checked: the individual metric values. The engine does not
 * recompute the tenant's numbers and must not pretend to — it stores what they pushed, versioned
 * and immutable, and the renderer treats every field as untrusted (lib/pod-report-view.ts narrows
 * every read). Validating values here would be a second, weaker copy of the computation that can
 * drift from the real one.
 *
 * The ONE structural requirement is `delivery.notInstrumented` being an array. That is not a shape
 * preference: it is this epic's central promise arriving as data. An artifact with metrics and no
 * declared gaps renders as speed-without-honesty, which Decision 4 rules out — so the rail refuses
 * it at ingest rather than leaving the renderer to notice later.
 */
export function parsePodReportPush(body: unknown): PodReportParseResult {
  if (!isObject(body)) return { ok: false, error: 'Body must be a JSON object' }

  const issues: string[] = []

  const version = body.schemaVersion
  if (version !== POD_REPORT_SCHEMA_VERSION) {
    // Distinguishable from a shape failure on purpose: a pusher running an old script needs to be
    // told to upgrade, not handed a generic 400 to guess at.
    return {
      ok: false,
      error: `Unsupported schemaVersion — this engine accepts ${POD_REPORT_SCHEMA_VERSION}, received ${JSON.stringify(version)}`,
    }
  }

  const generatedAtRaw = body.generatedAt
  const generatedAt = typeof generatedAtRaw === 'string' ? new Date(generatedAtRaw) : new Date(NaN)
  if (Number.isNaN(generatedAt.getTime())) {
    issues.push('generatedAt must be an ISO-8601 timestamp string')
  }

  const delivery = body.delivery
  if (!isObject(delivery)) {
    issues.push('delivery must be an object')
  } else if (!Array.isArray(delivery.notInstrumented)) {
    issues.push(
      'delivery.notInstrumented must be an array — an artifact that declares no gaps cannot be ' +
        'rendered honestly (epic Decision 4). An empty array is a valid claim; a missing field is not.'
    )
  }

  if (body.maturity !== undefined && !isObject(body.maturity)) {
    issues.push('maturity, when present, must be an object')
  }
  if (body.benchmarks !== undefined && !Array.isArray(body.benchmarks)) {
    issues.push('benchmarks, when present, must be an array')
  }
  if (body.caveats !== undefined && !Array.isArray(body.caveats)) {
    issues.push('caveats, when present, must be an array')
  }

  if (issues.length > 0) return { ok: false, error: 'Invalid pod_report payload', issues }

  // The stored payload is the whole document minus the transport envelope. `source` describes where
  // the push came from and is stored in its own columns, so keeping a copy inside the payload would
  // create two answers to "which commit produced this".
  const { source: _source, ...payload } = body

  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  if (bytes > POD_REPORT_MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `Payload is ${bytes} bytes, over the ${POD_REPORT_MAX_PAYLOAD_BYTES}-byte limit`,
    }
  }

  const src = isObject(body.source) ? body.source : null
  return {
    ok: true,
    value: {
      generatedAt,
      payload,
      source: src
        ? {
            ...(typeof src.commit === 'string' ? { commit: src.commit } : {}),
            ...(typeof src.ref === 'string' ? { ref: src.ref } : {}),
          }
        : null,
    },
  }
}
