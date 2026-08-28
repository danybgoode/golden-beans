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
 * Still links, still in the URL. That was Story 1.3's requirement — a chosen environment survives a
 * copy-paste into another session — and moving the control does not change it. Only Ship has an
 * environment, so this lives beside the flags page and is passed into the shared rail rather than
 * the rail learning what an environment is.
 */
export function EnvironmentPicker({ basePath, params }: { basePath: string; params: FlagListParams }) {
  return (
    <div className="envpick">
      <span className="rail-label">Environment</span>
      <ul>
        {FLAG_ENVIRONMENTS.map((environment) => (
          <li key={environment}>
            <a
              href={`${basePath}${buildFlagListQuery(params, { environment, page: 1 }, DEFAULT_FLAG_ENVIRONMENT)}`}
              aria-current={environment === params.environment ? 'true' : undefined}
            >
              <span className={`env-dot ${environment}`} />
              {environment}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
