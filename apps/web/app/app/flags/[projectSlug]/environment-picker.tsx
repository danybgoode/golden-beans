import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import { buildFlagListQuery, type FlagListParams } from '@/lib/flag-list-view'
import { DEFAULT_FLAG_ENVIRONMENT } from './flag-console'

/**
 * The environment control, in the RAIL — CONSOLE-CONTRACT.md Do-not #5.
 *
 * Story 1.4 said "environment is a rail control" and it did not land: `development / preview /
 * production` kept rendering as tags inside the flags page body, where they read as a filter on the
 * list rather than as the thing the whole page is about.
 *
 * ⚠️ **Sprint 3, Story 3.4 — it is ONE control now, not three stacked links.** This is Daniel's
 * first named complaint. What shipped was every environment mapped into a permanently-expanded
 * `<ul>` of lowercase links, so the rail asked you to choose from a list instead of telling you
 * where you are. A control that is always showing all its options is a filter; a control that names
 * the current state and opens on demand is a location.
 *
 * ── Why a `<details>` and not the `EnvironmentControl` primitive ─────────────────────────────────
 * Sprint 2's primitive takes an `onOpen` callback, which needs a client component. Two things forbid
 * that here:
 *
 *  1. **The environment must stay in the URL** (contract row 8; `console-ia-overhaul` Story 1.3) — a
 *     copy-pasted link opens the same environment. That means every option is a real `<a href>`,
 *     which a click handler would replace with state.
 *  2. The shell renders no client islands, which is why `ProductShell`'s project switcher is a
 *     `<details>` too. One pattern, used twice, for the same reason.
 *
 * So this borrows the primitive's LOOK — the same `ds-env` classes, the same title-case label, the
 * same dot and chevron — while staying a server component whose options are links. The design system
 * decides how it looks; the URL requirement decides what it is made of.
 */
export function EnvironmentPicker({ basePath, params }: { basePath: string; params: FlagListParams }) {
  const current = params.environment ?? DEFAULT_FLAG_ENVIRONMENT
  // Title case, because the rail says where you ARE. `production` in lower case reads like a value
  // in a config file — which is exactly what three stacked lowercase links looked like.
  const label = current.charAt(0).toUpperCase() + current.slice(1)

  return (
    <div className="envpick">
      <span className="rail-label">Environment</span>
      <details className="envpick__control">
        <summary className="ds-env">
          <span className="ds-env-dot" data-env={current} />
          <span>{label}</span>
          <svg className="envpick__chevron" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <ul className="envpick__menu">
          {FLAG_ENVIRONMENTS.map((environment) => (
            <li key={environment}>
              <a
                href={`${basePath}${buildFlagListQuery(params, { environment, page: 1 }, DEFAULT_FLAG_ENVIRONMENT)}`}
                aria-current={environment === current ? 'true' : undefined}
              >
                <span className="ds-env-dot" data-env={environment} />
                {environment.charAt(0).toUpperCase() + environment.slice(1)}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
