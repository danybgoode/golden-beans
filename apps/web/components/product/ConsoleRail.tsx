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
export function ConsoleRail({
  links,
  top,
  label,
  activeSegment,
}: {
  links: readonly ProjectSurfaceLink[]
  /**
   * Section-level controls that belong ABOVE the navigation — today, the environment picker.
   *
   * CONSOLE-CONTRACT.md Do-not #5: "Environment is a rail control, not chips in the page body."
   * Story 1.4 said so and it did not land, so `development / preview / production` kept rendering
   * as tags inside the flags page. A slot is the seam because the rail is shared across sections
   * and only Ship has an environment — the rail must not learn what an environment is.
   */
  top?: React.ReactNode
  /** The group label above the links. "In Ship" in the design, not a generic word. */
  label?: string
  /**
   * The route segment currently being viewed, so the rail can mark it.
   *
   * ⚠️ Without this the active-state rule in `console.css` was DEAD CSS: the rail rendered a plain
   * `<a>` with no `aria-current`, so nothing ever matched `a[aria-current='page']` and no rail item
   * was ever highlighted (cross-review, agy, PR #124). A styling rule that can never match looks
   * exactly like a rule that works until someone opens the page.
   *
   * `aria-current="page"` rather than a class, so the state a sighted reader sees and the one a
   * screen reader hears are the same attribute.
   */
  activeSegment?: string
}) {
  if (links.length === 0 && top === undefined) return null

  return (
    <nav className="console-rail" aria-label="Section">
      {top}
      {label !== undefined && <span className="rail-label">{label}</span>}
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
            <a href={link.href} aria-current={link.routeSegment === activeSegment ? 'page' : undefined}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
