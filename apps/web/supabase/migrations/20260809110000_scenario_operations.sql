-- flag-serving-and-prd-g · Sprint 3, Stories 3.1-3.2 — owner operations and read snapshot.
--
-- Project/environment always derive from a revocable credential. No function trusts a
-- request-supplied project id, and the operational read returns no target origin or secret.

CREATE OR REPLACE FUNCTION private.active_scenario_admin_key(p_key_hash TEXT)
RETURNS SETOF active_flag_admin_keys
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT key.*
  FROM public.active_flag_admin_keys key
  WHERE key.key_hash = p_key_hash;
$$;
REVOKE ALL ON FUNCTION private.active_scenario_admin_key(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Lazy expiry is intentionally tenant/environment bound. A snapshot read, an admin read, a start,
-- or an execution reservation can close overdue work; no cross-tenant scheduler is needed.
CREATE OR REPLACE FUNCTION private.expire_scenario_runs(
  p_project_id UUID,
  p_environment TEXT,
  p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expired RECORD;
  v_expired_count INTEGER := 0;
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  FOR v_expired IN
    WITH due AS (
      SELECT run.id
      FROM public.scenario_runs run
      JOIN public.scenario_definition_versions version
        ON version.project_id = run.project_id
       AND version.scenario_id = run.scenario_id
       AND version.id = run.scenario_version_id
      WHERE run.project_id = p_project_id
        AND run.environment = p_environment
        AND run.status = 'running'
        AND (version.definition->>'expiresAt')::TIMESTAMPTZ <= p_now
      FOR UPDATE OF run
    ),
    expired_leases AS (
      UPDATE public.scenario_run_leases lease
      SET status = 'expired', outcome = 'lease_expired', settled_at = p_now
      FROM due
      WHERE lease.project_id = p_project_id
        AND lease.run_id = due.id
        AND lease.status = 'active'
      RETURNING lease.run_id
    ),
    lease_counts AS (
      SELECT run_id, COUNT(*)::INTEGER AS count
      FROM expired_leases
      GROUP BY run_id
    )
    UPDATE public.scenario_runs run
    SET status = 'expired',
        revision = run.revision + 1,
        active_lease_count = 0,
        failure_count = run.failure_count + COALESCE(lease_counts.count, 0),
        stopped_by = v_system_actor,
        stopped_at = p_now,
        stop_reason = 'Scenario TTL expired.'
    FROM due
    LEFT JOIN lease_counts ON lease_counts.run_id = due.id
    WHERE run.project_id = p_project_id AND run.id = due.id
    RETURNING run.*, COALESCE(lease_counts.count, 0) AS expired_lease_count
  LOOP
    v_expired_count := v_expired_count + 1;
    INSERT INTO public.scenario_lifecycle_audit(
      project_id, scenario_id, scenario_version_id, run_id, target_id,
      action, actor_user_id, reason, metadata
    ) VALUES (
      v_expired.project_id, v_expired.scenario_id, v_expired.scenario_version_id,
      v_expired.id, v_expired.target_id, 'run_expired', v_system_actor,
      'Scenario TTL expired.',
      jsonb_build_object('expiredLeaseCount', v_expired.expired_lease_count)
    );
  END LOOP;
  IF v_expired_count > 0 THEN
    UPDATE public.scenario_environment_states state
    SET snapshot_version = state.snapshot_version + 1, updated_at = p_now
    WHERE state.project_id = p_project_id AND state.environment = p_environment;
  END IF;
  RETURN v_expired_count;
END;
$$;
REVOKE ALL ON FUNCTION private.expire_scenario_runs(UUID,TEXT,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.reclaim_scenario_run_leases(
  p_project_id UUID,
  p_run_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expired_count INTEGER;
  v_run public.scenario_runs%ROWTYPE;
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  WITH expired AS (
    UPDATE public.scenario_run_leases lease
    SET status = 'expired', outcome = 'lease_expired', settled_at = p_now
    WHERE lease.project_id = p_project_id
      AND lease.run_id = p_run_id
      AND lease.status = 'active'
      AND lease.expires_at <= p_now
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_expired_count FROM expired;
  IF v_expired_count = 0 THEN RETURN 0; END IF;

  UPDATE public.scenario_runs run
  SET active_lease_count = run.active_lease_count - v_expired_count,
      failure_count = run.failure_count + v_expired_count
  WHERE run.project_id = p_project_id
    AND run.id = p_run_id
    AND run.active_lease_count >= v_expired_count
  RETURNING * INTO v_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario lease counters are inconsistent' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
    'execution_lease_expired', v_system_actor, 'Execution lease expired before settlement.',
    jsonb_build_object('leaseCount', v_expired_count)
  );
  RETURN v_expired_count;
END;
$$;
REVOKE ALL ON FUNCTION private.reclaim_scenario_run_leases(UUID,UUID,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.apply_scenario_run_guardrails(
  p_project_id UUID,
  p_run_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.scenario_runs%ROWTYPE;
  v_definition JSONB;
  v_snapshot_version BIGINT;
  v_reason TEXT;
  v_action TEXT;
  v_status TEXT;
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = p_project_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'running' THEN RETURN false; END IF;
  SELECT version.definition INTO v_definition
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_run.project_id
    AND version.scenario_id = v_run.scenario_id
    AND version.id = v_run.scenario_version_id;

  IF v_run.failure_count >= (v_definition#>>'{guardrails,abortAfterFailures}')::INTEGER
     OR (
       v_run.success_count + v_run.failure_count > 0
       AND v_run.failure_count::BIGINT * 10000 >
         (v_run.success_count + v_run.failure_count)::BIGINT
         * (v_definition#>>'{guardrails,maxErrorRateBasisPoints}')::INTEGER
     )
  THEN
    v_status := 'aborted';
    v_action := 'run_aborted';
    v_reason := 'Scenario guardrail threshold reached.';
  ELSIF v_run.request_count >= (v_definition#>>'{limits,requestCap}')::INTEGER
        AND v_run.active_lease_count = 0
  THEN
    v_status := 'stopped';
    v_action := 'run_stopped';
    v_reason := 'Scenario request cap exhausted.';
  ELSE
    RETURN false;
  END IF;

  UPDATE public.scenario_runs run
  SET status = v_status,
      revision = run.revision + 1,
      stopped_by = v_system_actor,
      stopped_at = p_now,
      stop_reason = v_reason
  WHERE run.project_id = p_project_id AND run.id = p_run_id
  RETURNING * INTO v_run;
  UPDATE public.scenario_environment_states state
  SET snapshot_version = state.snapshot_version + 1, updated_at = p_now
  WHERE state.project_id = v_run.project_id AND state.environment = v_run.environment
  RETURNING state.snapshot_version INTO v_snapshot_version;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
    v_action, v_system_actor, v_reason,
    jsonb_build_object(
      'requestCount', v_run.request_count,
      'successCount', v_run.success_count,
      'failureCount', v_run.failure_count,
      'snapshotVersion', v_snapshot_version
    )
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_scenario_run_guardrails(UUID,UUID,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION register_scenario_target(
  p_key_hash TEXT,
  p_target_key TEXT,
  p_target_kind TEXT,
  p_origin TEXT,
  p_ownership_challenge_hash TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (target_id UUID, status TEXT, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_existing public.scenario_targets%ROWTYPE;
  v_target_id UUID;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_target_key IS NULL OR p_target_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
     OR p_target_kind IS DISTINCT FROM 'miyagi_resilience_probe_v1'
     OR p_origin IS NULL
     OR p_origin !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$'
     OR p_ownership_challenge_hash IS NULL
     OR p_ownership_challenge_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL
     OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario target command' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':scenario-target:' || p_target_key,
    0
  ));
  SELECT target.* INTO v_existing
  FROM public.scenario_targets target
  WHERE target.project_id = v_key.project_id AND target.key = p_target_key;
  IF FOUND THEN
    IF v_existing.target_kind = p_target_kind
       AND v_existing.origin = p_origin
       AND v_existing.ownership_challenge_hash = p_ownership_challenge_hash
    THEN
      RETURN QUERY SELECT v_existing.id, v_existing.status, false;
      RETURN;
    END IF;
    RAISE EXCEPTION 'scenario target key is already registered differently'
      USING ERRCODE = '55000';
  END IF;
  IF (
    SELECT COUNT(*) FROM public.scenario_targets target
    WHERE target.project_id = v_key.project_id
  ) >= 100 THEN
    RAISE EXCEPTION 'scenario target limit reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.scenario_targets(
    project_id, key, target_kind, origin, ownership_challenge_hash, created_by
  ) VALUES (
    v_key.project_id, p_target_key, p_target_kind, p_origin,
    p_ownership_challenge_hash, v_key.flag_actor_user_id
  ) RETURNING id INTO v_target_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, target_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_target_id, 'target_registered', v_key.flag_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_target_id, 'pending'::TEXT, true;
END;
$$;

CREATE OR REPLACE FUNCTION verify_scenario_target(
  p_key_hash TEXT,
  p_target_id UUID,
  p_expected_challenge_hash TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (target_id UUID, status TEXT, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_target public.scenario_targets%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_expected_challenge_hash IS NULL OR p_expected_challenge_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL
     OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario target verification' USING ERRCODE = '22023';
  END IF;
  SELECT target.* INTO v_target
  FROM public.scenario_targets target
  WHERE target.project_id = v_key.project_id AND target.id = p_target_id
  FOR UPDATE;
  IF NOT FOUND OR v_target.ownership_challenge_hash <> p_expected_challenge_hash THEN RETURN; END IF;
  IF v_target.status = 'revoked' THEN
    RAISE EXCEPTION 'revoked scenario target cannot be verified' USING ERRCODE = '55000';
  END IF;
  IF v_target.status = 'verified' THEN
    RETURN QUERY SELECT v_target.id, v_target.status, false;
    RETURN;
  END IF;
  UPDATE public.scenario_targets
  SET status = 'verified', verified_by = v_key.flag_actor_user_id, verified_at = now()
  WHERE id = v_target.id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, target_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_target.id, 'target_verified', v_key.flag_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_target.id, 'verified'::TEXT, true;
END;
$$;

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
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_target public.scenario_targets%ROWTYPE;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario target revocation' USING ERRCODE = '22023';
  END IF;
  SELECT target.* INTO v_target
  FROM public.scenario_targets target
  WHERE target.project_id = v_key.project_id AND target.id = p_target_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_target.status = 'revoked' THEN
    RETURN QUERY SELECT v_target.id, v_target.status, false;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.scenario_runs run
    WHERE run.project_id = v_key.project_id AND run.target_id = v_target.id
      AND run.status = 'running'
  ) THEN
    RAISE EXCEPTION 'stop the active scenario before revoking its target' USING ERRCODE = '55000';
  END IF;
  UPDATE public.scenario_targets
  SET status = 'revoked', revoked_by = v_key.flag_actor_user_id, revoked_at = now()
  WHERE id = v_target.id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, target_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_target.id, 'target_revoked', v_key.flag_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_target.id, 'revoked'::TEXT, true;
END;
$$;

CREATE OR REPLACE FUNCTION create_scenario_definition_version(
  p_key_hash TEXT,
  p_scenario_key TEXT,
  p_definition JSONB,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (
  scenario_id UUID,
  scenario_version_id UUID,
  version INTEGER,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_scenario_id UUID;
  v_version_id UUID;
  v_version INTEGER;
  v_target_id UUID;
  v_flag_id UUID;
  v_flag_version_id UUID;
  v_experiment_id UUID;
  v_experiment_version_id UUID;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_scenario_key IS NULL OR p_scenario_key !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR NOT private.scenario_definition_is_valid(p_definition)
     OR p_definition->>'environment' <> v_key.flag_environment
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario definition command' USING ERRCODE = '22023';
  END IF;

  SELECT target.id INTO v_target_id
  FROM public.scenario_targets target
  WHERE target.project_id = v_key.project_id
    AND target.key = p_definition->>'targetKey'
    AND target.status = 'verified';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario target is not verified' USING ERRCODE = '22023';
  END IF;
  SELECT registry.id, version.id INTO v_flag_id, v_flag_version_id
  FROM public.flag_registries registry
  JOIN public.flag_definition_versions version
    ON version.project_id = registry.project_id AND version.flag_id = registry.id
  WHERE registry.project_id = v_key.project_id
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
    WHERE registry.project_id = v_key.project_id
      AND registry.key = p_definition#>>'{experiment,key}'
      AND version.version = (p_definition#>>'{experiment,definitionVersion}')::INTEGER;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scenario experiment version does not exist' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.experiment_flag_version_bindings binding
      WHERE binding.project_id = v_key.project_id
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
    v_key.project_id::TEXT || ':scenario:' || p_scenario_key,
    0
  ));
  SELECT registry.id INTO v_scenario_id
  FROM public.scenario_registries registry
  WHERE registry.project_id = v_key.project_id AND registry.key = p_scenario_key
  FOR UPDATE;
  IF v_scenario_id IS NULL THEN
    IF (
      SELECT COUNT(*) FROM public.scenario_registries registry
      WHERE registry.project_id = v_key.project_id
    ) >= 100 THEN
      RAISE EXCEPTION 'scenario registry limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO public.scenario_registries(project_id, key, created_by)
    VALUES (v_key.project_id, p_scenario_key, v_key.flag_actor_user_id)
    RETURNING id INTO v_scenario_id;
  END IF;
  SELECT existing.id, existing.version INTO v_version_id, v_version
  FROM public.scenario_definition_versions existing
  WHERE existing.project_id = v_key.project_id
    AND existing.scenario_id = v_scenario_id
    AND existing.definition = p_definition;
  IF FOUND THEN
    RETURN QUERY SELECT v_scenario_id, v_version_id, v_version, false;
    RETURN;
  END IF;
  SELECT COALESCE(max(candidate.version), 0) + 1 INTO v_version
  FROM public.scenario_definition_versions candidate
  WHERE candidate.project_id = v_key.project_id AND candidate.scenario_id = v_scenario_id;
  INSERT INTO public.scenario_definition_versions(
    project_id, scenario_id, version, definition, target_id,
    flag_id, flag_version_id, experiment_id, experiment_version_id, created_by
  ) VALUES (
    v_key.project_id, v_scenario_id, v_version, p_definition, v_target_id,
    v_flag_id, v_flag_version_id, v_experiment_id, v_experiment_version_id,
    v_key.flag_actor_user_id
  ) RETURNING id INTO v_version_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    v_key.project_id, v_scenario_id, v_version_id, v_target_id,
    'version_created', v_key.flag_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('version', v_version, 'kind', p_definition->>'kind')
  );
  RETURN QUERY SELECT v_scenario_id, v_version_id, v_version, true;
END;
$$;

CREATE OR REPLACE FUNCTION approve_scenario_definition(
  p_key_hash TEXT,
  p_scenario_version_id UUID,
  p_approval_kind TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (approval_id UUID, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_version public.scenario_definition_versions%ROWTYPE;
  v_approval_id UUID;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_approval_kind NOT IN ('external_cohort', 'production_security')
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario approval command' USING ERRCODE = '22023';
  END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_key.project_id AND version.id = p_scenario_version_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF (p_approval_kind = 'external_cohort' AND v_version.definition->>'cohort' <> 'external')
     OR (
       p_approval_kind = 'production_security'
       AND NOT (
         v_version.definition->>'kind' = 'security'
         AND v_version.definition->>'environment' = 'production'
       )
     )
  THEN
    RAISE EXCEPTION 'approval does not apply to this scenario' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.scenario_owner_approvals(
    project_id, scenario_id, scenario_version_id, approval_kind,
    actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_version.scenario_id, v_version.id, p_approval_kind,
    v_key.flag_actor_user_id, p_external_actor_id, p_reason
  ) ON CONFLICT (scenario_version_id, approval_kind) DO NOTHING
  RETURNING id INTO v_approval_id;
  IF v_approval_id IS NULL THEN
    SELECT approval.id INTO v_approval_id
    FROM public.scenario_owner_approvals approval
    WHERE approval.scenario_version_id = v_version.id
      AND approval.approval_kind = p_approval_kind;
    RETURN QUERY SELECT v_approval_id, false;
    RETURN;
  END IF;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    v_key.project_id, v_version.scenario_id, v_version.id, v_version.target_id,
    'owner_approved', v_key.flag_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('approvalKind', p_approval_kind)
  );
  RETURN QUERY SELECT v_approval_id, true;
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
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_version public.scenario_definition_versions%ROWTYPE;
  v_run_id UUID;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario run command' USING ERRCODE = '22023';
  END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_key.project_id
    AND version.id = p_scenario_version_id
    AND version.definition->>'environment' = v_key.flag_environment;
  IF NOT FOUND THEN RETURN; END IF;
  IF (
    SELECT COUNT(*) FROM public.scenario_runs run
    WHERE run.project_id = v_key.project_id
      AND run.environment = v_key.flag_environment
  ) >= 1000 THEN
    RAISE EXCEPTION 'scenario run history limit reached' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_key.project_id, v_key.flag_environment)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.scenario_runs(
    project_id, scenario_id, scenario_version_id, target_id, environment, created_by
  ) VALUES (
    v_key.project_id, v_version.scenario_id, v_version.id, v_version.target_id,
    v_key.flag_environment, v_key.flag_actor_user_id
  ) RETURNING id INTO v_run_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_version.scenario_id, v_version.id, v_run_id, v_version.target_id,
    'run_created', v_key.flag_actor_user_id, p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_run_id, 1::BIGINT, true;
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
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_run public.scenario_runs%ROWTYPE;
  v_version public.scenario_definition_versions%ROWTYPE;
  v_snapshot_version BIGINT;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_active_count INTEGER;
  v_projected_bytes BIGINT;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario start command' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':scenario-run:' || p_run_id::TEXT,
    0
  ));
  PERFORM private.expire_scenario_runs(v_key.project_id, v_key.flag_environment, v_now);
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_run.status = 'running' THEN
    SELECT state.snapshot_version INTO v_snapshot_version
    FROM public.scenario_environment_states state
    WHERE state.project_id = v_key.project_id AND state.environment = v_run.environment;
    RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, false;
    RETURN;
  END IF;
  IF v_run.revision <> p_expected_revision THEN
    -- P0001 is an application conflict. SQLSTATE 40001 makes PostgREST treat a stale browser
    -- revision as a retryable transaction and can hold the request open. Check after the
    -- idempotent running-state return so a lost successful response can be retried safely.
    RAISE EXCEPTION 'scenario run revision conflict' USING ERRCODE = 'P0001';
  END IF;
  IF v_run.status <> 'draft' THEN
    RAISE EXCEPTION 'scenario run cannot be restarted' USING ERRCODE = '55000';
  END IF;
  SELECT version.* INTO v_version
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_key.project_id AND version.id = v_run.scenario_version_id;
  IF v_version.definition->>'environment' <> v_key.flag_environment
     OR v_now < (v_version.definition->>'startAt')::TIMESTAMPTZ
     OR v_now >= (v_version.definition->>'expiresAt')::TIMESTAMPTZ
  THEN
    RAISE EXCEPTION 'scenario is outside its active window' USING ERRCODE = '55000';
  END IF;
  IF v_version.definition->>'cohort' = 'external' AND NOT EXISTS (
    SELECT 1 FROM public.scenario_owner_approvals approval
    WHERE approval.project_id = v_key.project_id
      AND approval.scenario_version_id = v_version.id
      AND approval.approval_kind = 'external_cohort'
  ) THEN
    RAISE EXCEPTION 'external scenario requires owner approval' USING ERRCODE = '42501';
  END IF;
  IF v_version.definition->>'kind' = 'security'
     AND v_version.definition->>'environment' = 'production'
     AND NOT EXISTS (
       SELECT 1 FROM public.scenario_owner_approvals approval
       WHERE approval.project_id = v_key.project_id
         AND approval.scenario_version_id = v_version.id
         AND approval.approval_kind = 'production_security'
     )
  THEN
    RAISE EXCEPTION 'production security scenario requires owner approval' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scenario_targets target
    WHERE target.project_id = v_key.project_id AND target.id = v_run.target_id
      AND target.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'scenario target is not verified' USING ERRCODE = '55000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':scenario-target:' || v_run.environment || ':' || v_run.target_id::TEXT,
    0
  ));
  IF EXISTS (
    SELECT 1 FROM public.scenario_runs active
    WHERE active.project_id = v_key.project_id
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
    WHERE active.project_id = v_key.project_id
      AND active.environment = v_run.environment
      AND active.status = 'running'
      AND active_version.definition->>'kind' = 'resilience';
    SELECT v_projected_bytes
      + octet_length(v_version.definition::TEXT)
      + octet_length(flag_version.definition::TEXT)
      + 2048
    INTO v_projected_bytes
    FROM public.flag_definition_versions flag_version
    WHERE flag_version.project_id = v_key.project_id
      AND flag_version.flag_id = v_version.flag_id
      AND flag_version.id = v_version.flag_version_id;
    IF v_active_count >= 50 OR v_projected_bytes > 240000 THEN
      RAISE EXCEPTION 'scenario snapshot capacity reached' USING ERRCODE = '54000';
    END IF;
  END IF;

  UPDATE public.scenario_runs run
  SET status = 'running', revision = run.revision + 1,
      started_by = v_key.flag_actor_user_id, started_at = v_now
  WHERE run.project_id = v_key.project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  UPDATE public.scenario_environment_states state
  SET snapshot_version = state.snapshot_version + 1, updated_at = v_now
  WHERE state.project_id = v_key.project_id AND state.environment = v_run.environment
  RETURNING state.snapshot_version INTO v_snapshot_version;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id,
    v_run.target_id, 'run_started', v_key.flag_actor_user_id, p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, true;
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
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_run public.scenario_runs%ROWTYPE;
  v_snapshot_version BIGINT;
  v_status TEXT;
  v_action TEXT;
  v_cancelled_leases INTEGER;
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_transition NOT IN ('stop', 'abort')
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid scenario transition command' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_run.status IN ('stopped', 'aborted', 'expired') THEN
    SELECT state.snapshot_version INTO v_snapshot_version
    FROM public.scenario_environment_states state
    WHERE state.project_id = v_key.project_id AND state.environment = v_run.environment;
    RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, false;
    RETURN;
  END IF;
  IF v_run.revision <> p_expected_revision THEN
    -- Terminal-state retries are idempotent even when the successful first transition advanced
    -- the revision beyond the caller's last observed value.
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
    WHERE lease.project_id = v_key.project_id
      AND lease.run_id = v_run.id
      AND lease.status = 'active'
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_cancelled_leases FROM cancelled;
  UPDATE public.scenario_runs run
  SET status = v_status, revision = run.revision + 1,
      active_lease_count = 0,
      failure_count = run.failure_count + v_cancelled_leases,
      stopped_by = v_key.flag_actor_user_id, stopped_at = v_now, stop_reason = p_reason
  WHERE run.project_id = v_key.project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  UPDATE public.scenario_environment_states state
  SET snapshot_version = state.snapshot_version + 1, updated_at = v_now
  WHERE state.project_id = v_key.project_id AND state.environment = v_run.environment
  RETURNING state.snapshot_version INTO v_snapshot_version;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, external_actor_id, reason, metadata
  ) VALUES (
    v_key.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id,
    v_run.target_id, v_action, v_key.flag_actor_user_id, p_external_actor_id, p_reason,
    jsonb_build_object('cancelledLeaseCount', v_cancelled_leases)
  );
  RETURN QUERY SELECT v_run.id, v_run.revision, v_snapshot_version, true;
END;
$$;

CREATE OR REPLACE FUNCTION get_scenario_admin_snapshot(p_key_hash TEXT)
RETURNS TABLE (
  environment TEXT,
  snapshot_version BIGINT,
  generated_at TIMESTAMPTZ,
  targets JSONB,
  versions JSONB,
  approvals JSONB,
  runs JSONB,
  audit JSONB
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_snapshot_version BIGINT;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_key.project_id, v_key.flag_environment)
  ON CONFLICT DO NOTHING;
  PERFORM private.expire_scenario_runs(v_key.project_id, v_key.flag_environment, v_now);
  SELECT state.snapshot_version INTO v_snapshot_version
  FROM public.scenario_environment_states state
  WHERE state.project_id = v_key.project_id AND state.environment = v_key.flag_environment;

  RETURN QUERY SELECT
    v_key.flag_environment,
    v_snapshot_version,
    v_now,
    COALESCE((
      SELECT jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id)
      FROM (
        SELECT target.id, target.created_at, jsonb_build_object(
          'id', target.id,
          'key', target.key,
          'targetKind', target.target_kind,
          'origin', target.origin,
          'status', target.status,
          'createdAt', target.created_at,
          'verifiedAt', target.verified_at,
          'revokedAt', target.revoked_at
        ) AS payload
        FROM public.scenario_targets target
        WHERE target.project_id = v_key.project_id
        ORDER BY target.created_at DESC, target.id
        LIMIT 100
      ) item
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id)
      FROM (
        SELECT version.id, version.created_at, jsonb_build_object(
          'scenarioId', version.scenario_id,
          'scenarioVersionId', version.id,
          'scenarioKey', registry.key,
          'version', version.version,
          'definition', version.definition,
          'createdAt', version.created_at
        ) AS payload
        FROM public.scenario_definition_versions version
        JOIN public.scenario_registries registry
          ON registry.project_id = version.project_id AND registry.id = version.scenario_id
        WHERE version.project_id = v_key.project_id
          AND version.definition->>'environment' = v_key.flag_environment
        ORDER BY version.created_at DESC, version.id
        LIMIT 50
      ) item
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id)
      FROM (
        SELECT approval.id, approval.created_at, jsonb_build_object(
          'id', approval.id,
          'scenarioVersionId', approval.scenario_version_id,
          'approvalKind', approval.approval_kind,
          'actorUserId', approval.actor_user_id,
          'externalActorId', approval.external_actor_id,
          'reason', approval.reason,
          'createdAt', approval.created_at
        ) AS payload
        FROM public.scenario_owner_approvals approval
        JOIN public.scenario_definition_versions version
          ON version.project_id = approval.project_id
         AND version.scenario_id = approval.scenario_id
         AND version.id = approval.scenario_version_id
        WHERE approval.project_id = v_key.project_id
          AND version.definition->>'environment' = v_key.flag_environment
        ORDER BY approval.created_at DESC, approval.id
        LIMIT 100
      ) item
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id)
      FROM (
        SELECT run.id, run.created_at, jsonb_build_object(
          'id', run.id,
          'scenarioId', run.scenario_id,
          'scenarioVersionId', run.scenario_version_id,
          'targetId', run.target_id,
          'status', run.status,
          'revision', run.revision,
          'requestCount', run.request_count,
          'activeLeaseCount', run.active_lease_count,
          'successCount', run.success_count,
          'failureCount', run.failure_count,
          'createdAt', run.created_at,
          'startedAt', run.started_at,
          'stoppedAt', run.stopped_at,
          'stopReason', run.stop_reason
        ) AS payload
        FROM public.scenario_runs run
        WHERE run.project_id = v_key.project_id
          AND run.environment = v_key.flag_environment
        ORDER BY run.created_at DESC, run.id
        LIMIT 100
      ) item
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id)
      FROM (
        SELECT entry.id, entry.created_at, jsonb_build_object(
          'id', entry.id,
          'scenarioId', entry.scenario_id,
          'scenarioVersionId', entry.scenario_version_id,
          'runId', entry.run_id,
          'targetId', entry.target_id,
          'action', entry.action,
          'actorUserId', entry.actor_user_id,
          'externalActorId', entry.external_actor_id,
          'reason', entry.reason,
          'metadata', entry.metadata,
          'createdAt', entry.created_at
        ) AS payload
        FROM public.scenario_lifecycle_audit entry
        WHERE entry.project_id = v_key.project_id
          AND (
            entry.scenario_version_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.scenario_definition_versions version
              WHERE version.project_id = entry.project_id
                AND version.id = entry.scenario_version_id
                AND version.definition->>'environment' = v_key.flag_environment
            )
          )
        ORDER BY entry.created_at DESC, entry.id
        LIMIT 100
      ) item
    ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION get_scenario_read_snapshot(p_key_hash TEXT)
RETURNS TABLE (
  environment TEXT,
  snapshot_version BIGINT,
  generated_at TIMESTAMPTZ,
  scenarios JSONB
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_environment TEXT;
  v_snapshot_version BIGINT;
  v_scenarios JSONB;
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  SELECT key.project_id, key.flag_environment
  INTO v_project_id, v_environment
  FROM public.active_flag_read_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_project_id, v_environment)
  ON CONFLICT DO NOTHING;
  PERFORM private.expire_scenario_runs(v_project_id, v_environment, v_now);

  SELECT state.snapshot_version INTO v_snapshot_version
  FROM public.scenario_environment_states state
  WHERE state.project_id = v_project_id AND state.environment = v_environment;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'scenarioKey', registry.key,
      'scenarioVersion', version.version,
      'runId', run.id,
      'runRevision', run.revision,
      'targetKey', target.key,
      'cohort', version.definition->>'cohort',
      'startAt', version.definition->>'startAt',
      'expiresAt', version.definition->>'expiresAt',
      'limits', version.definition->'limits',
      'guardrails', version.definition->'guardrails',
      'flag', jsonb_build_object(
        'key', flag_registry.key,
        'definitionVersion', flag_version.version,
        'definition', flag_version.definition
      )
    ) || CASE WHEN experiment_registry.id IS NULL THEN '{}'::JSONB ELSE jsonb_build_object(
      'experiment', jsonb_build_object(
        'key', experiment_registry.key,
        'definitionVersion', experiment_version.version
      )
    ) END ORDER BY registry.key
  ) FILTER (WHERE run.id IS NOT NULL), '[]'::JSONB)
  INTO v_scenarios
  FROM public.scenario_runs run
  JOIN public.scenario_definition_versions version
    ON version.project_id = run.project_id AND version.id = run.scenario_version_id
  JOIN public.scenario_registries registry
    ON registry.project_id = version.project_id AND registry.id = version.scenario_id
  JOIN public.scenario_targets target
    ON target.project_id = version.project_id AND target.id = version.target_id
  JOIN public.flag_definition_versions flag_version
    ON flag_version.project_id = version.project_id AND flag_version.id = version.flag_version_id
  JOIN public.flag_registries flag_registry
    ON flag_registry.project_id = flag_version.project_id AND flag_registry.id = flag_version.flag_id
  LEFT JOIN public.experiment_definition_versions experiment_version
    ON experiment_version.project_id = version.project_id
    AND experiment_version.id = version.experiment_version_id
  LEFT JOIN public.experiment_registries experiment_registry
    ON experiment_registry.project_id = experiment_version.project_id
    AND experiment_registry.id = experiment_version.experiment_id
  WHERE run.project_id = v_project_id
    AND run.environment = v_environment
    AND run.status = 'running'
    AND version.definition->>'kind' = 'resilience'
    AND (version.definition->>'startAt')::TIMESTAMPTZ <= v_now
    AND (version.definition->>'expiresAt')::TIMESTAMPTZ > v_now
    AND target.status = 'verified';

  RETURN QUERY SELECT v_environment, v_snapshot_version, v_now, v_scenarios;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_scenario_execution(
  p_key_hash TEXT,
  p_run_id UUID,
  p_expected_run_revision BIGINT
)
RETURNS TABLE (
  lease_id UUID,
  run_revision BIGINT,
  expires_at TIMESTAMPTZ,
  admitted BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_environment TEXT;
  v_run public.scenario_runs%ROWTYPE;
  v_definition JSONB;
  v_lease_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  SELECT key.project_id, key.flag_environment
  INTO v_project_id, v_environment
  FROM public.active_flag_read_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_run_id IS NULL OR p_expected_run_revision IS NULL OR p_expected_run_revision < 1 THEN
    RAISE EXCEPTION 'invalid scenario execution reservation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_project_id, v_environment)
  ON CONFLICT DO NOTHING;
  PERFORM private.expire_scenario_runs(v_project_id, v_environment, v_now);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_project_id::TEXT || ':scenario-execution:' || p_run_id::TEXT,
    0
  ));
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_project_id
    AND run.environment = v_environment
    AND run.id = p_run_id
  FOR UPDATE;
  -- Foreign-tenant and nonexistent run identifiers are deliberately indistinguishable.
  IF NOT FOUND THEN RETURN; END IF;
  SELECT version.definition INTO v_definition
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_run.project_id
    AND version.scenario_id = v_run.scenario_id
    AND version.id = v_run.scenario_version_id;
  IF v_run.revision <> p_expected_run_revision THEN
    RETURN QUERY SELECT NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false, 'STALE_REVISION'::TEXT;
    RETURN;
  END IF;
  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false, 'INACTIVE'::TEXT;
    RETURN;
  END IF;

  PERFORM private.reclaim_scenario_run_leases(v_project_id, v_run.id, v_now);
  PERFORM private.apply_scenario_run_guardrails(v_project_id, v_run.id, v_now);
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_project_id AND run.id = p_run_id;
  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false, 'INACTIVE'::TEXT;
    RETURN;
  END IF;
  IF v_run.request_count >= (v_definition#>>'{limits,requestCap}')::INTEGER THEN
    RETURN QUERY SELECT NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false, 'REQUEST_CAP'::TEXT;
    RETURN;
  END IF;
  IF v_run.active_lease_count >= (v_definition#>>'{limits,concurrencyCap}')::INTEGER THEN
    RETURN QUERY SELECT NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false, 'CONCURRENCY_CAP'::TEXT;
    RETURN;
  END IF;

  v_expires_at := LEAST(
    v_now + make_interval(
      secs => (v_definition#>>'{limits,leaseTtlSeconds}')::INTEGER
    ),
    (v_definition->>'expiresAt')::TIMESTAMPTZ
  );
  INSERT INTO public.scenario_run_leases(project_id, run_id, expires_at)
  VALUES (v_project_id, v_run.id, v_expires_at)
  RETURNING id INTO v_lease_id;
  UPDATE public.scenario_runs run
  SET request_count = run.request_count + 1,
      active_lease_count = run.active_lease_count + 1
  WHERE run.project_id = v_project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
    'execution_reserved', v_system_actor, 'Bounded scenario execution reserved.',
    jsonb_build_object('leaseId', v_lease_id, 'expiresAt', v_expires_at)
  );
  RETURN QUERY SELECT v_lease_id, v_run.revision, v_expires_at, true, 'ADMITTED'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION settle_scenario_execution(
  p_key_hash TEXT,
  p_run_id UUID,
  p_lease_id UUID,
  p_succeeded BOOLEAN
)
RETURNS TABLE (
  lease_id UUID,
  run_revision BIGINT,
  run_status TEXT,
  active_lease_count INTEGER,
  success_count INTEGER,
  failure_count INTEGER,
  settled BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_environment TEXT;
  v_run public.scenario_runs%ROWTYPE;
  v_lease public.scenario_run_leases%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_outcome TEXT;
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  SELECT key.project_id, key.flag_environment
  INTO v_project_id, v_environment
  FROM public.active_flag_read_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_run_id IS NULL OR p_lease_id IS NULL OR p_succeeded IS NULL THEN
    RAISE EXCEPTION 'invalid scenario execution settlement' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_project_id::TEXT || ':scenario-execution:' || p_run_id::TEXT,
    0
  ));
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_project_id
    AND run.environment = v_environment
    AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lease.* INTO v_lease
  FROM public.scenario_run_leases lease
  WHERE lease.project_id = v_project_id
    AND lease.run_id = p_run_id
    AND lease.id = p_lease_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_lease.status <> 'active' THEN
    RETURN QUERY SELECT
      v_lease.id, v_run.revision, v_run.status, v_run.active_lease_count,
      v_run.success_count, v_run.failure_count, false, 'ALREADY_SETTLED'::TEXT;
    RETURN;
  END IF;

  IF v_lease.expires_at <= v_now THEN
    UPDATE public.scenario_run_leases lease
    SET status = 'expired', outcome = 'lease_expired', settled_at = v_now
    WHERE lease.project_id = v_project_id AND lease.id = v_lease.id;
    UPDATE public.scenario_runs run
    SET active_lease_count = run.active_lease_count - 1,
        failure_count = run.failure_count + 1
    WHERE run.project_id = v_project_id
      AND run.id = v_run.id
      AND run.active_lease_count > 0
    RETURNING * INTO v_run;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scenario lease counters are inconsistent' USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.scenario_lifecycle_audit(
      project_id, scenario_id, scenario_version_id, run_id, target_id,
      action, actor_user_id, reason, metadata
    ) VALUES (
      v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
      'execution_lease_expired', v_system_actor, 'Execution lease expired before settlement.',
      jsonb_build_object('leaseId', v_lease.id)
    );
    PERFORM private.apply_scenario_run_guardrails(v_project_id, v_run.id, v_now);
    SELECT run.* INTO v_run FROM public.scenario_runs run
    WHERE run.project_id = v_project_id AND run.id = p_run_id;
    RETURN QUERY SELECT
      v_lease.id, v_run.revision, v_run.status, v_run.active_lease_count,
      v_run.success_count, v_run.failure_count, false, 'LEASE_EXPIRED'::TEXT;
    RETURN;
  END IF;

  v_outcome := CASE WHEN p_succeeded THEN 'success' ELSE 'failure' END;
  UPDATE public.scenario_run_leases lease
  SET status = 'settled', outcome = v_outcome, settled_at = v_now
  WHERE lease.project_id = v_project_id AND lease.id = v_lease.id;
  UPDATE public.scenario_runs run
  SET active_lease_count = run.active_lease_count - 1,
      success_count = run.success_count + CASE WHEN p_succeeded THEN 1 ELSE 0 END,
      failure_count = run.failure_count + CASE WHEN p_succeeded THEN 0 ELSE 1 END
  WHERE run.project_id = v_project_id
    AND run.id = v_run.id
    AND run.active_lease_count > 0
  RETURNING * INTO v_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario lease counters are inconsistent' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  ) VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id, v_run.id, v_run.target_id,
    'execution_settled', v_system_actor, 'Bounded scenario execution settled.',
    jsonb_build_object('leaseId', v_lease.id, 'outcome', v_outcome)
  );
  PERFORM private.apply_scenario_run_guardrails(v_project_id, v_run.id, v_now);
  SELECT run.* INTO v_run FROM public.scenario_runs run
  WHERE run.project_id = v_project_id AND run.id = p_run_id;
  RETURN QUERY SELECT
    v_lease.id, v_run.revision, v_run.status, v_run.active_lease_count,
    v_run.success_count, v_run.failure_count, true, 'SETTLED'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION
  register_scenario_target(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT),
  verify_scenario_target(TEXT,UUID,TEXT,TEXT,TEXT),
  revoke_scenario_target(TEXT,UUID,TEXT,TEXT),
  create_scenario_definition_version(TEXT,TEXT,JSONB,TEXT,TEXT),
  approve_scenario_definition(TEXT,UUID,TEXT,TEXT,TEXT),
  create_scenario_run(TEXT,UUID,TEXT,TEXT),
  start_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT),
  transition_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT,TEXT),
  get_scenario_admin_snapshot(TEXT),
  get_scenario_read_snapshot(TEXT),
  reserve_scenario_execution(TEXT,UUID,BIGINT),
  settle_scenario_execution(TEXT,UUID,UUID,BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  register_scenario_target(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT),
  verify_scenario_target(TEXT,UUID,TEXT,TEXT,TEXT),
  revoke_scenario_target(TEXT,UUID,TEXT,TEXT),
  create_scenario_definition_version(TEXT,TEXT,JSONB,TEXT,TEXT),
  approve_scenario_definition(TEXT,UUID,TEXT,TEXT,TEXT),
  create_scenario_run(TEXT,UUID,TEXT,TEXT),
  start_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT),
  transition_scenario_run(TEXT,UUID,BIGINT,TEXT,TEXT,TEXT),
  get_scenario_admin_snapshot(TEXT),
  get_scenario_read_snapshot(TEXT),
  reserve_scenario_execution(TEXT,UUID,BIGINT),
  settle_scenario_execution(TEXT,UUID,UUID,BOOLEAN)
TO service_role;

-- Migration-time privilege proof. Checking statements is insufficient because PostgreSQL gives new
-- functions PUBLIC EXECUTE by default; assert the effective function privilege for both request
-- roles and the one intended server-side caller.
DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.register_scenario_target(text,text,text,text,text,text,text)',
    'public.verify_scenario_target(text,uuid,text,text,text)',
    'public.revoke_scenario_target(text,uuid,text,text)',
    'public.create_scenario_definition_version(text,text,jsonb,text,text)',
    'public.approve_scenario_definition(text,uuid,text,text,text)',
    'public.create_scenario_run(text,uuid,text,text)',
    'public.start_scenario_run(text,uuid,bigint,text,text)',
    'public.transition_scenario_run(text,uuid,bigint,text,text,text)',
    'public.get_scenario_admin_snapshot(text)',
    'public.get_scenario_read_snapshot(text)',
    'public.reserve_scenario_execution(text,uuid,bigint)',
    'public.settle_scenario_execution(text,uuid,uuid,boolean)'
  ]
  LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'scenario function privilege boundary failed for %', v_signature;
    END IF;
  END LOOP;
END;
$$;
