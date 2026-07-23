-- entity-journeys-projections · Sprint 2 — bounded cohort snapshot.
--
-- Query-time v1 deliberately recomputes from canonical events. This service-role-only RPC returns
-- one coherent, single-tenant snapshot for the shared UI/API/MCP resolver. It accepts only the
-- project id already resolved by the caller, the immutable definition's entity type/event names,
-- an exclusive cohort-entry upper bound, and a non-future as-of snapshot. Late receipts whose
-- effective fact time belongs before as-of are intentionally included: they repair the same cohort
-- on the next read.

-- Keep arbitrary event tags out of the cohort payload altogether. Only the definition contract's
-- five predicate fields survive, and only when their scalar value could legally appear in a
-- definition. Oversized/non-scalar values become absent and therefore cannot accidentally match.
CREATE OR REPLACE FUNCTION private.journey_safe_tags(p_tags JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(item.key, item.value), '{}'::JSONB)
  FROM (
    VALUES
      ('source', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'source' END),
      ('channel', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'channel' END),
      ('campaign', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'campaign' END),
      ('plan', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'plan' END),
      ('region', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'region' END)
  ) AS item(key, value)
  WHERE item.value IS NOT NULL
    AND CASE jsonb_typeof(item.value)
      WHEN 'string' THEN char_length(item.value #>> '{}') <= 64
      WHEN 'boolean' THEN true
      WHEN 'number' THEN
        CASE
          WHEN char_length(item.value #>> '{}') > 32 THEN false
          ELSE
            (item.value #>> '{}')::NUMERIC = trunc((item.value #>> '{}')::NUMERIC)
            AND abs((item.value #>> '{}')::NUMERIC) <= 1000000000000000
        END
      ELSE false
    END
$$;
REVOKE ALL ON FUNCTION private.journey_safe_tags(JSONB)
  FROM PUBLIC, anon, authenticated;

-- Supporting index for the required project/type/event/effective-time cohort scan. This ordinary
-- CREATE INDEX takes a brief SHARE lock while the additive migration runs; apply it in the normal
-- migration-before-code rollout window, never ad hoc after deployment.
CREATE INDEX events_journey_cohort_idx
  ON events (
    project_id,
    subject_type,
    event,
    (COALESCE(occurred_at, created_at)),
    created_at,
    subject_id
  )
  WHERE subject_id IS NOT NULL;

CREATE OR REPLACE FUNCTION get_journey_cohort_events(
  p_project_id UUID,
  p_subject_type TEXT,
  p_event_names TEXT[],
  p_to TIMESTAMPTZ,
  p_as_of TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_events        JSONB;
  v_event_count   BIGINT;
  v_subject_count BIGINT;
  v_payload_bytes NUMERIC;
BEGIN
  IF p_project_id IS NULL OR p_subject_type IS NULL
     OR p_to IS NULL OR NOT isfinite(p_to)
     OR p_as_of IS NULL OR NOT isfinite(p_as_of) THEN
    RAISE EXCEPTION 'project, subject type, to and as-of timestamps are required' USING ERRCODE = '22023';
  END IF;
  IF p_to > p_as_of OR p_as_of > statement_timestamp() THEN
    RAISE EXCEPTION 'to must not be after a non-future as-of timestamp' USING ERRCODE = '22023';
  END IF;
  IF p_event_names IS NULL
     OR cardinality(p_event_names) NOT BETWEEN 1 AND 20
     OR EXISTS (
       SELECT 1 FROM unnest(p_event_names) AS event_name
       WHERE event_name IS NULL OR char_length(event_name) NOT BETWEEN 1 AND 128
     )
     OR (SELECT COUNT(DISTINCT event_name) FROM unnest(p_event_names) AS event_name)
        <> cardinality(p_event_names) THEN
    RAISE EXCEPTION 'event names must contain 1-20 bounded values' USING ERRCODE = '22023';
  END IF;

  WITH bounded_events AS (
    SELECT
      e.id,
      e.event,
      private.journey_safe_tags(e.tags) AS tags,
      e.occurred_at,
      e.created_at,
      e.subject_id
    FROM public.events e
    WHERE e.project_id = p_project_id
      AND e.subject_type = p_subject_type
      AND e.subject_id IS NOT NULL
      AND e.event = ANY(p_event_names)
      AND COALESCE(e.occurred_at, e.created_at) <= p_as_of
      AND e.created_at <= p_as_of
    LIMIT 50001
  ),
  measured AS (
    SELECT
      COUNT(*) AS event_count,
      COUNT(DISTINCT subject_id) AS subject_count,
      COALESCE(
        SUM(
          octet_length(
            jsonb_build_object(
              'id', id,
              'event', event,
              'tags', tags,
              'occurred_at', occurred_at,
              'created_at', created_at,
              'subject_id', subject_id
            )::TEXT
          )
        ),
        0
      ) AS item_bytes
    FROM bounded_events
  )
  SELECT
    event_count,
    subject_count,
    item_bytes + 2 + GREATEST(event_count - 1, 0) * 2
  INTO v_event_count, v_subject_count, v_payload_bytes
  FROM measured;

  IF v_event_count > 50000 THEN
    RAISE EXCEPTION 'journey cohort event limit exceeded (maximum 50000)'
      USING ERRCODE = '54000';
  END IF;
  IF v_subject_count > 10000 THEN
    RAISE EXCEPTION 'journey cohort subject limit exceeded (maximum 10000)'
      USING ERRCODE = '54000';
  END IF;
  IF v_payload_bytes > 33554432 THEN
    RAISE EXCEPTION 'journey cohort event payload limit exceeded (maximum 33554432 bytes)'
      USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event', e.event,
        'tags', private.journey_safe_tags(e.tags),
        'occurred_at', e.occurred_at,
        'created_at', e.created_at,
        'subject_id', e.subject_id
      ) ORDER BY COALESCE(e.occurred_at, e.created_at), e.id
    ),
    '[]'::JSONB
  )
  INTO v_events
  FROM public.events e
  WHERE e.project_id = p_project_id
    AND e.subject_type = p_subject_type
    AND e.subject_id IS NOT NULL
    AND e.event = ANY(p_event_names)
    AND COALESCE(e.occurred_at, e.created_at) <= p_as_of
    AND e.created_at <= p_as_of;

  RETURN v_events;
END;
$$;

REVOKE ALL ON FUNCTION get_journey_cohort_events(UUID, TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_journey_cohort_events(UUID, TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
