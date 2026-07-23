-- entity-journeys-projections · Sprint 1, Story 1.1 — per-project versioned journey registry.
--
-- EXPAND-only and dark behind JOURNEY_PROJECTIONS_ENABLED. Definitions are immutable version rows;
-- a journey owns one nullable active-version pointer, so two versions cannot both be current. Every
-- create/activate transition and its actor/time audit row land inside one service-role-only RPC
-- transaction. Table writes are revoked from the application role so there is no non-transactional
-- side door around those functions.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Database backstop for the closed JSON contract. The TypeScript validator gives friendly errors;
-- this function makes the same safety bounds true for every future service-role caller/backfill.
CREATE OR REPLACE FUNCTION private.journey_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stage JSONB;
  v_tag RECORD;
  v_stage_count INTEGER;
  v_target_pos INTEGER;
  v_anchor_pos INTEGER;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF octet_length(p_definition::TEXT) > 32768 THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition) AS k
    WHERE k NOT IN ('entityType', 'description', 'stages', 'cohortEntry', 'retention')
  ) THEN RETURN false; END IF;

  IF NOT (p_definition ? 'entityType')
     OR jsonb_typeof(p_definition->'entityType') IS DISTINCT FROM 'string'
     OR (p_definition->>'entityType') !~ '^[a-z][a-z0-9_]{0,63}$' THEN RETURN false; END IF;
  IF p_definition ? 'description' AND (
    jsonb_typeof(p_definition->'description') IS DISTINCT FROM 'string'
    OR char_length(p_definition->>'description') > 500
  ) THEN RETURN false; END IF;
  IF NOT (p_definition ? 'stages')
     OR jsonb_typeof(p_definition->'stages') IS DISTINCT FROM 'array' THEN RETURN false; END IF;

  v_stage_count := jsonb_array_length(p_definition->'stages');
  IF v_stage_count < 1 OR v_stage_count > 20 THEN RETURN false; END IF;

  FOR v_stage IN SELECT value FROM jsonb_array_elements(p_definition->'stages') LOOP
    IF jsonb_typeof(v_stage) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_stage) AS k WHERE k NOT IN ('key', 'event', 'tags')
    ) THEN RETURN false; END IF;
    IF NOT (v_stage ? 'key')
       OR jsonb_typeof(v_stage->'key') IS DISTINCT FROM 'string'
       OR (v_stage->>'key') !~ '^[a-z][a-z0-9_]{0,63}$' THEN RETURN false; END IF;
    IF NOT (v_stage ? 'event')
       OR jsonb_typeof(v_stage->'event') IS DISTINCT FROM 'string'
       OR char_length(v_stage->>'event') NOT BETWEEN 1 AND 128
       OR (v_stage->>'event') <> btrim(v_stage->>'event')
       OR (v_stage->>'event') ~ '[[:cntrl:]]' THEN RETURN false; END IF;

    IF v_stage ? 'tags' THEN
      IF jsonb_typeof(v_stage->'tags') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      IF (SELECT COUNT(*) FROM jsonb_object_keys(v_stage->'tags')) > 5 THEN RETURN false; END IF;
      FOR v_tag IN SELECT key, value FROM jsonb_each(v_stage->'tags') LOOP
        IF v_tag.key NOT IN ('source', 'channel', 'campaign', 'plan', 'region') THEN RETURN false; END IF;
        IF jsonb_typeof(v_tag.value) NOT IN ('string', 'number', 'boolean') THEN RETURN false; END IF;
        IF jsonb_typeof(v_tag.value) = 'string'
           AND char_length(v_tag.value #>> '{}') > 64 THEN RETURN false; END IF;
        -- Same exact safe-integer contract as lib/entity-contract.ts. The value must have no
        -- fractional component and abs <= 1e15, rejecting decimals and exponent bombs like 1e400.
        IF jsonb_typeof(v_tag.value) = 'number'
           AND (
             (v_tag.value #>> '{}')::NUMERIC <> trunc((v_tag.value #>> '{}')::NUMERIC)
             OR abs((v_tag.value #>> '{}')::NUMERIC) > 1000000000000000
           ) THEN RETURN false; END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF (
    SELECT COUNT(*) FROM (
      SELECT value->>'key' FROM jsonb_array_elements(p_definition->'stages')
      GROUP BY value->>'key' HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;

  IF p_definition ? 'cohortEntry' THEN
    IF jsonb_typeof(p_definition->'cohortEntry') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_definition->'cohortEntry') AS k WHERE k <> 'stageKey'
    ) THEN RETURN false; END IF;
    IF NOT ((p_definition->'cohortEntry') ? 'stageKey')
       OR jsonb_typeof(p_definition#>'{cohortEntry,stageKey}') IS DISTINCT FROM 'string'
       OR p_definition#>>'{cohortEntry,stageKey}' <> p_definition#>>'{stages,0,key}' THEN RETURN false; END IF;
  END IF;

  IF p_definition ? 'retention' THEN
    IF jsonb_typeof(p_definition->'retention') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_definition->'retention') AS k
      WHERE k NOT IN ('stageKey', 'anchorStageKey', 'withinDays')
    ) THEN RETURN false; END IF;
    IF NOT ((p_definition->'retention') ?& ARRAY['stageKey', 'anchorStageKey', 'withinDays'])
       OR jsonb_typeof(p_definition#>'{retention,stageKey}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_definition#>'{retention,anchorStageKey}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_definition#>'{retention,withinDays}') IS DISTINCT FROM 'number'
       OR (p_definition#>>'{retention,withinDays}') !~ '^[0-9]+$'
       OR (p_definition#>>'{retention,withinDays}')::INTEGER NOT BETWEEN 1 AND 365 THEN RETURN false; END IF;

    SELECT ordinality::INTEGER INTO v_target_pos
      FROM jsonb_array_elements(p_definition->'stages') WITH ORDINALITY AS s(value, ordinality)
     WHERE value->>'key' = p_definition#>>'{retention,stageKey}';
    SELECT ordinality::INTEGER INTO v_anchor_pos
      FROM jsonb_array_elements(p_definition->'stages') WITH ORDINALITY AS s(value, ordinality)
     WHERE value->>'key' = p_definition#>>'{retention,anchorStageKey}';
    IF v_target_pos IS NULL OR v_anchor_pos IS NULL OR v_anchor_pos > v_target_pos THEN RETURN false; END IF;
  END IF;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE TABLE journey_registries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key               TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  active_version_id UUID,
  created_by        UUID        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE journey_definition_versions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL,
  journey_id   UUID        NOT NULL,
  version      INTEGER     NOT NULL CHECK (version > 0),
  definition   JSONB       NOT NULL CHECK (private.journey_definition_is_valid(definition)),
  created_by   UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by UUID,
  activated_at TIMESTAMPTZ,
  CONSTRAINT journey_definition_versions_journey_fk
    FOREIGN KEY (project_id, journey_id) REFERENCES journey_registries(project_id, id) ON DELETE CASCADE,
  CONSTRAINT journey_definition_versions_activation_pair
    CHECK ((activated_by IS NULL) = (activated_at IS NULL)),
  UNIQUE (journey_id, version),
  UNIQUE (project_id, journey_id, id)
);

ALTER TABLE journey_registries
  ADD CONSTRAINT journey_registries_active_version_fk
  FOREIGN KEY (project_id, id, active_version_id)
  REFERENCES journey_definition_versions(project_id, journey_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE journey_definition_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identifiers deliberately carry no cascading FK. An account/project cleanup may remove
  -- operational registry rows, but must not erase the evidence of who changed lifecycle meaning.
  project_id    UUID        NOT NULL,
  journey_id    UUID        NOT NULL,
  version_id    UUID        NOT NULL,
  action        TEXT        NOT NULL CHECK (action IN ('version_created', 'version_activated')),
  actor_user_id UUID        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journey_definition_audit_project_created_idx
  ON journey_definition_audit(project_id, created_at DESC);

ALTER TABLE journey_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_definition_audit ENABLE ROW LEVEL SECURITY;

-- Versions are immutable documents. The ONLY permitted UPDATE stamps a never-activated row once;
-- the activation RPC does that and updates the registry pointer + audit in the same transaction.
CREATE OR REPLACE FUNCTION private.enforce_journey_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A direct version delete while its registry still exists is forbidden. Cascading cleanup of
    -- the parent registry/project is allowed; the independent audit rows survive it.
    IF EXISTS (SELECT 1 FROM public.journey_registries WHERE id = OLD.journey_id) THEN
      RAISE EXCEPTION 'journey definition versions are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.journey_id IS DISTINCT FROM NEW.journey_id
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.definition IS DISTINCT FROM NEW.definition
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.activated_at IS NOT NULL
     OR NEW.activated_at IS NULL
     OR NEW.activated_by IS NULL THEN
    RAISE EXCEPTION 'journey definition versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journey_definition_versions_immutable_trg
  BEFORE UPDATE OR DELETE ON journey_definition_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_journey_version_immutability();

-- Migration-time property proof: immutability is enforced even for the
-- migration owner, while deleting the parent project still performs the
-- intended cascading cleanup. The assertion creates and removes its own
-- rows in one transaction, so a successful migration leaves no fixtures.
DO $$
DECLARE
  v_project_id UUID;
  v_journey_id UUID;
  v_version_id UUID;
  v_audit_id UUID;
BEGIN
  INSERT INTO public.projects (slug, api_key_hash)
  VALUES ('journey-immutability-migration-assertion', NULL)
  RETURNING id INTO v_project_id;

  INSERT INTO public.journey_registries (
    project_id,
    key,
    created_by
  )
  VALUES (
    v_project_id,
    'migration_assertion',
    '00000000-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_journey_id;

  INSERT INTO public.journey_definition_versions (
    project_id,
    journey_id,
    version,
    definition,
    created_by
  )
  VALUES (
    v_project_id,
    v_journey_id,
    1,
    '{"entityType":"merchant","stages":[{"key":"created","event":"merchant_created"}]}'::JSONB,
    '00000000-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_version_id;

  BEGIN
    UPDATE public.journey_definition_versions
    SET definition = '{"entityType":"merchant","stages":[{"key":"changed","event":"merchant_changed"}]}'::JSONB
    WHERE id = v_version_id;

    RAISE EXCEPTION 'journey version UPDATE unexpectedly bypassed the immutability trigger';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    DELETE FROM public.journey_definition_versions
    WHERE id = v_version_id;

    RAISE EXCEPTION 'journey version DELETE unexpectedly bypassed the immutability trigger';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;

  INSERT INTO public.journey_definition_audit (
    project_id,
    journey_id,
    version_id,
    action,
    actor_user_id
  )
  VALUES (
    v_project_id,
    v_journey_id,
    v_version_id,
    'version_created',
    '00000000-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_audit_id;

  DELETE FROM public.projects
  WHERE id = v_project_id;

  IF EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = v_project_id
  ) OR EXISTS (
    SELECT 1
    FROM public.journey_registries
    WHERE id = v_journey_id
  ) OR EXISTS (
    SELECT 1
    FROM public.journey_definition_versions
    WHERE id = v_version_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.journey_definition_audit
    WHERE id = v_audit_id
      AND project_id = v_project_id
      AND journey_id = v_journey_id
      AND version_id = v_version_id
  ) THEN
    RAISE EXCEPTION 'parent cleanup must remove registry state while preserving journey audit evidence';
  END IF;

  DELETE FROM public.journey_definition_audit
  WHERE id = v_audit_id;

  IF EXISTS (
    SELECT 1
    FROM public.journey_definition_audit
    WHERE id = v_audit_id
  ) THEN
    RAISE EXCEPTION 'journey migration assertion left an audit fixture behind';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_journey_version(
  p_project_id UUID,
  p_journey_key TEXT,
  p_definition JSONB,
  p_actor_user_id UUID
)
RETURNS TABLE (journey_id UUID, version_id UUID, version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_journey_id UUID;
  v_version_id UUID;
  v_version INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
     WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'journey management requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_journey_key IS NULL OR p_journey_key !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'journey key must be lower_snake_case' USING ERRCODE = '22023';
  END IF;
  IF NOT private.journey_definition_is_valid(p_definition) THEN
    RAISE EXCEPTION 'invalid journey definition' USING ERRCODE = '22023';
  END IF;

  -- Handles the first-version race too: there is no registry row to FOR UPDATE until one caller
  -- creates it, so every writer first takes the same project+key transaction lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_journey_key, 0));

  SELECT r.id INTO v_journey_id
    FROM public.journey_registries r
   WHERE r.project_id = p_project_id AND r.key = p_journey_key
   FOR UPDATE;
  IF v_journey_id IS NULL THEN
    INSERT INTO public.journey_registries(project_id, key, created_by)
    VALUES (p_project_id, p_journey_key, p_actor_user_id)
    RETURNING id INTO v_journey_id;
  END IF;

  SELECT COALESCE(MAX(v.version), 0) + 1 INTO v_version
    FROM public.journey_definition_versions v
   WHERE v.project_id = p_project_id
     AND v.journey_id = v_journey_id;

  INSERT INTO public.journey_definition_versions(
    project_id, journey_id, version, definition, created_by
  ) VALUES (
    p_project_id, v_journey_id, v_version, p_definition, p_actor_user_id
  ) RETURNING id INTO v_version_id;

  INSERT INTO public.journey_definition_audit(
    project_id, journey_id, version_id, action, actor_user_id
  ) VALUES (
    p_project_id, v_journey_id, v_version_id, 'version_created', p_actor_user_id
  );

  RETURN QUERY SELECT v_journey_id, v_version_id, v_version;
END;
$$;

CREATE OR REPLACE FUNCTION activate_journey_version(
  p_project_id UUID,
  p_journey_id UUID,
  p_version_id UUID,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_id UUID;
  v_active_version INTEGER;
  v_target_version INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
     WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'journey management requires project ownership' USING ERRCODE = '42501';
  END IF;

  SELECT r.active_version_id INTO v_active_id
    FROM public.journey_registries r
   WHERE r.project_id = p_project_id AND r.id = p_journey_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT v.version INTO v_target_version
    FROM public.journey_definition_versions v
   WHERE v.project_id = p_project_id AND v.journey_id = p_journey_id
     AND v.id = p_version_id AND v.activated_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_active_id IS NOT NULL THEN
    SELECT v.version INTO v_active_version
      FROM public.journey_definition_versions v
     WHERE v.project_id = p_project_id
       AND v.journey_id = p_journey_id
       AND v.id = v_active_id;
    IF v_target_version <= v_active_version THEN RETURN false; END IF;
  END IF;

  UPDATE public.journey_definition_versions
     SET activated_by = p_actor_user_id, activated_at = statement_timestamp()
   WHERE project_id = p_project_id
     AND journey_id = p_journey_id
     AND id = p_version_id;
  UPDATE public.journey_registries SET active_version_id = p_version_id
   WHERE project_id = p_project_id AND id = p_journey_id;
  INSERT INTO public.journey_definition_audit(
    project_id, journey_id, version_id, action, actor_user_id
  ) VALUES (
    p_project_id, p_journey_id, p_version_id, 'version_activated', p_actor_user_id
  );
  RETURN true;
END;
$$;

-- A projection must evaluate one complete, coherent fact set. Aggregating into one JSONB value
-- keeps the read to one SQL statement/snapshot and one PostgREST row, avoiding both the row cap and
-- cross-page movement during concurrent ingest. A streaming measurement reads at most one row beyond
-- the supported lifetime (10,000 facts / 32 MiB of aggregate JSON text) and fails closed before the
-- JSON aggregate is built. Because this function is STABLE, both internal SELECTs use the calling
-- statement's snapshot: the second pass cannot gain or lose concurrent rows after the first pass.
-- This remains strictly single-tenant: project_id is required and explicit in both events SELECTs.
CREATE OR REPLACE FUNCTION get_journey_subject_events(
  p_project_id UUID,
  p_subject_type TEXT,
  p_subject_id TEXT
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
  v_payload_bytes NUMERIC;
BEGIN
  IF p_project_id IS NULL OR p_subject_type IS NULL OR p_subject_id IS NULL THEN
    RAISE EXCEPTION 'project, subject type and subject id are required' USING ERRCODE = '22023';
  END IF;

  WITH bounded_events AS (
    SELECT
      e.id,
      e.event,
      e.tags,
      e.occurred_at,
      e.created_at,
      e.subject_id
    FROM public.events e
    WHERE e.project_id = p_project_id
      AND e.subject_type = p_subject_type
      AND e.subject_id = p_subject_id
    LIMIT 10001
  ),
  measured AS (
    SELECT
      COUNT(*) AS event_count,
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
    item_bytes + 2 + GREATEST(event_count - 1, 0) * 2
  INTO v_event_count, v_payload_bytes
  FROM measured;

  IF v_event_count > 10000 THEN
    RAISE EXCEPTION 'journey subject event limit exceeded (maximum 10000)'
      USING ERRCODE = '54000';
  END IF;
  IF v_payload_bytes > 33554432 THEN
    RAISE EXCEPTION 'journey subject event payload limit exceeded (maximum 33554432 bytes)'
      USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event', e.event,
        'tags', e.tags,
        'occurred_at', e.occurred_at,
        'created_at', e.created_at,
        'subject_id', e.subject_id
      ) ORDER BY e.created_at, e.id
    ),
    '[]'::JSONB
  )
  INTO v_events
  FROM public.events e
  WHERE e.project_id = p_project_id
    AND e.subject_type = p_subject_type
    AND e.subject_id = p_subject_id;

  RETURN v_events;
END;
$$;

-- The application may read registry state, but it cannot mutate tables directly. All state changes
-- must pass the owner check and atomic audit inside the two functions above.
REVOKE ALL ON TABLE journey_registries, journey_definition_versions, journey_definition_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE journey_registries, journey_definition_versions, journey_definition_audit
  TO service_role;

-- Migration-time assertion for the one table operation PostgREST cannot issue. UPDATE/DELETE are
-- attempted by the API spec; this makes a local reset/CI migration fail if TRUNCATE ever leaks.
DO $$
BEGIN
  IF has_table_privilege('service_role', 'public.journey_definition_audit', 'TRUNCATE') THEN
    RAISE EXCEPTION 'journey_definition_audit must deny TRUNCATE to service_role';
  END IF;
END;
$$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default. A service-role GRANT is additive, so the
-- explicit REVOKEs are the security property; the API spec pins a function-level denial (not RLS).
REVOKE ALL ON FUNCTION create_journey_version(UUID, TEXT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_journey_version(UUID, TEXT, JSONB, UUID) TO service_role;
REVOKE ALL ON FUNCTION activate_journey_version(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_journey_version(UUID, UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION get_journey_subject_events(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_journey_subject_events(UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE journey_definition_versions IS
  'Immutable, project-scoped journey documents. State is derived: active when referenced by journey_registries.active_version_id, superseded when previously activated, otherwise draft.';
COMMENT ON TABLE journey_definition_audit IS
  'Append-only actor/time trail written transactionally by create_journey_version and activate_journey_version.';
