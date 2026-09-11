// design-system-rails · Sprint 4, Story 4.3 — the activity feed, as SENTENCES.
//
// ── Why this replaces a `DataTable` ───────────────────────────────────────────────────────────
// The approved `ship-activity` state is a timeline, and its own copy says why: *"everything anyone
// has done to a feature in this project, newest first — written as sentences, not as rows of a table
// nobody reads"*. Seven columns of `when · feature · what changed · version · environment · reason ·
// who` is a table you scan for a value you already know the name of; a sentence is what you read
// when you are asking *what happened here*, which is the question this page is opened with.
//
// Nothing about the DATA changed. Every field the table rendered is here — the version, the
// environment, the reason and the external actor included — arranged so the subject, verb and object
// are one line and the qualifiers sit under it.
//
// ── It is a SERVER component now ──────────────────────────────────────────────────────────────
// `DataTable` is a client island (its filter and sort are `useState`), so the old table shipped
// JavaScript to render a read-only list. There is no interaction left to pay for, so this ships
// none — and the words become readable by the merge gate rather than only by a signed-in browser.
//
// ⚠️ The filter box goes WITH the table, and that is a real loss, stated rather than glossed. It was
// a client-side substring match over the rendered cells. The honest replacement is a URL-backed
// filter like the feature list's, which is a story nobody has written; the audit is newest-first and
// bounded by what `getFlagRegistryView` returns, so scanning it is not the same problem as scanning
// 42 features. Named here so the next reader knows it was removed on purpose.

import { formatUtc } from '@/lib/format-utc'
import type { FlagActivationState } from '@/lib/flag-list-view'
import type { FlagLifecycleAuditRow } from '@/lib/flag-registry'
import type { AuditPage } from '@/lib/audit-page'
import { Empty } from '@/design-system/primitives'
import { AUDIT_ACTION_LABEL } from '../../flags/[projectSlug]/flag-vocabulary'

/**
 * Which of the three state colours an entry's dot takes.
 *
 * `definition_created` is neither on nor off — a new version is not a change to what anybody is
 * served — so it takes the neutral `never` mark rather than borrowing green or red for an event
 * that is neither. The WORD beside it is what carries the meaning either way; the dot is
 * reinforcement, which is the rule every state cue in this system follows.
 */
function toneOf(action: FlagLifecycleAuditRow['action']): FlagActivationState {
  if (action === 'activated') return 'on'
  if (action === 'deactivated') return 'off'
  return 'never'
}

export function FlagAuditTimeline({
  entries,
  flagKeyById,
  versionNumberById,
  actorLabels,
  page,
  hrefForPage,
}: {
  entries: FlagLifecycleAuditRow[]
  flagKeyById: Record<string, string>
  versionNumberById: Record<string, number>
  /**
   * mockups-as-built Story 3.5 — each actor's name, else their email, else their id, resolved on
   * the server by `lib/actor-names.ts`. A row whose actor is missing here renders the id: the id is
   * still the fact of who acted, and a blank in an audit reads as "nobody".
   */
  actorLabels: Record<string, string>
  /** mockups-as-built Story 3.2 — the slice on screen, and where the rest of it is. */
  page: AuditPage<FlagLifecycleAuditRow>
  hrefForPage: (page: number) => string
}) {
  if (entries.length === 0) {
    return (
      <div className="ds-listcard">
        <Empty
          title="Nothing has changed yet"
          body="Publishing a new version of a feature, or turning one on or off in an environment, is recorded here — with who did it and why."
        />
      </div>
    )
  }

  return (
    <div className="ds-listcard">
      <div className="ds-timeline">
        {entries.map((entry) => {
          // An id with no matching flag is possible in principle (a row whose registry entry this
          // view does not carry). NAMED rather than rendered blank: a blank in an audit reads as
          // "nothing happened", which is the one thing it never means.
          const key = flagKeyById[entry.flagId] ?? 'unknown feature'
          // Three outcomes, not two. No version is the honest answer for a deactivation — that is
          // what a deactivation IS. An UNRESOLVED id is a different fact: the row references a
          // version this view does not carry, and collapsing the two would tell an operator a
          // version change was a deactivation.
          const version =
            entry.newVersionId === null ? null : (versionNumberById[entry.newVersionId] ?? 'not in view')
          return (
            <div className={`ds-tl ds-tl--${toneOf(entry.action)}`} key={entry.id}>
              <span className="ds-tl-dot" aria-hidden="true" />
              <span className="ds-tl-body">
                <span className="ds-tl-title">
                  {/* The actor first, because the question is "who did this". `externalActorId` is
                      the verified caller from a scoped external control plane (Miyagi's Clerk) and
                      is rendered ALONGSIDE the Golden owner, never instead of it: "owner X via
                      Clerk user Y" is what makes a Miyagi-initiated flip attributable to a person
                      rather than to a service account. */}
                  {/* The approved state's "**Daniel** turned …". The exact id stays one hover away
                      in `title`: a name is self-chosen and two people can share one, so the fact
                      that identifies who acted is never removed — only moved out of the sentence. */}
                  <b title={entry.actorUserId}>{actorLabels[entry.actorUserId] ?? entry.actorUserId}</b>
                  {entry.externalActorId !== null && (
                    <>
                      {' via '}
                      <b>{entry.externalActorId}</b>
                    </>
                  )}
                  {/* The stored values are `definition_created` / `activated` / `deactivated`;
                      `AUDIT_ACTION_LABEL` is what a person reads, and it uses the SAME verbs the
                      controls do so an audit line can be matched to the act that produced it. */}
                  {` — ${AUDIT_ACTION_LABEL[entry.action] ?? entry.action} `}
                  <code className="ds-mono">{key}</code>
                  {/* Null for a definition change, which is genuinely environment-independent:
                      creating a version does not serve it anywhere. */}
                  {entry.environment !== null && (
                    <>
                      {' in '}
                      <b>{entry.environment}</b>
                    </>
                  )}
                  {version !== null && (
                    <>{typeof version === 'number' ? ` · v${version}` : ` · ${version}`}</>
                  )}
                </span>
                <span className="ds-tl-meta">{formatUtc(entry.createdAt)}</span>
                {entry.reason !== '' && (
                  <span className="ds-tl-reason" title={entry.reason}>
                    Reason: {entry.reason}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {/* ── mockups-as-built · Story 3.2 — the pager ─────────────────────────────────────────
          ⚠️ **INSIDE the card, which is what keeps the route's signature `head → list`.** The
          approved `ship-activity` state is two blocks and draws no pagination control at all —
          because the prototype's fixture is exactly twelve rows and fits on one page. Production
          holds 148. So the page SIZE is read off the design (twelve) and the controls are built,
          in the one place that does not add a block the design has no name for.

          Rendered only when there is more than one page: a pager on a single page is two dead
          controls and a sentence nobody needs. */}
      {page.pageCount > 1 ? (
        <nav className="ds-pager" aria-label="Activity pages">
          {/* Links, not buttons: the page is in the URL (`console-ia-overhaul` Story 1.3's rule),
              so this is navigation and a middle-click or a copied link has to work. */}
          {page.previousPage === null ? (
            <span className="ds-pager-spacer" />
          ) : (
            <a className="ds-pager-step" href={hrefForPage(page.previousPage)} rel="prev">
              ← Newer
            </a>
          )}
          <span className="ds-pager-count">
            {page.from.toLocaleString('en-US')}–{page.to.toLocaleString('en-US')} of{' '}
            {page.total.toLocaleString('en-US')} · page {page.page} of {page.pageCount}
          </span>
          {page.nextPage === null ? (
            <span className="ds-pager-spacer" />
          ) : (
            <a className="ds-pager-step" href={hrefForPage(page.nextPage)} rel="next">
              Older →
            </a>
          )}
        </nav>
      ) : null}
    </div>
  )
}
