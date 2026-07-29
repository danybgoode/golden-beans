-- flag-serving-and-prd-g · Sprint 3, Story 3.4 — immutable canonical impact evidence.
--
-- This table stores a decision snapshot, not analytical facts. Technical facts remain canonical
-- `scenario_executed` rows in events; product analysis remains the governed experiment resolver.

CREATE OR REPLACE FUNCTION private.scenario_impact_snapshot_is_valid(p_evidence JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(
    p_evidence IS NOT NULL
    AND jsonb_typeof(p_evidence) = 'object'
    AND octet_length(p_evidence::TEXT) <= 524288
    AND p_evidence->>'contractVersion' = '1'
    AND jsonb_typeof(p_evidence->'generatedAt') = 'string'
    AND (p_evidence->>'generatedAt')::TIMESTAMPTZ IS NOT NULL
    AND jsonb_typeof(p_evidence->'scenario') = 'object'
    AND jsonb_typeof(p_evidence->'flag') = 'object'
    AND jsonb_typeof(p_evidence->'experiment') = 'object'
    AND p_evidence->>'cohort' IN ('synthetic', 'internal', 'external')
    AND jsonb_typeof(p_evidence->'technical') = 'object'
    AND jsonb_typeof(p_evidence->'canonicalAnalysis') = 'object'
    AND private.experiment_analysis_snapshot_is_valid(p_evidence->'canonicalAnalysis')
    AND jsonb_typeof(p_evidence->'relatedEvidence') = 'object'
    AND jsonb_typeof(p_evidence#>'{relatedEvidence,errorSignalIds}') = 'array'
    AND jsonb_typeof(p_evidence#>'{relatedEvidence,frictionSignalIds}') = 'array'
    AND jsonb_typeof(p_evidence#>'{relatedEvidence,taskIds}') = 'array'
    AND jsonb_typeof(p_evidence->'claim') = 'object'
    AND jsonb_typeof(p_evidence#>'{claim,causal}') = 'boolean'
    AND jsonb_typeof(p_evidence#>'{claim,blockers}') = 'array',
    false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.scenario_impact_snapshot_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE scenario_impact_evidence (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL,
  scenario_id           UUID        NOT NULL,
  scenario_version_id   UUID        NOT NULL,
  scenario_version      INTEGER     NOT NULL CHECK (scenario_version > 0),
  run_id                UUID        NOT NULL,
  run_revision          BIGINT      NOT NULL CHECK (run_revision > 0),
  flag_id               UUID        NOT NULL,
  flag_version_id       UUID        NOT NULL,
  flag_definition_version INTEGER   NOT NULL CHECK (flag_definition_version > 0),
  experiment_id         UUID        NOT NULL,
  experiment_version_id UUID        NOT NULL,
  experiment_definition_version INTEGER NOT NULL CHECK (experiment_definition_version > 0),
  evidence              JSONB       NOT NULL
    CHECK (private.scenario_impact_snapshot_is_valid(evidence)),
  reason                TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  actor_user_id         UUID        NOT NULL,
  external_actor_id     TEXT        NOT NULL
    CHECK (external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$'),
  idempotency_key       UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, run_id, idempotency_key),
  UNIQUE (project_id, id)
);
CREATE INDEX scenario_impact_evidence_project_created_idx
  ON scenario_impact_evidence(project_id, created_at DESC);
ALTER TABLE scenario_impact_evidence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.forbid_scenario_impact_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    pg_trigger_depth() > 1 OR NOT EXISTS (
      SELECT 1 FROM public.projects project WHERE project.id = OLD.project_id
    )
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'scenario impact evidence is immutable' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION private.forbid_scenario_impact_evidence_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER scenario_impact_evidence_immutable_trg
  BEFORE UPDATE OR DELETE ON scenario_impact_evidence
  FOR EACH ROW EXECUTE FUNCTION private.forbid_scenario_impact_evidence_mutation();

ALTER TABLE scenario_lifecycle_audit
  DROP CONSTRAINT scenario_lifecycle_audit_action_check;
ALTER TABLE scenario_lifecycle_audit
  ADD CONSTRAINT scenario_lifecycle_audit_action_check CHECK (action IN (
    'target_registered', 'target_verified', 'target_revoked',
    'version_created', 'owner_approved',
    'run_created', 'run_started', 'run_stopped', 'run_aborted', 'run_expired',
    'execution_reserved', 'execution_settled', 'execution_lease_expired',
    'security_result_recorded', 'impact_evidence_recorded'
  ));

CREATE OR REPLACE FUNCTION private.scenario_technical_evidence(
  p_project_id UUID,
  p_scenario_key TEXT,
  p_scenario_version INTEGER,
  p_run_id UUID,
  p_as_of TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH canonical AS (
    SELECT
      event.tags->>'arm' AS arm,
      (event.tags->>'failed')::BOOLEAN AS failed,
      (event.tags->>'latency_ms')::NUMERIC AS latency_ms
    FROM public.events event
    WHERE event.project_id = p_project_id
      AND event.event = 'scenario_executed'
      AND event.feature_id = p_scenario_key
      AND event.created_at <= p_as_of
      AND event.tags->>'run_id' = p_run_id::TEXT
      AND event.tags->>'scenario_definition_version' = p_scenario_version::TEXT
      AND event.tags->>'arm' IN ('control', 'fault')
      AND jsonb_typeof(event.tags->'failed') = 'boolean'
      AND jsonb_typeof(event.tags->'latency_ms') = 'number'
      AND (event.tags->>'latency_ms')::NUMERIC BETWEEN 0 AND 300000
  ),
  arms(arm) AS (VALUES ('control'::TEXT), ('fault'::TEXT)),
  aggregate AS (
    SELECT
      arms.arm,
      COUNT(canonical.arm)::INTEGER AS attempts,
      COUNT(canonical.arm) FILTER (WHERE canonical.failed)::INTEGER AS failures,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY canonical.latency_ms)::DOUBLE PRECISION
        AS latency_p95_ms
    FROM arms
    LEFT JOIN canonical ON canonical.arm = arms.arm
    GROUP BY arms.arm
  )
  SELECT jsonb_object_agg(
    aggregate.arm,
    jsonb_build_object(
      'attempts', aggregate.attempts,
      'failures', aggregate.failures,
      'latencyP95Ms', aggregate.latency_p95_ms
    )
  )
  FROM aggregate;
$$;
REVOKE ALL ON FUNCTION private.scenario_technical_evidence(UUID,TEXT,INTEGER,UUID,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.scenario_related_evidence(
  p_project_id UUID,
  p_feature_keys TEXT[],
  p_as_of TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH matching_signals AS (
    SELECT signal.id, signal.kind, signal.last_seen_at
    FROM public.signals signal
    WHERE signal.project_id = p_project_id
      AND signal.feature_id = ANY(p_feature_keys)
      AND signal.last_seen_at <= p_as_of
    ORDER BY signal.last_seen_at DESC, signal.id
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'errorSignalIds', COALESCE((
      SELECT jsonb_agg(item.id ORDER BY item.last_seen_at DESC, item.id)
      FROM matching_signals item WHERE item.kind = 'error'
    ), '[]'::JSONB),
    'frictionSignalIds', COALESCE((
      SELECT jsonb_agg(item.id ORDER BY item.last_seen_at DESC, item.id)
      FROM matching_signals item WHERE item.kind = 'friction'
    ), '[]'::JSONB),
    'taskIds', COALESCE((
      SELECT jsonb_agg(task.id ORDER BY task.created_at DESC, task.id)
      FROM public.tasks task
      JOIN matching_signals signal ON signal.id = task.signal_id
      WHERE task.project_id = p_project_id
    ), '[]'::JSONB)
  );
$$;
REVOKE ALL ON FUNCTION private.scenario_related_evidence(UUID,TEXT[],TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION get_scenario_impact_source(
  p_key_hash TEXT,
  p_run_id UUID,
  p_as_of TIMESTAMPTZ
)
RETURNS TABLE (
  project_id UUID,
  project_slug TEXT,
  scenario_id UUID,
  scenario_version_id UUID,
  scenario_key TEXT,
  scenario_version INTEGER,
  run_revision BIGINT,
  cohort TEXT,
  flag_id UUID,
  flag_version_id UUID,
  flag_key TEXT,
  flag_definition_version INTEGER,
  experiment_id UUID,
  experiment_version_id UUID,
  experiment_key TEXT,
  experiment_definition_version INTEGER,
  technical JSONB,
  related_evidence JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_as_of IS NULL OR p_as_of > v_now THEN
    RAISE EXCEPTION 'invalid scenario impact timestamp' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    run.project_id,
    project.slug,
    run.scenario_id,
    run.scenario_version_id,
    registry.key,
    version.version,
    run.revision,
    version.definition->>'cohort',
    version.flag_id,
    version.flag_version_id,
    flag.key,
    flag_version.version,
    version.experiment_id,
    version.experiment_version_id,
    experiment.key,
    experiment_version.version,
    private.scenario_technical_evidence(
      run.project_id, registry.key, version.version, run.id, p_as_of
    ),
    private.scenario_related_evidence(
      run.project_id, ARRAY[registry.key, flag.key], p_as_of
    )
  FROM public.scenario_runs run
  JOIN public.projects project ON project.id = run.project_id
  JOIN public.scenario_definition_versions version
    ON version.project_id = run.project_id
   AND version.scenario_id = run.scenario_id
   AND version.id = run.scenario_version_id
  JOIN public.scenario_registries registry
    ON registry.project_id = version.project_id AND registry.id = version.scenario_id
  JOIN public.flag_registries flag
    ON flag.project_id = version.project_id AND flag.id = version.flag_id
  JOIN public.flag_definition_versions flag_version
    ON flag_version.project_id = version.project_id
   AND flag_version.flag_id = version.flag_id
   AND flag_version.id = version.flag_version_id
  JOIN public.experiment_registries experiment
    ON experiment.project_id = version.project_id AND experiment.id = version.experiment_id
  JOIN public.experiment_definition_versions experiment_version
    ON experiment_version.project_id = version.project_id
   AND experiment_version.experiment_id = version.experiment_id
   AND experiment_version.id = version.experiment_version_id
  WHERE run.project_id = v_key.project_id
    AND run.environment = v_key.flag_environment
    AND run.id = p_run_id
    AND version.definition->>'kind' = 'resilience'
    AND run.started_at IS NOT NULL
    AND run.started_at <= p_as_of;
END;
$$;

CREATE OR REPLACE FUNCTION record_scenario_impact_evidence(
  p_key_hash TEXT,
  p_run_id UUID,
  p_evidence JSONB,
  p_reason TEXT,
  p_external_actor_id TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (evidence_id UUID, created_at TIMESTAMPTZ, created BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_run public.scenario_runs%ROWTYPE;
  v_version public.scenario_definition_versions%ROWTYPE;
  v_scenario_key TEXT;
  v_flag_key TEXT;
  v_flag_version INTEGER;
  v_experiment_key TEXT;
  v_experiment_version INTEGER;
  v_expected_technical JSONB;
  v_expected_related JSONB;
  v_existing public.scenario_impact_evidence%ROWTYPE;
  v_inserted public.scenario_impact_evidence%ROWTYPE;
  v_generated_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
     OR p_idempotency_key IS NULL
     OR private.scenario_impact_snapshot_is_valid(p_evidence) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'invalid scenario impact command' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id
    AND run.environment = v_key.flag_environment
    AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_run.project_id
    AND version.scenario_id = v_run.scenario_id
    AND version.id = v_run.scenario_version_id;
  IF NOT FOUND OR v_version.experiment_id IS NULL OR v_version.definition->>'kind' <> 'resilience'
  THEN RETURN; END IF;

  SELECT registry.key INTO v_scenario_key
  FROM public.scenario_registries registry
  WHERE registry.project_id = v_run.project_id AND registry.id = v_run.scenario_id;
  SELECT registry.key, version.version INTO v_flag_key, v_flag_version
  FROM public.flag_registries registry
  JOIN public.flag_definition_versions version
    ON version.project_id = registry.project_id
   AND version.flag_id = registry.id
   AND version.id = v_version.flag_version_id
  WHERE registry.project_id = v_run.project_id AND registry.id = v_version.flag_id;
  SELECT registry.key, version.version INTO v_experiment_key, v_experiment_version
  FROM public.experiment_registries registry
  JOIN public.experiment_definition_versions version
    ON version.project_id = registry.project_id
   AND version.experiment_id = registry.id
   AND version.id = v_version.experiment_version_id
  WHERE registry.project_id = v_run.project_id AND registry.id = v_version.experiment_id;

  BEGIN
    v_generated_at := (p_evidence->>'generatedAt')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid scenario impact timestamp' USING ERRCODE = '22023';
  END;
  IF v_generated_at IS NULL OR v_generated_at > statement_timestamp() OR v_run.started_at IS NULL
     OR v_generated_at < v_run.started_at THEN
    RAISE EXCEPTION 'invalid scenario impact timestamp' USING ERRCODE = '22023';
  END IF;

  v_expected_technical := private.scenario_technical_evidence(
    v_run.project_id, v_scenario_key, v_version.version, v_run.id, v_generated_at
  );
  v_expected_related := private.scenario_related_evidence(
    v_run.project_id, ARRAY[v_scenario_key, v_flag_key], v_generated_at
  );
  IF p_evidence#>>'{scenario,key}' IS DISTINCT FROM v_scenario_key
     OR (p_evidence#>>'{scenario,definitionVersion}')::INTEGER IS DISTINCT FROM v_version.version
     OR (p_evidence#>>'{scenario,runId}')::UUID IS DISTINCT FROM v_run.id
     OR (p_evidence#>>'{scenario,runRevision}')::BIGINT IS DISTINCT FROM v_run.revision
     OR p_evidence#>>'{flag,key}' IS DISTINCT FROM v_flag_key
     OR (p_evidence#>>'{flag,definitionVersion}')::INTEGER IS DISTINCT FROM v_flag_version
     OR p_evidence#>>'{experiment,key}' IS DISTINCT FROM v_experiment_key
     OR (p_evidence#>>'{experiment,definitionVersion}')::INTEGER IS DISTINCT FROM v_experiment_version
     OR p_evidence->>'cohort' IS DISTINCT FROM v_version.definition->>'cohort'
     OR p_evidence->'technical'->'control' IS DISTINCT FROM v_expected_technical->'control'
     OR p_evidence->'technical'->'fault' IS DISTINCT FROM v_expected_technical->'fault'
     OR p_evidence->'relatedEvidence' IS DISTINCT FROM v_expected_related
  THEN
    RAISE EXCEPTION 'scenario impact evidence does not match canonical source'
      USING ERRCODE = '22023';
  END IF;

  SELECT evidence.* INTO v_existing
  FROM public.scenario_impact_evidence evidence
  WHERE evidence.project_id = v_run.project_id
    AND evidence.run_id = v_run.id
    AND evidence.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.evidence IS DISTINCT FROM p_evidence
       OR v_existing.reason IS DISTINCT FROM p_reason
       OR v_existing.external_actor_id IS DISTINCT FROM p_external_actor_id THEN
      RAISE EXCEPTION 'impact idempotency key was reused differently' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.created_at, false;
    RETURN;
  END IF;

  INSERT INTO public.scenario_impact_evidence(
    project_id, scenario_id, scenario_version_id, scenario_version, run_id, run_revision,
    flag_id, flag_version_id, flag_definition_version,
    experiment_id, experiment_version_id, experiment_definition_version,
    evidence, reason, actor_user_id, external_actor_id, idempotency_key
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_version.version,
    v_run.id, v_run.revision, v_version.flag_id, v_version.flag_version_id, v_flag_version,
    v_version.experiment_id, v_version.experiment_version_id, v_experiment_version,
    p_evidence, p_reason, v_key.flag_actor_user_id, p_external_actor_id, p_idempotency_key
  ) RETURNING * INTO v_inserted;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
    'impact_evidence_recorded', v_key.flag_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('evidenceId', v_inserted.id)
  );
  RETURN QUERY SELECT v_inserted.id, v_inserted.created_at, true;
END;
$$;

CREATE OR REPLACE FUNCTION get_scenario_impact_evidence(p_key_hash TEXT)
RETURNS TABLE (
  id UUID,
  run_id UUID,
  scenario_key TEXT,
  scenario_version INTEGER,
  evidence JSONB,
  reason TEXT,
  external_actor_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    item.id, item.run_id, registry.key, item.scenario_version, item.evidence,
    item.reason, item.external_actor_id, item.created_at
  FROM public.scenario_impact_evidence item
  JOIN public.scenario_registries registry
    ON registry.project_id = item.project_id AND registry.id = item.scenario_id
  JOIN public.scenario_runs run
    ON run.project_id = item.project_id AND run.id = item.run_id
  WHERE item.project_id = v_key.project_id
    AND run.environment = v_key.flag_environment
  ORDER BY item.created_at DESC, item.id
  LIMIT 100;
END;
$$;

REVOKE ALL ON TABLE scenario_impact_evidence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE scenario_impact_evidence TO service_role;
REVOKE ALL ON FUNCTION
  get_scenario_impact_source(TEXT,UUID,TIMESTAMPTZ),
  record_scenario_impact_evidence(TEXT,UUID,JSONB,TEXT,TEXT,UUID),
  get_scenario_impact_evidence(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  get_scenario_impact_source(TEXT,UUID,TIMESTAMPTZ),
  record_scenario_impact_evidence(TEXT,UUID,JSONB,TEXT,TEXT,UUID),
  get_scenario_impact_evidence(TEXT)
  TO service_role;
