-- experiment-governance-v2 · Sprint 1 — immutable per-project definitions and lifecycle.
-- EXPAND-only; application surfaces remain dark behind EXPERIMENT_GOVERNANCE_ENABLED.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.experiment_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_variant JSONB;
  v_metric JSONB;
  v_tag RECORD;
  v_segment JSONB;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF octet_length(p_definition::TEXT) > 32768 THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition) AS k
    WHERE k NOT IN (
      'hypothesis', 'assignmentEntityType', 'eligibility', 'variants', 'controlVariantKey',
      'primaryMetric', 'guardrailMetrics', 'segmentFields', 'plannedWindow',
      'minimumSamplePerVariant'
    )
  ) THEN RETURN false; END IF;
  IF NOT (p_definition ?& ARRAY[
    'hypothesis', 'assignmentEntityType', 'eligibility', 'variants', 'controlVariantKey',
    'primaryMetric', 'guardrailMetrics', 'segmentFields', 'plannedWindow',
    'minimumSamplePerVariant'
  ]) THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'hypothesis') IS DISTINCT FROM 'string'
     OR char_length(p_definition->>'hypothesis') NOT BETWEEN 1 AND 500
     OR btrim(p_definition->>'hypothesis') = '' THEN RETURN false; END IF;
  IF jsonb_typeof(p_definition->'assignmentEntityType') IS DISTINCT FROM 'string'
     OR (p_definition->>'assignmentEntityType') !~ '^[a-z][a-z0-9_]{0,63}$' THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'eligibility') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'eligibility') AS k
    WHERE k NOT IN ('description', 'tags')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'eligibility') ? 'description')
     OR jsonb_typeof(p_definition#>'{eligibility,description}') IS DISTINCT FROM 'string'
     OR char_length(p_definition#>>'{eligibility,description}') NOT BETWEEN 1 AND 500
     OR btrim(p_definition#>>'{eligibility,description}') = '' THEN RETURN false; END IF;
  IF (p_definition->'eligibility') ? 'tags' THEN
    IF jsonb_typeof(p_definition#>'{eligibility,tags}') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT COUNT(*) FROM jsonb_object_keys(p_definition#>'{eligibility,tags}')) > 5 THEN RETURN false; END IF;
    FOR v_tag IN SELECT key, value FROM jsonb_each(p_definition#>'{eligibility,tags}') LOOP
      IF v_tag.key NOT IN ('source', 'channel', 'campaign', 'plan', 'region') THEN RETURN false; END IF;
      IF jsonb_typeof(v_tag.value) NOT IN ('string', 'number', 'boolean') THEN RETURN false; END IF;
      IF jsonb_typeof(v_tag.value) = 'string'
         AND char_length(v_tag.value #>> '{}') > 64 THEN RETURN false; END IF;
      IF jsonb_typeof(v_tag.value) = 'number'
         AND (
           (v_tag.value #>> '{}')::NUMERIC <> trunc((v_tag.value #>> '{}')::NUMERIC)
           OR abs((v_tag.value #>> '{}')::NUMERIC) > 1000000000000000
         ) THEN RETURN false; END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_definition->'variants') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'variants') NOT BETWEEN 2 AND 10 THEN RETURN false; END IF;
  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_definition->'variants') LOOP
    IF jsonb_typeof(v_variant) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_variant) AS k WHERE k NOT IN ('key', 'weight')
    ) THEN RETURN false; END IF;
    IF NOT (v_variant ?& ARRAY['key', 'weight'])
       OR jsonb_typeof(v_variant->'key') IS DISTINCT FROM 'string'
       OR (v_variant->>'key') !~ '^[a-z][a-z0-9_-]{0,63}$'
       OR jsonb_typeof(v_variant->'weight') IS DISTINCT FROM 'number'
       OR (v_variant->>'weight') !~ '^[0-9]+$'
       OR (v_variant->>'weight')::NUMERIC NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT value->>'key' FROM jsonb_array_elements(p_definition->'variants')
      GROUP BY value->>'key' HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;
  IF jsonb_typeof(p_definition->'controlVariantKey') IS DISTINCT FROM 'string'
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_definition->'variants') AS variant
       WHERE variant->>'key' = p_definition->>'controlVariantKey'
     ) THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'primaryMetric') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'primaryMetric') AS k
    WHERE k NOT IN ('event', 'direction')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'primaryMetric') ?& ARRAY['event', 'direction'])
     OR jsonb_typeof(p_definition#>'{primaryMetric,event}') IS DISTINCT FROM 'string'
     OR char_length(p_definition#>>'{primaryMetric,event}') NOT BETWEEN 1 AND 128
     OR p_definition#>>'{primaryMetric,event}' <> btrim(p_definition#>>'{primaryMetric,event}')
     OR (p_definition#>>'{primaryMetric,event}') ~ '[[:cntrl:]]'
     OR jsonb_typeof(p_definition#>'{primaryMetric,direction}') IS DISTINCT FROM 'string'
     OR p_definition#>>'{primaryMetric,direction}' NOT IN ('increase', 'decrease') THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'guardrailMetrics') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'guardrailMetrics') > 10 THEN RETURN false; END IF;
  FOR v_metric IN SELECT value FROM jsonb_array_elements(p_definition->'guardrailMetrics') LOOP
    IF jsonb_typeof(v_metric) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_metric) AS k WHERE k NOT IN ('event', 'direction')
    ) THEN RETURN false; END IF;
    IF NOT (v_metric ?& ARRAY['event', 'direction'])
       OR jsonb_typeof(v_metric->'event') IS DISTINCT FROM 'string'
       OR char_length(v_metric->>'event') NOT BETWEEN 1 AND 128
       OR v_metric->>'event' <> btrim(v_metric->>'event')
       OR (v_metric->>'event') ~ '[[:cntrl:]]'
       OR jsonb_typeof(v_metric->'direction') IS DISTINCT FROM 'string'
       OR v_metric->>'direction' NOT IN ('increase', 'decrease') THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT metric_event FROM (
        SELECT p_definition#>>'{primaryMetric,event}' AS metric_event
        UNION ALL
        SELECT value->>'event' FROM jsonb_array_elements(p_definition->'guardrailMetrics')
      ) all_metrics
      GROUP BY metric_event HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'segmentFields') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'segmentFields') > 5 THEN RETURN false; END IF;
  FOR v_segment IN SELECT value FROM jsonb_array_elements(p_definition->'segmentFields') LOOP
    IF jsonb_typeof(v_segment) IS DISTINCT FROM 'string'
       OR (v_segment #>> '{}') NOT IN ('source', 'channel', 'campaign', 'plan', 'region')
       THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT value FROM jsonb_array_elements(p_definition->'segmentFields')
      GROUP BY value HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'plannedWindow') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'plannedWindow') AS k
    WHERE k NOT IN ('startAt', 'endAt')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'plannedWindow') ?& ARRAY['startAt', 'endAt'])
     OR jsonb_typeof(p_definition#>'{plannedWindow,startAt}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_definition#>'{plannedWindow,endAt}') IS DISTINCT FROM 'string'
     OR p_definition#>>'{plannedWindow,startAt}' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR p_definition#>>'{plannedWindow,endAt}' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     THEN RETURN false; END IF;
  v_start := (p_definition#>>'{plannedWindow,startAt}')::TIMESTAMPTZ;
  v_end := (p_definition#>>'{plannedWindow,endAt}')::TIMESTAMPTZ;
  IF v_start >= v_end THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'minimumSamplePerVariant') IS DISTINCT FROM 'number'
     OR (p_definition->>'minimumSamplePerVariant') !~ '^[0-9]+$'
     OR (p_definition->>'minimumSamplePerVariant')::NUMERIC NOT BETWEEN 1 AND 1000000
     THEN RETURN false; END IF;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.experiment_definition_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE experiment_registries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  created_by UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE experiment_definition_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL,
  experiment_id  UUID        NOT NULL,
  version        INTEGER     NOT NULL CHECK (version > 0),
  definition     JSONB       NOT NULL CHECK (private.experiment_definition_is_valid(definition)),
  status         TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'stopped', 'decided', 'invalid')),
  created_by     UUID        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_by     UUID,
  started_at     TIMESTAMPTZ,
  ended_by       UUID,
  ended_at       TIMESTAMPTZ,
  invalidated_by UUID,
  invalidated_at TIMESTAMPTZ,
  CONSTRAINT experiment_versions_registry_fk
    FOREIGN KEY (project_id, experiment_id)
    REFERENCES experiment_registries(project_id, id) ON DELETE CASCADE,
  CONSTRAINT experiment_versions_started_pair
    CHECK ((started_by IS NULL) = (started_at IS NULL)),
  CONSTRAINT experiment_versions_ended_pair
    CHECK ((ended_by IS NULL) = (ended_at IS NULL)),
  CONSTRAINT experiment_versions_invalid_pair
    CHECK ((invalidated_by IS NULL) = (invalidated_at IS NULL)),
  CONSTRAINT experiment_versions_state_shape CHECK (
    (status = 'draft' AND started_at IS NULL AND ended_at IS NULL AND invalidated_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND ended_at IS NULL AND invalidated_at IS NULL)
    OR (status = 'stopped' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND invalidated_at IS NULL)
    OR (status = 'decided' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND invalidated_at IS NULL)
    OR (
      status = 'invalid'
      AND invalidated_at IS NOT NULL
      AND (started_at IS NULL OR ended_at IS NOT NULL)
    )
  ),
  UNIQUE (experiment_id, version),
  UNIQUE (project_id, experiment_id, id)
);

CREATE UNIQUE INDEX experiment_one_running_version_idx
  ON experiment_definition_versions(project_id, experiment_id)
  WHERE status = 'running';

CREATE TABLE experiment_lifecycle_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL,
  experiment_id UUID        NOT NULL,
  version_id    UUID        NOT NULL,
  action        TEXT        NOT NULL
    CHECK (action IN (
      'version_created', 'version_started', 'version_stopped', 'version_decided',
      'version_invalidated'
    )),
  actor_user_id UUID        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_audit_version_fk
    FOREIGN KEY (project_id, experiment_id, version_id)
    REFERENCES experiment_definition_versions(project_id, experiment_id, id)
);
CREATE INDEX experiment_lifecycle_audit_project_created_idx
  ON experiment_lifecycle_audit(project_id, created_at DESC);

ALTER TABLE experiment_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_lifecycle_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.enforce_experiment_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.experiment_registries
      WHERE project_id = OLD.project_id AND id = OLD.experiment_id
    ) THEN
      RAISE EXCEPTION 'experiment definition versions are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.experiment_id IS DISTINCT FROM NEW.experiment_id
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.definition IS DISTINCT FROM NEW.definition
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'experiment definition versions are immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('running', 'invalid'))
    OR (OLD.status = 'running' AND NEW.status IN ('stopped', 'invalid'))
    OR (OLD.status = 'stopped' AND NEW.status IN ('decided', 'invalid'))
  ) THEN
    RAISE EXCEPTION 'invalid experiment lifecycle transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER experiment_definition_versions_immutable_trg
  BEFORE UPDATE OR DELETE ON experiment_definition_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_experiment_version_immutability();

CREATE OR REPLACE FUNCTION create_experiment_version(
  p_project_id UUID,
  p_experiment_key TEXT,
  p_definition JSONB,
  p_actor_user_id UUID
)
RETURNS TABLE (
  project_id UUID,
  experiment_id UUID,
  version_id UUID,
  version INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_experiment_id UUID;
  v_version_id UUID;
  v_version INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'experiment management requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_experiment_key IS NULL OR p_experiment_key !~ '^[a-z][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'invalid experiment key' USING ERRCODE = '22023';
  END IF;
  IF NOT private.experiment_definition_is_valid(p_definition) THEN
    RAISE EXCEPTION 'invalid experiment definition' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_experiment_key, 0));
  SELECT registry.id INTO v_experiment_id
  FROM public.experiment_registries registry
  WHERE registry.project_id = p_project_id AND registry.key = p_experiment_key
  FOR UPDATE;
  IF v_experiment_id IS NULL THEN
    INSERT INTO public.experiment_registries(project_id, key, created_by)
    VALUES (p_project_id, p_experiment_key, p_actor_user_id)
    RETURNING id INTO v_experiment_id;
  END IF;

  SELECT COALESCE(MAX(candidate.version), 0) + 1 INTO v_version
  FROM public.experiment_definition_versions candidate
  WHERE candidate.project_id = p_project_id AND candidate.experiment_id = v_experiment_id;

  INSERT INTO public.experiment_definition_versions(
    project_id, experiment_id, version, definition, created_by
  ) VALUES (
    p_project_id, v_experiment_id, v_version, p_definition, p_actor_user_id
  ) RETURNING id INTO v_version_id;

  INSERT INTO public.experiment_lifecycle_audit(
    project_id, experiment_id, version_id, action, actor_user_id
  ) VALUES (
    p_project_id, v_experiment_id, v_version_id, 'version_created', p_actor_user_id
  );

  RETURN QUERY SELECT p_project_id, v_experiment_id, v_version_id, v_version, 'draft'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION transition_experiment_version(
  p_project_id UUID,
  p_experiment_id UUID,
  p_version_id UUID,
  p_target_status TEXT,
  p_actor_user_id UUID
)
RETURNS TABLE (
  project_id UUID,
  experiment_id UUID,
  version_id UUID,
  version INTEGER,
  status TEXT,
  changed BOOLEAN,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row public.experiment_definition_versions%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_action TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'experiment management requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_target_status IS NULL OR p_target_status NOT IN ('running', 'stopped', 'invalid') THEN
    RAISE EXCEPTION 'invalid experiment target status' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.experiment_registries registry
  WHERE registry.project_id = p_project_id AND registry.id = p_experiment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT candidate.* INTO v_row
  FROM public.experiment_definition_versions candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.experiment_id = p_experiment_id
    AND candidate.id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_row.status = p_target_status THEN
    RETURN QUERY SELECT
      p_project_id, p_experiment_id, p_version_id, v_row.version, v_row.status, false,
      v_row.started_at, v_row.ended_at, v_row.invalidated_at;
    RETURN;
  END IF;

  IF p_target_status = 'running' THEN
    IF v_row.status <> 'draft'
       OR EXISTS (
         SELECT 1 FROM public.experiment_definition_versions running
         WHERE running.project_id = p_project_id
           AND running.experiment_id = p_experiment_id
           AND running.status = 'running'
       )
       OR EXISTS (
         SELECT 1 FROM public.experiment_definition_versions started
         WHERE started.project_id = p_project_id
           AND started.experiment_id = p_experiment_id
           AND started.started_at IS NOT NULL
           AND started.version >= v_row.version
       ) THEN RETURN; END IF;
    UPDATE public.experiment_definition_versions AS target
    SET status = 'running', started_by = p_actor_user_id, started_at = v_now
    WHERE target.project_id = p_project_id
      AND target.experiment_id = p_experiment_id
      AND target.id = p_version_id;
    v_action := 'version_started';
  ELSIF p_target_status = 'stopped' THEN
    IF v_row.status <> 'running' THEN RETURN; END IF;
    UPDATE public.experiment_definition_versions AS target
    SET status = 'stopped', ended_by = p_actor_user_id, ended_at = v_now
    WHERE target.project_id = p_project_id
      AND target.experiment_id = p_experiment_id
      AND target.id = p_version_id;
    v_action := 'version_stopped';
  ELSE
    IF v_row.status NOT IN ('draft', 'running', 'stopped') THEN RETURN; END IF;
    UPDATE public.experiment_definition_versions AS target
    SET
      status = 'invalid',
      invalidated_by = p_actor_user_id,
      invalidated_at = v_now,
      ended_by = CASE WHEN v_row.status = 'running' THEN p_actor_user_id ELSE target.ended_by END,
      ended_at = CASE WHEN v_row.status = 'running' THEN v_now ELSE target.ended_at END
    WHERE target.project_id = p_project_id
      AND target.experiment_id = p_experiment_id
      AND target.id = p_version_id;
    v_action := 'version_invalidated';
  END IF;

  INSERT INTO public.experiment_lifecycle_audit(
    project_id, experiment_id, version_id, action, actor_user_id, created_at
  ) VALUES (
    p_project_id, p_experiment_id, p_version_id, v_action, p_actor_user_id, v_now
  );

  SELECT candidate.* INTO v_row
  FROM public.experiment_definition_versions candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.experiment_id = p_experiment_id
    AND candidate.id = p_version_id;
  RETURN QUERY SELECT
    p_project_id, p_experiment_id, p_version_id, v_row.version, v_row.status, true,
    v_row.started_at, v_row.ended_at, v_row.invalidated_at;
END;
$$;

REVOKE ALL ON TABLE experiment_registries, experiment_definition_versions, experiment_lifecycle_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE experiment_registries, experiment_definition_versions, experiment_lifecycle_audit
  TO service_role;

DO $$
BEGIN
  IF has_table_privilege('service_role', 'public.experiment_lifecycle_audit', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'experiment_lifecycle_audit must be append-only to service_role';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION create_experiment_version(UUID, TEXT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_experiment_version(UUID, TEXT, JSONB, UUID) TO service_role;
REVOKE ALL ON FUNCTION transition_experiment_version(UUID, UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_experiment_version(UUID, UUID, UUID, TEXT, UUID) TO service_role;

COMMENT ON TABLE experiment_definition_versions IS
  'Immutable project-scoped experiment plans. Decided is reserved for the Sprint 3 atomic human-decision RPC and is never entered by the generic lifecycle RPC.';
COMMENT ON TABLE experiment_lifecycle_audit IS
  'Append-only project/version actor-time evidence written atomically by experiment lifecycle RPCs.';
