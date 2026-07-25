import { z } from 'zod'

// pod-report · Sprint 1, Story 1.1 — the roadmap-push contract.
//
// The payload is the output of `node scripts/roadmap-to-notion.mjs --extract`, which is the epic's
// stated contract ("that JSON is the contract, version field validated on ingest"). The extract
// emits a BARE ARRAY of rows with no envelope and no version of its own, so this module defines the
// envelope the rail actually ships: a schema version, provenance, and the rows.
//
// ── Why a version the SENDER supplies rather than one we infer ────────────────────────────────
// Clients push this with their own API key from their own tooling on their own release cadence
// (the "clients push their extract" shape the epic locks in — the engine never reads anyone's git).
// So the payload's shape will drift out from under us, and an artifact stored today must still be
// interpretable in a year. An explicit, validated `schemaVersion` turns that drift into a clean 400
// at the boundary instead of a renderer crashing on a field that quietly changed meaning.
//
// No FRAMEWORK or server-only imports, on purpose (Roadmap/LEARNINGS.md — a unit-tested pure helper
// cannot share a file with a `server-only` / `next/*` import, because a plain test runner throws an
// opaque, unrelated-looking error the moment it loads the file at all). `zod` is a portable library
// and loads fine under `node --test`, which is why `roadmap-artifact-schema.test.ts` can assert this
// contract directly with no server, no Supabase and no Playwright. The Supabase read lives next
// door in `report-artifacts.ts`, which DOES import `server-only` — that split is the point.

/**
 * The only payload version this build accepts.
 *
 * Bump ONLY together with a migration of the renderer, and keep the previous version readable —
 * artifacts are immutable and old ones must keep rendering. A pushed artifact records the version
 * it was written under, so a future build can branch on it rather than guess.
 */
export const ROADMAP_SCHEMA_VERSION = 1

/** Grains the extract emits. Anything else is a generator we do not understand — reject, don't guess. */
export const ROADMAP_GRAINS = ['Epic', 'Sprint', 'Seed'] as const

// Rows are validated structurally but NOT exhaustively: `.passthrough()` keeps unknown fields.
// That is deliberate. The extract gains columns as the roadmap tooling grows, and a strict schema
// would reject a NEWER, RICHER payload from a client who upgraded before we did — turning an
// additive change into an outage. We pin the fields the hub actually renders and let the rest ride.
const roadmapRowSchema = z
  .object({
    name: z.string().min(1).max(500),
    slug: z
      .string()
      .min(1)
      .max(200)
      // Slugs address a doc and end up in a URL path segment on the drill-down view. Constrain them
      // at the boundary so a hostile or malformed slug can never become a traversal or an injection
      // further down — the same "validate at ingest, not at render" stance as lib/tenant-slug.ts.
      .regex(/^[a-z0-9][a-z0-9-]*(--s[0-9]+)?$/i, 'slug must be url-safe'),
    grain: z.enum(ROADMAP_GRAINS),
    status: z.string().min(1).max(100),
    area: z.string().min(1).max(200),
    // Everything below is genuinely optional in the real extract — a Seed has no sprint_progress,
    // an Epic has no epic_slug. `.nullish()` accepts null AND absent; the extract emits null.
    status_derived: z.string().max(100).nullish(),
    status_date: z.string().max(40).nullish(),
    priority: z.string().max(40).nullish(),
    type: z.string().max(100).nullish(),
    risk: z.string().max(40).nullish(),
    sprint_progress: z.string().max(100).nullish(),
    build_order: z.string().max(40).nullish(),
    build_order_num: z.number().int().nullish(),
    doc_link: z.string().max(500).nullish(),
    epic_slug: z.string().max(200).nullish(),
  })
  .passthrough()

export const roadmapPushSchema = z.object({
  // Rejected with a clear message when it does not match — see the refinement below.
  schemaVersion: z.number().int().positive(),
  // ISO 8601. Coerced to a Date so an unparseable string fails here rather than as a Postgres error.
  generatedAt: z.coerce.date(),
  source: z
    .object({
      // Matches the migration's CHECK so a bad SHA is a 400 at the edge, not a 500 from the database.
      commit: z
        .string()
        .regex(/^[0-9a-f]{7,40}$/i, 'commit must be a 7-40 char hex sha')
        .nullish(),
      ref: z.string().min(1).max(200).nullish(),
    })
    .nullish(),
  // The migration also rejects an empty array; asserting it here makes the failure a 400 with a
  // readable message instead of a constraint violation the caller cannot act on.
  items: z.array(roadmapRowSchema).min(1).max(5000),
})

export type RoadmapPush = z.infer<typeof roadmapPushSchema>
export type RoadmapRow = z.infer<typeof roadmapRowSchema>

/**
 * Parse a push payload, enforcing the accepted schema version.
 *
 * Version is checked SEPARATELY from shape so the caller can tell the two apart: a wrong version is
 * "your generator is newer/older than this engine" (actionable — upgrade one side), while a shape
 * failure is "your payload is malformed" (actionable — fix the generator). Collapsing both into one
 * 400 would leave a client guessing which.
 */
export function parseRoadmapPush(
  input: unknown
): { ok: true; value: RoadmapPush } | { ok: false; error: string; issues?: unknown } {
  const parsed = roadmapPushSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Malformed roadmap payload', issues: parsed.error.flatten() }
  }
  if (parsed.data.schemaVersion !== ROADMAP_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `Unsupported schemaVersion ${parsed.data.schemaVersion} — this engine accepts ` +
        `${ROADMAP_SCHEMA_VERSION}. Regenerate with a matching generator.`,
    }
  }
  return { ok: true, value: parsed.data }
}

/**
 * The hub's derived view of an artifact: counts and the epic→sprint tree, computed once.
 *
 * Lives here rather than in the page so it is unit-testable without rendering, and so the drill-down
 * (1.2) and the horizon (1.3) read the SAME derivation instead of each re-deriving "what is shipped"
 * slightly differently — the poster rule (✅ means shipped) has to mean one thing everywhere.
 */
export function summarizeRoadmap(items: RoadmapRow[]) {
  const epics = items.filter((i) => i.grain === 'Epic')
  const sprints = items.filter((i) => i.grain === 'Sprint')
  const seeds = items.filter((i) => i.grain === 'Seed')

  // Status strings come from the generator, not from us, so compare case-insensitively and treat
  // anything unrecognised as not-shipped. Over-claiming ✅ is the one failure the poster rule
  // explicitly forbids; under-claiming is merely untidy.
  const isShipped = (s: string | null | undefined) => (s ?? '').trim().toLowerCase() === 'shipped'

  return {
    counts: {
      epics: epics.length,
      sprints: sprints.length,
      seeds: seeds.length,
      shippedEpics: epics.filter((e) => isShipped(e.status)).length,
    },
    epics: [...epics]
      // build_order_num is the road's running order; a missing one sorts last rather than first, so
      // an ungroomed row never jumps the queue on the journey view.
      .sort(
        (a, b) =>
          (a.build_order_num ?? Number.MAX_SAFE_INTEGER) - (b.build_order_num ?? Number.MAX_SAFE_INTEGER)
      )
      .map((epic) => ({
        ...epic,
        shipped: isShipped(epic.status),
        sprints: sprints.filter((s) => s.epic_slug === epic.slug),
      })),
    seeds,
  }
}
