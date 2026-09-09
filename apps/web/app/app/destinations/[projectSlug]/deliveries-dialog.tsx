'use client'

// mockups-as-built · Story 2.4 — the delivery evidence for ONE destination.
//
// ── What this replaced, and why it is per-destination ─────────────────────────────────────────
// Two `<details>` disclosures used to sit at the bottom of this page: "Recent deliveries — replay
// one that never arrived" (in the manager) and "Attempt log — every send, including the ones a
// replay superseded" (on the page). Between them they hold the ONLY `replayDeliveryAction` control
// in the product, and an append-only record that is never rewritten.
//
// The approved `setup-destinations` state draws neither. Deleting them would have removed a real
// capability, and folding them into the page head's `+ New destination` dialog would have put
// delivery history behind a control that says it creates something — so Daniel's call (2026-09-09)
// was a PER-ROW action, opening this: the evidence belongs to the destination it describes, and the
// approved row already draws a wide actions column to hang it on.
//
// What that buys beyond removing a disclosure: a reader no longer joins rows to destinations by
// name. They open the destination they are asking about, and everything in here is already its own.

import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Col, Empty, ListCard, ListHead, Pill, Row, RowMain, Tag } from '@/design-system/primitives'
import type { DeliveryAttemptRow, DeliveryHistoryRow } from '@/lib/deliveries'
import { formatUtc } from '@/lib/format-utc'
import { NewThingDialog } from '@/components/product/NewThingDialog'

export type DeliveriesDialogDestination = { id: string; name: string }

export function DeliveriesDialog({
  destination,
  deliveries,
  columns,
  attempts,
}: {
  destination: DeliveriesDialogDestination
  deliveries: DeliveryHistoryRow[]
  columns: DataTableColumn<DeliveryHistoryRow>[]
  attempts: DeliveryAttemptRow[]
}) {
  // ⚠️ Scoped by ID, never by name. Two destinations may share a name once one is soft-deleted
  // (`event_destinations_project_name_live_uidx` is a PARTIAL unique index — it only covers rows
  // where `deleted_at IS NULL`), and a removed destination's name reads back null. An id cannot
  // drift; that is why `destinationId` was added to `DeliveryAttemptRow`.
  const mine = attempts.filter((attempt) => attempt.destinationId === destination.id)

  return (
    <>
      <DataTable
        caption={`Recent deliveries — ${destination.name}`}
        columns={columns}
        rows={deliveries}
        rowKey={(delivery) => delivery.id}
        filterLabel="Filter deliveries"
        empty="No deliveries yet — they appear once this destination matches an incoming event."
      />

      <p className="ds-hint">
        Append-only below. Nothing here is ever rewritten, so a replay adds an attempt rather than replacing
        one.
      </p>

      {mine.length === 0 ? (
        <Empty
          title="Nothing has been attempted yet"
          body="An attempt is recorded the first time this destination matches an incoming event — whether it arrives or not."
        />
      ) : (
        <ListCard label="Attempt log">
          <ListHead>
            <Col header>Event</Col>
            <Col header width="state">
              Outcome
            </Col>
            <Col header width="meta">
              When · latency
            </Col>
            <Col header width="act">
              <span className="ds-visually-hidden">Attempt number</span>
            </Col>
          </ListHead>
          {mine.map((attempt) => (
            <Row key={attempt.id}>
              <RowMain
                mono={false}
                title={attempt.eventName ?? 'unnamed event'}
                description={attempt.error ?? ''}
              />
              <Col width="state">
                {/* `delivered` is the only outcome that means it arrived. Everything else is a
                    failure of some kind, and the WORD says which — never the colour alone. */}
                <Pill state={attempt.outcome === 'delivered' ? 'on' : 'off'}>{attempt.outcome}</Pill>
                {attempt.httpStatus !== null && (
                  <span className="ds-state-detail">HTTP {attempt.httpStatus}</span>
                )}
              </Col>
              <Col width="meta">
                <Tag>{formatUtc(attempt.createdAt)}</Tag>
                {attempt.latencyMs !== null && <Tag>{attempt.latencyMs}ms</Tag>}
              </Col>
              <Col width="act">
                <span className="ds-note">attempt {attempt.attemptNo}</span>
              </Col>
            </Row>
          ))}
        </ListCard>
      )}
    </>
  )
}

/**
 * The history of destinations that no longer exist.
 *
 * ⚠️ **This closes a capability loss the fresh reviewer caught, and the product had already made a
 * PROMISE about it.** `listDestinations()` filters `deleted_at IS NULL`, so a removed destination
 * has no row — and once the delivery/attempt tables moved onto the rows, its history became
 * unreachable anywhere in the console. Meanwhile the remove confirmation says, in as many words,
 * *"Delivery history is kept."* It is kept in the database and it was no longer kept in the
 * product, which makes the sentence false at the moment a reader is relying on it.
 *
 * `DeliveryHistoryRow.destinationRemoved` and the `destinationName ?? 'destination removed'`
 * fallback exist precisely for this case — they were built for the page-level table this sprint
 * deleted, and they were left rendering nowhere.
 *
 * The trigger is SECONDARY and appears only when there is orphaned history to show, so the approved
 * head keeps `+ New destination` as its one primary action and the page's block structure is
 * unchanged.
 */
export function RemovedDestinationsHistory({
  deliveries,
  attempts,
  columns,
  liveDestinationIds,
}: {
  deliveries: DeliveryHistoryRow[]
  attempts: DeliveryAttemptRow[]
  columns: DataTableColumn<DeliveryHistoryRow>[]
  liveDestinationIds: ReadonlySet<string>
}) {
  const orphanedDeliveries = deliveries.filter((d) => !liveDestinationIds.has(d.destinationId))
  const orphanedAttempts = attempts.filter((a) => !liveDestinationIds.has(a.destinationId))
  if (orphanedDeliveries.length === 0 && orphanedAttempts.length === 0) return null

  return (
    <NewThingDialog
      label="Removed destinations"
      title="Removed destinations"
      lede="Endpoints that no longer exist. Their history is kept — replay is refused, because there is nothing to send to."
      variant="secondary"
    >
      <DataTable
        caption="Deliveries to removed destinations"
        columns={columns}
        rows={orphanedDeliveries}
        rowKey={(delivery) => delivery.id}
        filterLabel="Filter deliveries"
        empty="No deliveries were ever attempted to a destination that has since been removed."
      />
      {orphanedAttempts.length > 0 && (
        <ListCard label="Attempt log">
          <ListHead>
            <Col header>Event</Col>
            <Col header width="state">
              Outcome
            </Col>
            <Col header width="meta">
              When · latency
            </Col>
            <Col header width="act">
              <span className="ds-visually-hidden">Attempt number</span>
            </Col>
          </ListHead>
          {orphanedAttempts.map((attempt) => (
            <Row key={attempt.id}>
              <RowMain
                mono={false}
                title={attempt.eventName ?? 'unnamed event'}
                description={attempt.destinationName ?? 'destination removed'}
              />
              <Col width="state">
                <Pill state={attempt.outcome === 'delivered' ? 'on' : 'off'}>{attempt.outcome}</Pill>
              </Col>
              <Col width="meta">
                <Tag>{formatUtc(attempt.createdAt)}</Tag>
              </Col>
              <Col width="act">
                <span className="ds-note">attempt {attempt.attemptNo}</span>
              </Col>
            </Row>
          ))}
        </ListCard>
      )}
    </NewThingDialog>
  )
}

/** The per-row trigger. One dialog per destination, so the label names the destination. */
export function DeliveriesForDestination(props: {
  destination: DeliveriesDialogDestination
  deliveries: DeliveryHistoryRow[]
  columns: DataTableColumn<DeliveryHistoryRow>[]
  attempts: DeliveryAttemptRow[]
}) {
  return (
    <NewThingDialog
      label="Deliveries"
      title={`Deliveries — ${props.destination.name}`}
      lede="Every send this destination has settled, and the ones a replay superseded."
      variant="secondary"
      size="sm"
    >
      <DeliveriesDialog {...props} />
    </NewThingDialog>
  )
}
