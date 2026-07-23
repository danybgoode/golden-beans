-- entity-journeys-projections · Sprint 3, Story 3.2 — bounded, subject-free query evidence.
--
-- Query-time projection stays the default until measured p95 exceeds 2 seconds or a journey scan
-- exceeds 1,000,000 relevant events. This table retains only the latest 100 observations for one
-- project/journey/version/query-kind series. It cannot store subject ids, tags, result payloads or
-- contact data because those columns do not exist.

CREATE TABLE journey_query_observations (
  id                   BIGINT           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id           UUID             NOT NULL,
  journey_id           UUID             NOT NULL,
  definition_version   INTEGER          NOT NULL CHECK (definition_version > 0),
  query_kind           TEXT             NOT NULL CHECK (query_kind IN ('subject', 'cohort')),
  duration_ms           DOUBLE PRECISION NOT NULL CHECK (duration_ms >= 0 AND duration_ms <= 600000),
  relevant_event_count BIGINT           NOT NULL CHECK (relevant_event_count BETWEEN 0 AND 1000000000000),
  observed_at          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT journey_query_observations_journey_fk
    FOREIGN KEY (project_id, journey_id)
    REFERENCES journey_registries(project_id, id)
    ON DELETE CASCADE,
  CONSTRAINT journey_query_observations_version_fk
    FOREIGN KEY (journey_id, definition_version)
    REFERENCES journey_definition_versions(journey_id, version)
    ON DELETE CASCADE
);

CREATE INDEX journey_query_observations_series_idx
  ON journey_query_observations(
    project_id,
    journey_id,
    definition_version,
    query_kind,
    observed_at DESC,
    id DESC
  );

ALTER TABLE journey_query_observations ENABLE ROW LEVEL SECURITY;

-- One transactional seam records the observation, prunes the series and returns the evidence.
-- The per-series advisory lock makes the 100-sample bound exact under concurrent serverless reads.
CREATE OR REPLACE FUNCTION record_journey_query_observation(
  p_project_id UUID,
  p_journey_id UUID,
  p_definition_version INTEGER,
  p_query_kind TEXT,
  p_duration_ms DOUBLE PRECISION,
  p_relevant_event_count BIGINT
)
RETURNS TABLE (
  sample_count INTEGER,
  p50_ms DOUBLE PRECISION,
  p95_ms DOUBLE PRECISION,
  max_relevant_event_count BIGINT,
  decision TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_project_id IS NULL
     OR p_journey_id IS NULL
     OR p_definition_version IS NULL
     OR p_query_kind NOT IN ('subject', 'cohort')
     OR p_duration_ms IS NULL
     OR p_duration_ms = 'NaN'::DOUBLE PRECISION
     OR p_duration_ms < 0
     OR p_duration_ms > 600000
     OR p_relevant_event_count IS NULL
     OR p_relevant_event_count < 0
     OR p_relevant_event_count > 1000000000000 THEN
    RAISE EXCEPTION 'invalid journey query observation' USING ERRCODE = '22023';
  END IF;

  -- This one predicate proves all three identities belong together. A service-role caller cannot
  -- create a plausible observation for a journey/version owned by another project.
  IF NOT EXISTS (
    SELECT 1
    FROM public.journey_definition_versions v
    WHERE v.project_id = p_project_id
      AND v.journey_id = p_journey_id
      AND v.version = p_definition_version
  ) THEN
    RAISE EXCEPTION 'unknown project journey version' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_project_id::TEXT || ':' || p_journey_id::TEXT || ':' ||
      p_definition_version::TEXT || ':' || p_query_kind,
      0
    )
  );

  INSERT INTO public.journey_query_observations (
    project_id,
    journey_id,
    definition_version,
    query_kind,
    duration_ms,
    relevant_event_count
  )
  VALUES (
    p_project_id,
    p_journey_id,
    p_definition_version,
    p_query_kind,
    p_duration_ms,
    p_relevant_event_count
  );

  DELETE FROM public.journey_query_observations o
  WHERE o.id IN (
    SELECT stale.id
    FROM public.journey_query_observations stale
    WHERE stale.project_id = p_project_id
      AND stale.journey_id = p_journey_id
      AND stale.definition_version = p_definition_version
      AND stale.query_kind = p_query_kind
    ORDER BY stale.observed_at DESC, stale.id DESC
    OFFSET 100
  );

  SELECT
    COUNT(*)::INTEGER,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY o.duration_ms)::DOUBLE PRECISION,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY o.duration_ms)::DOUBLE PRECISION,
    MAX(o.relevant_event_count)
  INTO sample_count, p50_ms, p95_ms, max_relevant_event_count
  FROM public.journey_query_observations o
  WHERE o.project_id = p_project_id
    AND o.journey_id = p_journey_id
    AND o.definition_version = p_definition_version
    AND o.query_kind = p_query_kind;

  decision := CASE
    WHEN p95_ms > 2000 OR max_relevant_event_count > 1000000
      THEN 'materialization_tripwire_reached'
    ELSE 'keep_query_time'
  END;
  RETURN NEXT;
END;
$$;

-- No direct table surface exists, including for service_role; the definer RPC is the only writer
-- and only exposes aggregates. PostgreSQL otherwise grants function EXECUTE to PUBLIC by default.
REVOKE ALL ON TABLE journey_query_observations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE journey_query_observations_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION record_journey_query_observation(
  UUID, UUID, INTEGER, TEXT, DOUBLE PRECISION, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_journey_query_observation(
  UUID, UUID, INTEGER, TEXT, DOUBLE PRECISION, BIGINT
) TO service_role;

COMMENT ON TABLE journey_query_observations IS
  'Latest 100 subject-free query-time observations per project/journey/version/query kind. No subject, tag or result columns by design.';
