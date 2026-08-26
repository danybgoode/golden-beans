'use client'
// flags-console-parity · Sprint 3, Story 3.2 — the audit table, moved and made readable.
//
// Moved from `flag-manager.tsx`, with two changes that are the point of the move rather than
// incidental to it:
//
//   1. It names the FLAG and the VERSION. The old table had columns for when / action / environment
//      / reason / actor and identified nothing — a reader could see that something was activated in
//      production at 14:03 without seeing WHAT. On one flag's own page that was implicit from
//      context; on a project-wide audit it is the first question.
//   2. The action reads as a sentence, not as a column value. `definition_created` / `activated` /
//      `deactivated` are storage words, and D7 retires them: "New version", "Turned on",
//      "Turned off". The stored values are untouched.

import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { formatUtc } from '@/lib/format-utc'
import type { FlagLifecycleAuditRow } from '@/lib/flag-registry'
import { AUDIT_ACTION_LABEL } from '../../flags/[projectSlug]/flag-vocabulary'

export function FlagAuditTable({
  entries,
  flagKeyById,
  versionNumberById,
}: {
  entries: FlagLifecycleAuditRow[]
  flagKeyById: Record<string, string>
  versionNumberById: Record<string, number>
}) {
  const columns = useMemo<DataTableColumn<FlagLifecycleAuditRow>[]>(
    () => [
      { key: 'when', header: 'When', value: (entry) => formatUtc(entry.createdAt) },
      {
        key: 'feature',
        header: 'Feature',
        // An id with no matching flag is possible in principle (a row whose registry entry this
        // view does not carry). Named rather than rendered blank: a blank cell in an audit reads as
        // "nothing happened", which is the one thing it never means.
        value: (entry) => flagKeyById[entry.flagId] ?? 'unknown feature',
        cell: (entry) => <code>{flagKeyById[entry.flagId] ?? 'unknown feature'}</code>,
      },
      {
        key: 'action',
        header: 'What changed',
        value: (entry) => AUDIT_ACTION_LABEL[entry.action] ?? entry.action,
      },
      {
        key: 'version',
        header: 'Version',
        // The version the change moved TO. For a deactivation there is none — that is the point of
        // a deactivation — so it reads as an em dash rather than as v0 or a blank.
        value: (entry) =>
          entry.newVersionId === null ? null : (versionNumberById[entry.newVersionId] ?? null),
        // Three outcomes, not two. An em dash means "no version, by design" — a deactivation. An
        // UNRESOLVED id is a different fact: the row references a version this view does not carry,
        // and collapsing it into the same dash tells an operator a version change was a deactivation
        // (cross-review, Agy, PR #121). In an audit, a wrong answer is worse than an unreadable one.
        cell: (entry) => {
          if (entry.newVersionId === null) return '—'
          const version = versionNumberById[entry.newVersionId]
          return version === undefined ? 'version not in view' : `v${version}`
        },
      },
      {
        key: 'environment',
        header: 'Environment',
        // Null for a definition change, which is genuinely environment-independent: creating a
        // version does not serve it anywhere.
        value: (entry) => entry.environment,
        cell: (entry) => entry.environment ?? 'all',
      },
      { key: 'reason', header: 'Reason', value: (entry) => entry.reason },
      {
        key: 'actor',
        header: 'Who',
        value: (entry) =>
          entry.externalActorId ? `${entry.actorUserId} via ${entry.externalActorId}` : entry.actorUserId,
        cell: (entry) => (
          <>
            <code>{entry.actorUserId}</code>
            {entry.externalActorId && (
              <>
                {' '}
                via <code>{entry.externalActorId}</code>
              </>
            )}
          </>
        ),
      },
    ],
    [flagKeyById, versionNumberById]
  )

  return (
    <DataTable
      caption="Flag audit"
      columns={columns}
      rows={entries}
      rowKey={(entry) => entry.id}
      filterLabel="Filter the audit"
      empty="Nothing has changed yet. Publishing a new version of a feature, or turning one on or off in an environment, is recorded here."
    />
  )
}
