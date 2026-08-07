import { StatCard } from '@/components/ui/StatCard'
import { FunnelBars } from '@/components/ui/FunnelBars'
import { getProjectOutcome } from '@/lib/pod-report-query'
import type { ProjectSurfaceLink } from '@/lib/project-route-inventory'
import { northStarFigure, rateFigure } from '@/lib/stat-figures'

// app-shell-and-agent-rail · Sprint 3, Stories 3.1–3.3 — the front door.
//
// /app used to be a bare <ul> of project slugs with a nested <ul> of links. It answered "which URLs
// exist", which is not a question anyone signs in with. This answers "did anything need me today".
//
// ── One outcome read, shared with the Pod Report ──────────────────────────────────────────────
// `getProjectOutcome` is the SAME function lib/pod-report-query.ts uses for a client-facing report
// (CODE-QUALITY rule 1). That matters beyond tidiness: it means the number an owner sees here and
// the number a client sees in a shared report cannot drift, and the honesty rules that read path
// already enforces — `unavailable` is not an empty list, a null value is not a zero — arrive here
// for free rather than being re-derived slightly differently.
//
// ── Nothing here is gated ─────────────────────────────────────────────────────────────────────
// D6: AGENT_RAIL_ENABLED gates the rail, not this page. With the flag off, Command Center renders
// exactly as it does with it on, minus the sidebar.
//
// ── No new dependency, and no new query ───────────────────────────────────────────────────────
// The bet's headline constraint. `apps/web/package.json` is untouched; the funnel is three divs
// over CSS that already ships.

export type CommandCenterProject = {
  id: string
  slug: string
  role: string
}

export async function CommandCenter({
  project,
  links,
}: {
  project: CommandCenterProject
  links: ProjectSurfaceLink[]
}) {
  const outcome = await getProjectOutcome(project.id, project.slug)

  // The headline feature is the first REGISTERED one, alphabetically — the same ordering
  // getProjectOutcome reads in, so "the funnel at the top" and "the first row" are the same feature
  // rather than two independently-chosen ones.
  const headline = outcome.rows[0] ?? null

  return (
    <section className="command-center" aria-label={`Command center for ${project.slug}`}>
      <header className="command-center__head">
        <h2>
          {project.slug} <small>({project.role})</small>
        </h2>
      </header>

      {outcome.unavailable ? (
        // NOT "this project has no features". A read that did not answer says so.
        <p className="note command-center__unavailable">
          Your adoption layer could not be read just now. This is a failed query, not an empty project —
          nothing below should be taken as a measurement.
        </p>
      ) : null}

      <div className="command-center__stats">
        <StatCard
          label="North Star"
          icon="star"
          {...northStarFigure(outcome.northStar)}
          provenance="lib/pod-report-query.ts"
        />
        {headline?.tars ? (
          <>
            <StatCard
              label={`Adoption · ${headline.featureKey}`}
              icon="trend-up"
              {...rateFigure(headline.adoptionRate, 'adoption')}
              href={`/app/funnel/${project.slug}/${headline.featureKey}`}
            />
            <StatCard
              label={`Retention · ${headline.featureKey}`}
              icon="clock"
              {...rateFigure(headline.retentionRate, 'retention')}
              href={`/app/impact/${project.slug}/${headline.featureKey}`}
            />
          </>
        ) : (
          <StatCard
            label="Adoption"
            icon="trend-up"
            value={null}
            caveat={
              outcome.unavailable
                ? 'The adoption layer could not be read.'
                : // `OutcomeRow.caveat` is optional on the type even though lib/pod-outcome.ts sets it
                  // on every branch today. The fallback is not decoration: StatCard's null variant
                  // now REQUIRES a non-nullable caveat (cross-review round 2, Agy on PR #73 — a
                  // `caveat: ReactNode` accepted `undefined` and rendered an empty span, which is the
                  // "unreadable looks like nothing" state this whole component exists to prevent).
                  (headline?.caveat ??
                  (headline
                    ? 'This feature has no readable funnel yet.'
                    : 'No feature is registered on this project yet, so there is no funnel to read. Register one and the numbers appear here.'))
            }
          />
        )}
      </div>

      {headline?.tars ? (
        <FunnelBars
          stages={[
            { label: 'Targeted', value: headline.tars.targeted },
            { label: 'Adopted', value: headline.tars.adopted },
            { label: 'Retained', value: headline.tars.retained },
          ]}
          caption={`${headline.featureKey} — ${headline.provenance}`}
        />
      ) : null}

      {/*
        The Medusa-truth boundary, on the front door rather than only inside a report someone would
        have to know the URL of (Story 3.1). These are things this engine deliberately does NOT
        measure, each with the reason and the guardrail — which is a better answer to "where's my
        revenue number?" than a plausible figure would be.
      */}
      <details className="command-center__gaps">
        <summary>What this project is not measuring yet ({outcome.notInstrumented.length})</summary>
        <dl>
          {outcome.notInstrumented.map((gap) => (
            <div key={gap.key}>
              <dt>{gap.label}</dt>
              <dd>
                {gap.reason} <em>{gap.guardrail}</em>
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <ul className="command-center__links">
        {links.map((link) => (
          <li key={link.routeSegment}>
            <a href={link.href}>{link.label}</a> <small>— {link.description}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
