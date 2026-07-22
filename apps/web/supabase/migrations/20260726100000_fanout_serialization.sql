-- event-destination-router · Sprint 2 — serialize outbox fan-out against destination DELETION.
--
-- THE RACE (cross-review, Codex round 14): ingest_event()'s fan-out reads the ENABLED destinations
-- and then inserts a delivery row per match. delete_destination() disables the destination and drains
-- its outstanding deliveries. Under READ COMMITTED a concurrent ingest can take its snapshot BEFORE
-- the delete commits (seeing the destination enabled) and land its INSERT AFTER the drain has run —
-- leaving a `pending` delivery for a deleted destination. That row is permanently unclaimable (the
-- dispatcher only claims enabled destinations, and a deleted one can never be re-enabled) AND
-- invisible (the operating view excludes deleted destinations). Not data loss — the event itself is
-- stored — but leaked queue work that nothing can ever drain or show.
--
-- THE FIX: give the two paths a shared lock to serialize on.
--   • The fan-out takes `FOR SHARE` on each destination row it is about to queue for.
--   • delete_destination takes `FOR UPDATE` on the destination row before disabling/draining.
-- FOR SHARE and FOR UPDATE conflict, so the two can no longer interleave: a fan-out that started
-- first makes the delete wait (and it then drains the just-inserted row); a delete that started first
-- makes the fan-out wait, and on release READ COMMITTED re-evaluates the WHERE against the NEW row
-- version — which now has enabled = false, so the destination is correctly excluded.
--
-- COST ON THE INGEST HOT PATH: one shared row lock per eligible destination (at most the per-project
-- cap, 20). Shared locks do not conflict with each other, so concurrent ingests never contend — only
-- an actual deletion, which is rare and operator-initiated, ever blocks.

-- Replaces the Story 1.2 body VERBATIM except for the `FOR SHARE OF d` on the fan-out SELECT. Every
-- other line — the idempotent-replay branch, the payload-fingerprint conflict detection, the
-- `IF NOT v_dedup` re-fan guard — is unchanged; see 20260722110000_delivery_outbox.sql for the full
-- rationale behind each.
CREATE OR REPLACE FUNCTION ingest_event(
  p_project_id      UUID,
  p_user_id         TEXT,
  p_event           TEXT,
  p_feature_id      TEXT,
  p_tags            JSONB,
  p_metadata        JSONB,
  p_context_version SMALLINT,
  p_actor_type      TEXT,
  p_actor_id        TEXT,
  p_subject_type    TEXT,
  p_subject_id      TEXT,
  p_correlation_id          TEXT,
  p_occurred_at             TIMESTAMPTZ,
  p_idempotency_key         TEXT,
  p_idempotency_fingerprint TEXT
)
RETURNS TABLE (event_id UUID, deduplicated BOOLEAN, queued_count INTEGER, conflict BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id     UUID;
  v_dedup        BOOLEAN := false;
  v_conflict     BOOLEAN := false;
  v_queued       INTEGER := 0;
  v_constraint   TEXT;
  v_existing_fp  TEXT;
BEGIN
  BEGIN
    INSERT INTO events (
      project_id, user_id, event, feature_id, tags, metadata,
      context_version, actor_type, actor_id, subject_type, subject_id,
      correlation_id, occurred_at, idempotency_key, idempotency_fingerprint
    ) VALUES (
      p_project_id, p_user_id, p_event, p_feature_id,
      COALESCE(p_tags, '{}'::jsonb), COALESCE(p_metadata, '{}'::jsonb),
      p_context_version, p_actor_type, p_actor_id, p_subject_type, p_subject_id,
      p_correlation_id, p_occurred_at, p_idempotency_key, p_idempotency_fingerprint
    )
    RETURNING id INTO v_event_id;

  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'events_project_idempotency_key_uidx' THEN
      RAISE;
    END IF;

    SELECT e.id, e.idempotency_fingerprint INTO v_event_id, v_existing_fp
      FROM events e
     WHERE e.project_id = p_project_id
       AND e.idempotency_key = p_idempotency_key;

    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'idempotency conflict with no matching row for project %', p_project_id
        USING ERRCODE = 'GB001';
    END IF;

    IF v_existing_fp IS NOT NULL AND p_idempotency_fingerprint IS NOT NULL
       AND v_existing_fp IS DISTINCT FROM p_idempotency_fingerprint THEN
      v_conflict := true;
    ELSE
      v_dedup := true;
    END IF;
  END;

  IF v_conflict THEN
    RETURN QUERY SELECT v_event_id, false, 0, true;
    RETURN;
  END IF;

  IF NOT v_dedup THEN
    -- `FOR SHARE OF d` is THE ONLY CHANGE from the Story 1.2 body — see the header. It is on a
    -- sub-SELECT (not the INSERT ... SELECT directly) because FOR SHARE is not allowed alongside the
    -- INSERT's target; the subquery locks the destination rows, then the outer INSERT uses them.
    INSERT INTO event_deliveries (project_id, event_id, destination_id)
    SELECT p_project_id, v_event_id, elig.id
      FROM (
        SELECT d.id
          FROM event_destinations d
         WHERE d.project_id = p_project_id
           AND d.enabled
           AND (d.event_filter IS NULL OR d.event_filter = p_event)
           FOR SHARE OF d
      ) AS elig
    ON CONFLICT ON CONSTRAINT event_deliveries_event_destination_uniq DO NOTHING;

    GET DIAGNOSTICS v_queued = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_event_id, v_dedup, v_queued, false;
END;
$$;

-- delete_destination takes the CONFLICTING lock (FOR UPDATE) on the destination row before it
-- disables and drains, so it cannot interleave with an in-flight fan-out.
CREATE OR REPLACE FUNCTION delete_destination(p_project_id UUID, p_destination_id UUID, p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id   UUID;
  v_rows INTEGER;
BEGIN
  -- Take the exclusive row lock FIRST. Any concurrent fan-out holding FOR SHARE on this row finishes
  -- (and its delivery row is therefore drained below); any fan-out that arrives later blocks here and
  -- then re-reads the row as disabled, excluding it.
  SELECT id INTO v_id
    FROM event_destinations
   WHERE id = p_destination_id
     AND project_id = p_project_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN false; -- unknown, foreign, or already-deleted
  END IF;

  UPDATE event_destinations
     SET deleted_at = p_now, enabled = false, updated_at = p_now
   WHERE id = p_destination_id
     AND project_id = p_project_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE event_deliveries
     SET status = 'dead', last_error = 'destination removed', claimed_at = NULL, updated_at = p_now
   WHERE project_id = p_project_id
     AND destination_id = p_destination_id
     AND status IN ('pending', 'failed', 'in_flight');

  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) IS
  'Soft-deletes a destination AND drains its outstanding deliveries, in ONE transaction, holding FOR UPDATE on the destination row so it cannot interleave with ingest_event()''s FOR SHARE fan-out.';

-- ── attempt-log FKs, so the operating view can EMBED destination + event names ─────────────────
-- The attempt log (20260724100000) carried only a delivery FK. Showing per-attempt history
-- (cross-review, Codex round 14) means joining destination and event names, and PostgREST can only
-- embed a relation it can see a FOREIGN KEY for. Composite (…, project_id) like every other FK here,
-- so an attempt row can never pair a destination/event from a DIFFERENT tenant — tenancy as a DB
-- fact, not just a query filter. CASCADE matches the delivery FK: offboarding erases everything.
ALTER TABLE event_delivery_attempts
  ADD CONSTRAINT event_delivery_attempts_destination_fk
    FOREIGN KEY (destination_id, project_id) REFERENCES event_destinations (id, project_id) ON DELETE CASCADE,
  ADD CONSTRAINT event_delivery_attempts_event_fk
    FOREIGN KEY (event_id, project_id) REFERENCES events (id, project_id) ON DELETE CASCADE;

-- ── replay is for TERMINAL deliveries only ────────────────────────────────────────────────────
-- Narrowed from (delivered, failed, dead) to (delivered, dead) — cross-review, Codex round 14. A
-- `failed` row is NOT finished: it is already queued for an automatic retry at its scheduled
-- next_attempt_at. Replaying it silently overrode that schedule AND reset its attempt budget, which
-- is a different operation from what the button says ("replay this delivery"). An operator who wants
-- to retry sooner can wait for the schedule; replay now means what it says — re-send something that
-- has finished (succeeded, or exhausted/dead-lettered).
-- LOCKS the destination before touching the delivery (cross-review, Codex round 15). A bare EXISTS
-- subquery does NOT lock: under READ COMMITTED a replay could evaluate it against a pre-delete
-- snapshot, block on the delivery row that delete_destination is draining, and then resurrect the
-- just-drained row as `pending` — permanently unclaimable. Taking FOR SHARE on the destination FIRST
-- makes replay and delete conflict directly, and uses the SAME destination-then-delivery lock order
-- delete_destination uses, so the two can never deadlock.
CREATE OR REPLACE FUNCTION replay_delivery(p_project_id UUID, p_delivery_id UUID, p_now TIMESTAMPTZ)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_destination_id UUID;
  v_live           UUID;
  v_event_id       UUID;
BEGIN
  -- Which destination does this delivery belong to? (Unlocked read: only used to pick the row to
  -- lock next; liveness is re-asserted under the lock below.)
  SELECT destination_id INTO v_destination_id
    FROM event_deliveries
   WHERE id = p_delivery_id AND project_id = p_project_id;
  IF v_destination_id IS NULL THEN
    RETURN NULL; -- unknown or foreign delivery
  END IF;

  -- Lock the destination and assert it is LIVE. FOR SHARE conflicts with delete_destination's
  -- FOR UPDATE, so a concurrent delete either finishes first (and this then sees deleted_at set and
  -- returns NULL) or waits for us (and then drains the row we just re-queued).
  SELECT id INTO v_live
    FROM event_destinations
   WHERE id = v_destination_id
     AND project_id = p_project_id
     AND deleted_at IS NULL
   FOR SHARE;
  IF v_live IS NULL THEN
    RETURN NULL; -- destination removed — nothing to replay to
  END IF;

  UPDATE event_deliveries d
     SET status = 'pending', attempt_count = 0, next_attempt_at = p_now,
         claimed_at = NULL, last_error = NULL, updated_at = p_now
   WHERE d.id = p_delivery_id
     AND d.project_id = p_project_id
     AND d.status IN ('delivered', 'dead')   -- TERMINAL only; `failed` is mid-retry, not finished
  RETURNING d.event_id INTO v_event_id;

  RETURN v_event_id; -- NULL when the row was not in a terminal state
END;
$$;

REVOKE ALL ON FUNCTION replay_delivery(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replay_delivery(UUID, UUID, TIMESTAMPTZ) TO service_role;
