import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listDestinations } from '@/lib/destinations'
import { listRecentDeliveries, listRecentAttempts, getDeliveryHealth } from '@/lib/deliveries'
import { formatUtc } from '@/lib/format-utc'
import { Col, Empty, ListCard, ListHead, Pill, Row, RowMain, Tag } from '@/design-system/primitives'
import { DestinationManager } from './destination-manager'
import { ProductShell } from '@/components/product/ProductShell'

// event-destination-router · Sprint 2, Story 2.1 — the per-project destination dashboard. OWNER-only,
// like API keys: a destination mints a signing secret and points our servers at an outbound URL, so
// it is credential-class administration. An ordinary member gets a 404 here even for a project they
// can otherwise read (requireProjectOwnership).
export const dynamic = 'force-dynamic'

export default async function DestinationsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const [destinations, deliveries, attempts, health] = await Promise.all([
    listDestinations(projectId),
    listRecentDeliveries(projectId),
    listRecentAttempts(projectId),
    getDeliveryHealth(projectId),
  ])

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'destinations'}>
      <main>
        {/* ── design-system-rails · Sprint 4, Story 4.6 — reference state `setup-destinations` ───
            The head, the answer line, the list and the create form all live in the manager now,
            because every one of them is either driven by or gated on client state. What stays here
            is the read and the ATTEMPT LOG, which is read-only and therefore server-rendered.

            ⚠️ **Two nine-column tables left the top of this page.** "Delivery health" is now the
            split bar on each row — the approved state puts it beside the destination it describes,
            rather than in a second table a reader had to join by name. The attempt log is below,
            behind a disclosure, for the reason stated there. */}
        <DestinationManager
          slug={projectSlug}
          destinations={destinations}
          deliveries={deliveries}
          health={health}
        />

        {/* ── The APPEND-ONLY attempt log ────────────────────────────────────────────────────
            Distinct from "recent deliveries" in the manager above, which is CURRENT delivery state:
            a replay resets that row's attempt count, and these rows are never rewritten. It is the
            record; that table is the state.

            Behind a disclosure for the same reason: the approved design has no attempt log, and the
            page must answer its question at 1440×960 without scrolling — but an immutable record of
            what actually happened is not something to delete to satisfy a geometry assertion. */}
        <details className="ds-disclosure">
          <summary>Attempt log — every send, including the ones a replay superseded</summary>
          <div className="ds-disclosure-body">
            <p className="ds-hint">
              Append-only. Nothing here is ever rewritten, so a replay adds an attempt rather than replacing
              one.
            </p>
            {attempts.length === 0 ? (
              <Empty
                title="Nothing has been attempted yet"
                body="An attempt is recorded the first time an enabled destination matches an incoming event — whether it arrives or not."
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
                {attempts.map((attempt) => (
                  <Row key={attempt.id}>
                    <RowMain
                      mono={false}
                      title={attempt.eventName ?? 'unnamed event'}
                      description={
                        <>
                          {attempt.destinationName ?? 'destination removed'}
                          {attempt.error === null ? '' : ` · ${attempt.error}`}
                        </>
                      }
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
          </div>
        </details>
      </main>
    </ProductShell>
  )
}
