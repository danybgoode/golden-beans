-- scenarios-pm-operable · owner-session command boundary.
--
-- The credential API and the signed-in owner UI deliberately converge on these private transaction
-- cores. Public owner functions receive project/actor identifiers only from the server action,
-- re-prove ownership here, and remain service-role-only. No request role can execute any core or
-- facade directly.

CREATE OR REPLACE FUNCTION private.assert_scenario_owner(
  p_project_id UUID,
  p_actor_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'scenario management requires project ownership' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_scenario_owner(UUID,UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.revoke_scenario_target_core(
  p_project_id UUID,
  p_actor_user_id UUID,
  p_external_actor_id TEXT,
  p_target_id UUID,
  p_reason TEXT
)
RETURNS TABLE (target_id UUID, status TEXT, changed BOOLEAN)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_target public.scenario_targets%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'invalid scenario target revocation' USING ERRCODE = '22023';
  END IF;
  SELECT target.* INTO v_target
  FROM public.scenario_targets target
  WHERE target.project_id = p_project_id AND target.id = p_target_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_target.status = 'revoked' THEN
    RETURN QUERY SELECT v_target.id, v_target.status, false;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.scenario_runs run
    WHERE run.project_id = p_project_id AND run.target_id = v_target.id
      AND run.status = 'running'
  ) THEN
    RAISE EXCEPTION 'stop the active scenario before revoking its target' USING ERRCODE = '55000';
  END IF;
  UPDATE public.scenario_targets
  SET status = 'revoked', revoked_by = p_actor_user_id, revoked_at = now()
  WHERE project_id = p_project_id AND id = v_target.id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, target_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    p_project_id, v_target.id, 'target_revoked', p_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_target.id, 'revoked'::TEXT, true;
END;
$$;
REVOKE ALL ON FUNCTION private.revoke_scenario_target_core(UUID,UUID,TEXT,UUID,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.create_scenario_definition_version_core(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_external_actor_id TEXT,
  p_scenario_key TEXT,
  p_definition JSONB,
  p_reason TEXT
)
RETURNS TABLE (
  scenario_id UUID,
  scenario_version_id UUID,
  version INTEGER,
  created BOOLEAN
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_scenario_id UUID;
  v_version_id UUID;
  v_version INTEGER;
  v_target_id UUID;
  v_flag_id UUID;
  v_flag_version_id UUID;
  v_experiment_id UUID;
  v_experiment_version_id UUID;
BEGIN
  IF p_scenario_key IS NULL OR p_scenario_key !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR NOT private.scenario_definition_is_valid(p_definition)
     OR p_definition->>'environment' <> p_environment
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = ''
  THEN
    RAISE EXCEPTION 'invalid scenario definition command' USING ERRCODE = '22023';
  END IF;

  SELECT target.id INTO v_target_id
  FROM public.scenario_targets target
  WHERE target.project_id = p_project_id
    AND target.key = p_definition->>'targetKey'
    AND target.status = 'verified';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario target is not verified' USING ERRCODE = '22023';
  END IF;
  SELECT registry.id, version.id INTO v_flag_id, v_flag_version_id
  FROM public.flag_registries registry
  JOIN public.flag_definition_versions version
    ON version.project_id = registry.project_id AND version.flag_id = registry.id
  WHERE registry.project_id = p_project_id
    AND registry.key = p_definition#>>'{flag,key}'
    AND version.version = (p_definition#>>'{flag,definitionVersion}')::INTEGER;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario flag version does not exist' USING ERRCODE = '22023';
  END IF;
  IF p_definition ? 'experiment' THEN
    SELECT registry.id, version.id INTO v_experiment_id, v_experiment_version_id
    FROM public.experiment_registries registry
    JOIN public.experiment_definition_versions version
      ON version.project_id = registry.project_id AND version.experiment_id = registry.id
    WHERE registry.project_id = p_project_id
      AND registry.key = p_definition#>>'{experiment,key}'
      AND version.version = (p_definition#>>'{experiment,definitionVersion}')::INTEGER;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scenario experiment version does not exist' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.experiment_flag_version_bindings binding
      WHERE binding.project_id = p_project_id
        AND binding.experiment_id = v_experiment_id
        AND binding.experiment_version_id = v_experiment_version_id
        AND binding.flag_id = v_flag_id
        AND binding.flag_version_id = v_flag_version_id
    ) THEN
      RAISE EXCEPTION 'scenario experiment is not bound to its flag version'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_project_id::TEXT || ':scenario:' || p_scenario_key,
    0
  ));
  SELECT registry.id INTO v_scenario_id
  FROM public.scenario_registries registry
  WHERE registry.project_id = p_project_id AND registry.key = p_scenario_key
  FOR UPDATE;
  IF v_scenario_id IS NULL THEN
    IF (
      SELECT COUNT(*) FROM public.scenario_registries registry
      WHERE registry.project_id = p_project_id
    ) >= 100 THEN
      RAISE EXCEPTION 'scenario registry limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO public.scenario_registries(project_id, key, created_by)
    VALUES (p_project_id, p_scenario_key, p_actor_user_id)
    RETURNING id INTO v_scenario_id;
  END IF;
  SELECT existing.id, existing.version INTO v_version_id, v_version
  FROM public.scenario_definition_versions existing
  WHERE existing.project_id = p_project_id
    AND existing.scenario_id = v_scenario_id
    AND existing.definition = p_definition;
  IF FOUND THEN
    RETURN QUERY SELECT v_scenario_id, v_version_id, v_version, false;
    RETURN;
  END IF;
  SELECT COALESCE(max(candidate.version), 0) + 1 INTO v_version
  FROM public.scenario_definition_versions candidate
  WHERE candidate.project_id = p_project_id AND candidate.scenario_id = v_scenario_id;
  INSERT INTO public.scenario_definition_versions(
    project_id, scenario_id, version, definition, target_id,
    flag_id, flag_version_id, experiment_id, experiment_version_id, created_by
  ) VALUES (
    p_project_id, v_scenario_id, v_version, p_definition, v_target_id,
    v_flag_id, v_flag_version_id, v_experiment_id, v_experiment_version_id,
    p_actor_user_id
  ) RETURNING id INTO v_version_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    p_project_id, v_scenario_id, v_version_id, v_target_id,
    'version_created', p_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('version', v_version, 'kind', p_definition->>'kind')
  );
  RETURN QUERY SELECT v_scenario_id, v_version_id, v_version, true;
END;
$$;
REVOKE ALL ON FUNCTION private.create_scenario_definition_version_core(UUID,TEXT,UUID,TEXT,TEXT,JSONB,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.create_scenario_run_core(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_external_actor_id TEXT,
  p_scenario_version_id UUID,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, created BOOLEAN)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_version public.scenario_definition_versions%ROWTYPE;
  v_run_id UUID;
BEGIN
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'invalid scenario run command' USING ERRCODE = '22023';
  END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = p_project_id
    AND version.id = p_scenario_version_id
    AND version.definition->>'environment' = p_environment;
  IF NOT FOUND THEN RETURN; END IF;
  IF (
    SELECT COUNT(*) FROM public.scenario_runs run
    WHERE run.project_id = p_project_id AND run.environment = p_environment
  ) >= 1000 THEN
    RAISE EXCEPTION 'scenario run history limit reached' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (p_project_id, p_environment)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.scenario_runs(
    project_id, scenario_id, scenario_version_id, target_id, environment, created_by
  ) VALUES (
    p_project_id, v_version.scenario_id, v_version.id, v_version.target_id,
    p_environment, p_actor_user_id
  ) RETURNING id INTO v_run_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason
  ) VALUES (
    p_project_id, v_version.scenario_id, v_version.id, v_run_id, v_version.target_id,
    'run_created', p_actor_user_id, p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_run_id, 1::BIGINT, true;
END;
$$;
REVOKE ALL ON FUNCTION private.create_scenario_run_core(UUID,TEXT,UUID,TEXT,UUID,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.start_scenario_run_core(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_external_actor_id TEXT,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.scenario_runs%ROWTYPE;
  v_version public.scenario_definition_versions%ROWTYPE;
  v_snapshot_version BIGINT;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_active_count INTEGER;
  v_projected_bytes BIGINT;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
  THEN
    RAISE EXCEPTION 'invalid scenario start command' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_project_id::TEXT || ':scenario-run:' || p_run_id::TEXT,
    0
  ));
  PERFORM private.expire_scenario_runs(p_project_id, p_environment, v_now);
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = p_project_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_run.status = 'running' THEN
    SELECT state.snapshot_version INTO v_snapshot_version
    FROM public.scenario_environment_states state
    WHERE state.project_id = p_project_id AND state.environment = v_run.environment;
    RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, false;
    RETURN;
  END IF;
  IF v_run.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'scenario run revision conflict' USING ERRCODE = 'P0001';
  END IF;
  IF v_run.status <> 'draft' THEN
    RAISE EXCEPTION 'scenario run cannot be restarted' USING ERRCODE = '55000';
  END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = p_project_id AND version.id = v_run.scenario_version_id;
  IF v_version.definition->>'environment' <> p_environment
     OR v_now < (v_version.definition->>'startAt')::TIMESTAMPTZ
     OR v_now >= (v_version.definition->>'expiresAt')::TIMESTAMPTZ
  THEN
    RAISE EXCEPTION 'scenario is outside its active window' USING ERRCODE = '55000';
  END IF;
  IF v_version.definition->>'cohort' = 'external' AND NOT EXISTS (
    SELECT 1 FROM public.scenario_owner_approvals approval
    WHERE approval.project_id = p_project_id
      AND approval.scenario_version_id = v_version.id
      AND approval.approval_kind = 'external_cohort'
  ) THEN
    RAISE EXCEPTION 'external scenario requires owner approval' USING ERRCODE = '42501';
  END IF;
  IF v_version.definition->>'kind' = 'security'
     AND v_version.definition->>'environment' = 'production'
     AND NOT EXISTS (
       SELECT 1 FROM public.scenario_owner_approvals approval
       WHERE approval.project_id = p_project_id
         AND approval.scenario_version_id = v_version.id
         AND approval.approval_kind = 'production_security'
     )
  THEN
    RAISE EXCEPTION 'production security scenario requires owner approval' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scenario_targets target
    WHERE target.project_id = p_project_id AND target.id = v_run.target_id
      AND target.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'scenario target is not verified' USING ERRCODE = '55000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_project_id::TEXT || ':scenario-target:' || v_run.environment || ':' || v_run.target_id::TEXT,
    0
  ));
  IF EXISTS (
    SELECT 1 FROM public.scenario_runs active
    WHERE active.project_id = p_project_id
      AND active.environment = v_run.environment
      AND active.target_id = v_run.target_id
      AND active.status = 'running'
      AND active.id <> v_run.id
  ) THEN
    RAISE EXCEPTION 'another scenario is already active for this target'
      USING ERRCODE = '55000';
  END IF;

  IF v_version.definition->>'kind' = 'resilience' THEN
    SELECT COUNT(*)::INTEGER,
           COALESCE(SUM(
             octet_length(active_version.definition::TEXT)
             + octet_length(flag_version.definition::TEXT)
             + 2048
           ), 0)
    INTO v_active_count, v_projected_bytes
    FROM public.scenario_runs active
    JOIN public.scenario_definition_versions active_version
      ON active_version.project_id = active.project_id
     AND active_version.scenario_id = active.scenario_id
     AND active_version.id = active.scenario_version_id
    JOIN public.flag_definition_versions flag_version
      ON flag_version.project_id = active_version.project_id
     AND flag_version.flag_id = active_version.flag_id
     AND flag_version.id = active_version.flag_version_id
    WHERE active.project_id = p_project_id
      AND active.environment = v_run.environment
      AND active.status = 'running'
      AND active_version.definition->>'kind' = 'resilience';
    SELECT v_projected_bytes
      + octet_length(v_version.definition::TEXT)
      + octet_length(flag_version.definition::TEXT)
      + 2048
    INTO v_projected_bytes
    FROM public.flag_definition_versions flag_version
    WHERE flag_version.project_id = p_project_id
      AND flag_version.flag_id = v_version.flag_id
      AND flag_version.id = v_version.flag_version_id;
    IF v_active_count >= 50 OR v_projected_bytes > 240000 THEN
      RAISE EXCEPTION 'scenario snapshot capacity reached' USING ERRCODE = '54000';
    END IF;
  END IF;

  UPDATE public.scenario_runs run
  SET status = 'running', revision = run.revision + 1,
      started_by = p_actor_user_id, started_at = v_now
  WHERE run.project_id = p_project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  UPDATE public.scenario_environment_states state
  SET snapshot_version = state.snapshot_version + 1, updated_at = v_now
  WHERE state.project_id = p_project_id AND state.environment = v_run.environment
  RETURNING state.snapshot_version INTO v_snapshot_version;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason
  ) VALUES (
    p_project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id,
    v_run.target_id, 'run_started', p_actor_user_id, p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, true;
END;
$$;
REVOKE ALL ON FUNCTION private.start_scenario_run_core(UUID,TEXT,UUID,TEXT,UUID,BIGINT,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.transition_scenario_run_core(
  p_project_id UUID,
  p_actor_user_id UUID,
  p_external_actor_id TEXT,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_transition TEXT,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.scenario_runs%ROWTYPE;
  v_snapshot_version BIGINT;
  v_status TEXT;
  v_action TEXT;
  v_cancelled_leases INTEGER;
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_transition NOT IN ('stop', 'abort')
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
  THEN
    RAISE EXCEPTION 'invalid scenario transition command' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = p_project_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_run.status IN ('stopped', 'aborted', 'expired') THEN
    SELECT state.snapshot_version INTO v_snapshot_version
    FROM public.scenario_environment_states state
    WHERE state.project_id = p_project_id AND state.environment = v_run.environment;
    RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, false;
    RETURN;
  END IF;
  IF v_run.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'scenario run revision conflict' USING ERRCODE = 'P0001';
  END IF;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'scenario run is not active' USING ERRCODE = '55000';
  END IF;
  v_status := CASE p_transition WHEN 'stop' THEN 'stopped' ELSE 'aborted' END;
  v_action := CASE p_transition WHEN 'stop' THEN 'run_stopped' ELSE 'run_aborted' END;
  WITH cancelled AS (
    UPDATE public.scenario_run_leases lease
    SET status = 'expired', outcome = 'lease_expired', settled_at = v_now
    WHERE lease.project_id = p_project_id
      AND lease.run_id = v_run.id
      AND lease.status = 'active'
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_cancelled_leases FROM cancelled;
  UPDATE public.scenario_runs run
  SET status = v_status, revision = run.revision + 1,
      active_lease_count = 0,
      failure_count = run.failure_count + v_cancelled_leases,
      stopped_by = p_actor_user_id, stopped_at = v_now, stop_reason = p_reason
  WHERE run.project_id = p_project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  UPDATE public.scenario_environment_states state
  SET snapshot_version = state.snapshot_version + 1, updated_at = v_now
  WHERE state.project_id = p_project_id AND state.environment = v_run.environment
  RETURNING state.snapshot_version INTO v_snapshot_version;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    p_project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id,
    v_run.target_id, v_action, p_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('cancelledLeaseCount', v_cancelled_leases)
  );
  RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, true;
END;
$$;
REVOKE ALL ON FUNCTION private.transition_scenario_run_core(UUID,UUID,TEXT,UUID,BIGINT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Credential facades retain their existing signatures and authentication behavior, but now delegate
-- to the same cores as the signed-in UI.
CREATE OR REPLACE FUNCTION revoke_scenario_target(
  p_key_hash TEXT,
  p_target_id UUID,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (target_id UUID, status TEXT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid scenario target revocation' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM private.revoke_scenario_target_core(
    v_key.project_id, v_key.flag_actor_user_id, p_external_actor_id, p_target_id, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_scenario_definition_version(
  p_key_hash TEXT,
  p_scenario_key TEXT,
  p_definition JSONB,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (scenario_id UUID, scenario_version_id UUID, version INTEGER, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid scenario definition command' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM private.create_scenario_definition_version_core(
    v_key.project_id, v_key.flag_environment, v_key.flag_actor_user_id, p_external_actor_id,
    p_scenario_key, p_definition, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_scenario_run(
  p_key_hash TEXT,
  p_scenario_version_id UUID,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid scenario run command' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM private.create_scenario_run_core(
    v_key.project_id, v_key.flag_environment, v_key.flag_actor_user_id, p_external_actor_id,
    p_scenario_version_id, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION start_scenario_run(
  p_key_hash TEXT,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid scenario start command' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM private.start_scenario_run_core(
    v_key.project_id, v_key.flag_environment, v_key.flag_actor_user_id, p_external_actor_id,
    p_run_id, p_expected_revision, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION transition_scenario_run(
  p_key_hash TEXT,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_transition TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid scenario transition command' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM private.transition_scenario_run_core(
    v_key.project_id, v_key.flag_actor_user_id, p_external_actor_id, p_run_id,
    p_expected_revision, p_transition, p_reason
  );
END;
$$;

-- Owner-session facades. The app supplies these values only after requireProjectOwnership(); the
-- database repeats that proof so a future caller cannot turn service role into a tenant bypass.
CREATE OR REPLACE FUNCTION owner_revoke_scenario_target(
  p_project_id UUID,
  p_actor_user_id UUID,
  p_target_id UUID,
  p_reason TEXT
)
RETURNS TABLE (target_id UUID, status TEXT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM private.assert_scenario_owner(p_project_id, p_actor_user_id);
  RETURN QUERY SELECT * FROM private.revoke_scenario_target_core(
    p_project_id, p_actor_user_id, NULL, p_target_id, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION owner_create_scenario_definition_version(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_scenario_key TEXT,
  p_definition JSONB,
  p_reason TEXT
)
RETURNS TABLE (scenario_id UUID, scenario_version_id UUID, version INTEGER, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM private.assert_scenario_owner(p_project_id, p_actor_user_id);
  IF p_definition->>'cohort' = 'external' THEN
    RAISE EXCEPTION 'external cohort is unavailable to owner authoring' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.create_scenario_definition_version_core(
    p_project_id, p_environment, p_actor_user_id, NULL, p_scenario_key, p_definition, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION owner_create_scenario_run(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_scenario_version_id UUID,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM private.assert_scenario_owner(p_project_id, p_actor_user_id);
  IF EXISTS (
    SELECT 1
    FROM public.scenario_definition_versions version
    WHERE version.project_id = p_project_id
      AND version.id = p_scenario_version_id
      AND version.definition->>'cohort' = 'external'
  ) THEN
    RAISE EXCEPTION 'external cohort is unavailable to owner authoring' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.create_scenario_run_core(
    p_project_id, p_environment, p_actor_user_id, NULL, p_scenario_version_id, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION owner_start_scenario_run(
  p_project_id UUID,
  p_environment TEXT,
  p_actor_user_id UUID,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM private.assert_scenario_owner(p_project_id, p_actor_user_id);
  IF EXISTS (
    SELECT 1
    FROM public.scenario_runs run
    JOIN public.scenario_definition_versions version
      ON version.project_id = run.project_id AND version.id = run.scenario_version_id
    WHERE run.project_id = p_project_id
      AND run.id = p_run_id
      AND version.definition->>'cohort' = 'external'
  ) THEN
    RAISE EXCEPTION 'external cohort is unavailable to owner authoring' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.start_scenario_run_core(
    p_project_id, p_environment, p_actor_user_id, NULL, p_run_id, p_expected_revision, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION owner_transition_scenario_run(
  p_project_id UUID,
  p_actor_user_id UUID,
  p_run_id UUID,
  p_expected_revision BIGINT,
  p_transition TEXT,
  p_reason TEXT
)
RETURNS TABLE (run_id UUID, revision BIGINT, snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM private.assert_scenario_owner(p_project_id, p_actor_user_id);
  IF p_transition <> 'stop' THEN
    RAISE EXCEPTION 'owner scenario transition must be stop' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.transition_scenario_run_core(
    p_project_id, p_actor_user_id, NULL, p_run_id, p_expected_revision, p_transition, p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION
  revoke_scenario_target(TEXT,UUID,TEXT,TEXT),
  create_scenario_definition_version(TEXT,TEXT,JSONB,TEXT,TEXT),
  create_scenario_run(TEXT,UUID,TEXT,TEXT),
  start_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT),
  transition_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT,TEXT),
  owner_revoke_scenario_target(UUID,UUID,UUID,TEXT),
  owner_create_scenario_definition_version(UUID,TEXT,UUID,TEXT,JSONB,TEXT),
  owner_create_scenario_run(UUID,TEXT,UUID,UUID,TEXT),
  owner_start_scenario_run(UUID,TEXT,UUID,UUID,BIGINT,TEXT),
  owner_transition_scenario_run(UUID,UUID,UUID,BIGINT,TEXT,TEXT)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  revoke_scenario_target(TEXT,UUID,TEXT,TEXT),
  create_scenario_definition_version(TEXT,TEXT,JSONB,TEXT,TEXT),
  create_scenario_run(TEXT,UUID,TEXT,TEXT),
  start_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT),
  transition_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT,TEXT),
  owner_revoke_scenario_target(UUID,UUID,UUID,TEXT),
  owner_create_scenario_definition_version(UUID,TEXT,UUID,TEXT,JSONB,TEXT),
  owner_create_scenario_run(UUID,TEXT,UUID,UUID,TEXT),
  owner_start_scenario_run(UUID,TEXT,UUID,UUID,BIGINT,TEXT),
  owner_transition_scenario_run(UUID,UUID,UUID,BIGINT,TEXT,TEXT)
TO service_role;

DO $$
DECLARE v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.owner_revoke_scenario_target(uuid,uuid,uuid,text)',
    'public.owner_create_scenario_definition_version(uuid,text,uuid,text,jsonb,text)',
    'public.owner_create_scenario_run(uuid,text,uuid,uuid,text)',
    'public.owner_start_scenario_run(uuid,text,uuid,uuid,bigint,text)',
    'public.owner_transition_scenario_run(uuid,uuid,uuid,bigint,text,text)'
  ]
  LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'scenario owner function privilege boundary failed for %', v_signature;
    END IF;
  END LOOP;
END;
$$;
