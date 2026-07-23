-- experiment-governance-v2 · Sprint 2 — bounded, tenant-scoped analysis snapshot.
--
-- Governed analysis recomputes from canonical events. This service-role-only RPC returns one
-- coherent snapshot for the shared UI/API/MCP resolver. It deliberately exposes neither user_id,
-- metadata nor arbitrary tags: only the immutable experiment contract's bounded fields survive.

CREATE OR REPLACE FUNCTION private.experiment_safe_tags(p_tags JSONB)
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
      ('region', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'region' END),
      ('variant', CASE WHEN jsonb_typeof(p_tags) = 'object' THEN p_tags->'variant' END),
      (
        'experiment_definition_version',
        CASE WHEN jsonb_typeof(p_tags) = 'object'
          THEN p_tags->'experiment_definition_version'
        END
      )
  ) AS item(key, value)
  WHERE item.value IS NOT NULL
    AND CASE item.key
      WHEN 'variant' THEN
        jsonb_typeof(item.value) = 'string'
        AND (item.value #>> '{}') ~ '^[a-z][a-z0-9_-]{0,63}$'
      WHEN 'experiment_definition_version' THEN
        jsonb_typeof(item.value) = 'number'
        AND char_length(item.value #>> '{}') <= 7
        AND (item.value #>> '{}')::NUMERIC = trunc((item.value #>> '{}')::NUMERIC)
        AND (item.value #>> '{}')::NUMERIC BETWEEN 1 AND 1000000
      ELSE
        CASE jsonb_typeof(item.value)
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
    END
$$;
REVOKE ALL ON FUNCTION private.experiment_safe_tags(JSONB)
  FROM PUBLIC, anon, authenticated;

-- The exposure scan includes target-version events outside the observation window so the
-- evaluator can report (and exclude) out-of-window telemetry. The metric scan is bounded to the
-- immutable observation window and declared event vocabulary.
CREATE INDEX events_experiment_exposure_effective_idx
  ON events (
    project_id,
    feature_id,
    event,
    (COALESCE(occurred_at, created_at)),
    created_at
  )
  WHERE event = 'experiment_exposed';

CREATE INDEX events_experiment_metric_effective_idx
  ON events (
    project_id,
    event,
    subject_type,
    (COALESCE(occurred_at, created_at)),
    created_at,
    subject_id
  )
  WHERE subject_id IS NOT NULL;

CREATE OR REPLACE FUNCTION get_experiment_analysis_events(
  p_project_id UUID,
  p_experiment_key TEXT,
  p_definition_version INTEGER,
  p_metric_events TEXT[],
  p_analysis_start TIMESTAMPTZ,
  p_analysis_end TIMESTAMPTZ,
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
  IF p_project_id IS NULL
     OR p_experiment_key IS NULL
     OR p_experiment_key !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR p_definition_version IS NULL
     OR p_definition_version NOT BETWEEN 1 AND 1000000
     OR p_analysis_start IS NULL OR NOT isfinite(p_analysis_start)
     OR p_analysis_end IS NULL OR NOT isfinite(p_analysis_end)
     OR p_as_of IS NULL OR NOT isfinite(p_as_of)
     OR p_analysis_start >= p_analysis_end
     OR p_analysis_end > p_as_of
     OR p_as_of > statement_timestamp() THEN
    RAISE EXCEPTION 'invalid experiment analysis snapshot arguments' USING ERRCODE = '22023';
  END IF;
  IF p_metric_events IS NULL
     OR cardinality(p_metric_events) NOT BETWEEN 1 AND 11
     OR EXISTS (
       SELECT 1 FROM unnest(p_metric_events) AS event_name
       WHERE event_name IS NULL
         OR char_length(event_name) NOT BETWEEN 1 AND 128
         OR event_name <> btrim(
           event_name,
           U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
         )
         OR event_name ~ '[[:cntrl:]]'
     )
     OR (
       SELECT COUNT(DISTINCT event_name)
       FROM unnest(p_metric_events) AS event_name
     ) <> cardinality(p_metric_events) THEN
    RAISE EXCEPTION 'metric events must contain 1-11 distinct bounded values' USING ERRCODE = '22023';
  END IF;

  WITH bounded_events AS MATERIALIZED (
    SELECT
      e.id,
      e.event,
      e.feature_id,
      private.experiment_safe_tags(e.tags) AS tags,
      e.subject_type,
      e.subject_id,
      e.occurred_at,
      e.created_at
    FROM public.events e
    WHERE e.project_id = p_project_id
      AND e.created_at <= p_as_of
      AND COALESCE(e.occurred_at, e.created_at) <= p_as_of
      AND (
        (
          e.event = 'experiment_exposed'
          AND e.feature_id = p_experiment_key
          AND (
            e.tags->>'experiment_definition_version' = p_definition_version::TEXT
            OR (
              COALESCE(e.occurred_at, e.created_at) >= p_analysis_start
              AND COALESCE(e.occurred_at, e.created_at) < p_analysis_end
            )
          )
        )
        OR (
          e.event = ANY(p_metric_events)
          AND COALESCE(e.occurred_at, e.created_at) >= p_analysis_start
          AND COALESCE(e.occurred_at, e.created_at) < p_analysis_end
        )
      )
    ORDER BY COALESCE(e.occurred_at, e.created_at), e.id
    LIMIT 50001
  ),
  measured AS (
    SELECT
      COUNT(*) AS event_count,
      COUNT(DISTINCT subject_type || U&'\001F' || subject_id)
        FILTER (WHERE subject_type IS NOT NULL AND subject_id IS NOT NULL) AS subject_count,
      COALESCE(
        SUM(
          octet_length(
            jsonb_build_object(
              'id', id,
              'event', event,
              'feature_id', feature_id,
              'tags', tags,
              'subject_type', subject_type,
              'subject_id', subject_id,
              'occurred_at', occurred_at,
              'created_at', created_at
            )::TEXT
          )
        ),
        0
      ) AS item_bytes,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'event', event,
            'feature_id', feature_id,
            'tags', tags,
            'subject_type', subject_type,
            'subject_id', subject_id,
            'occurred_at', occurred_at,
            'created_at', created_at
          ) ORDER BY COALESCE(occurred_at, created_at), id
        ),
        '[]'::JSONB
      ) AS events
    FROM bounded_events
  )
  SELECT
    event_count,
    subject_count,
    item_bytes + 2 + GREATEST(event_count - 1, 0) * 2,
    events
  INTO v_event_count, v_subject_count, v_payload_bytes, v_events
  FROM measured;

  IF v_event_count > 50000 THEN
    RAISE EXCEPTION 'experiment analysis event limit exceeded (maximum 50000)'
      USING ERRCODE = '54000';
  END IF;
  IF v_subject_count > 10000 THEN
    RAISE EXCEPTION 'experiment analysis subject limit exceeded (maximum 10000)'
      USING ERRCODE = '54000';
  END IF;
  IF v_payload_bytes > 33554432 THEN
    RAISE EXCEPTION 'experiment analysis payload limit exceeded (maximum 33554432 bytes)'
      USING ERRCODE = '54000';
  END IF;

  RETURN v_events;
END;
$$;

REVOKE ALL ON FUNCTION get_experiment_analysis_events(
  UUID, TEXT, INTEGER, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_experiment_analysis_events(
  UUID, TEXT, INTEGER, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
