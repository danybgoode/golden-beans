import 'server-only'
import type { ProjectSurfaceLink } from '@/lib/project-route-inventory'

/**
 * console-ia-overhaul · Sprint 1, Story 1.4 — what is inside the section you picked.
 *
 * The audit's complaint had two halves: reaching a surface, and relating the surfaces to each
 * other. The header answers the first. This answers the second — the rail is the only place in the
 * product that says "these four things are the same kind of thing", and it carries each surface's
 * own one-line inventory description so the relation is stated rather than implied by adjacency.
 *
 * ── It is a filter, not a source ──────────────────────────────────────────────────────────────
 * `lib/console-shell.ts` → `railLinksFor()` decides what belongs here, over the links
 * `getShellNav()` already resolved. No second list (D2), no second query, and no new data — which
 * is also why the two "no rail" cases are decided in the pure module and arrive here as an empty
 * array: this component renders, it does not choose.
 *
 * ── It renders NOTHING rather than an empty rail ──────────────────────────────────────────────
 * An empty container is a promise that something belongs there. On a Vercel preview that is a live
 * state and not a hypothetical: three of Ship's surfaces ride Production-only gates (epic README,
 * A2), so a preview can legitimately leave a section with nothing in it.
 */
export function ConsoleRail({ links }: { links: readonly ProjectSurfaceLink[] }) {
  if (links.length === 0) return null

  return (
    <nav className="console-rail" aria-label="Section">
      <ul>
        {links.map((link) => (
          <li key={link.routeSegment}>
            {/*
              ⚠️ ONE LINE, 36px. No description, no `GATED` badge — CONSOLE-CONTRACT.md Do-not #2.

              Story 1.4 asked for the rail to render surfaces "with their existing inventory
              descriptions", and `data-surface-status` painted a GATED chip beside each. That
              instruction is what produced the three-line cards on screen, and it was wrong: what a
              surface IS belongs on the surface, not in the navigation. A rail is for getting
              somewhere, and a description you must read to navigate is a description in the wrong
              place.

              The badge went with it. A surface only ever appears here when its gate is OPEN, so
              `GATED` was labelling the one state it could never be in.
            */}
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
