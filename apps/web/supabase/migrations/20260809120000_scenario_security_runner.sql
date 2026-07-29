-- flag-serving-and-prd-g · Sprint 3, Story 3.3 — closed defensive-simulation
-- reservations and immutable results. The caller supplies only a run id and its
-- observed HTTP statuses. Project/environment/target/template/request count are
-- derived from the revocable flag_admin credential and immutable scenario row.

ALTER TABLE scenario_run_leases
  ADD COLUMN request_units SMALLINT NOT NULL DEFAULT 1
  CHECK (request_units BETWEEN 1 AND 3);

CREATE TABLE scenario_security_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  scenario_id         UUID        NOT NULL,
  scenario_version_id UUID        NOT NULL,
  run_id              UUID        NOT NULL,
  lease_id            UUID        NOT NULL,
  target_id           UUID        NOT NULL,
  template            TEXT        NOT NULL CHECK (template IN (
    'malformed_payload_v1',
    'rate_limit_v1',
    'invalid_credential_v1',
    'revoked_credential_v1'
  )),
  expected_outcome    TEXT        NOT NULL CHECK (expected_outcome IN (
    'validation_rejected',
    'rate_limited',
    'credential_rejected',
    'revoked_credential_rejected'
  )),
  observed_outcome    TEXT        NOT NULL CHECK (observed_outcome IN (
    'validation_rejected',
    'rate_limited',
    'credential_rejected',
    'revoked_credential_rejected',
    'unexpected_response',
    'transport_failure'
  )),
  observed_statuses   SMALLINT[]  NOT NULL CHECK (
    cardinality(observed_statuses) BETWEEN 1 AND 3
  ),
  succeeded           BOOLEAN     NOT NULL,
  latency_ms          INTEGER     NOT NULL CHECK (latency_ms BETWEEN 0 AND 15000),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scenario_security_results_run_fk
    FOREIGN KEY (project_id, run_id)
    REFERENCES scenario_runs(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_security_results_lease_fk
    FOREIGN KEY (project_id, lease_id)
    REFERENCES scenario_run_leases(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_security_results_target_fk
    FOREIGN KEY (project_id, target_id)
    REFERENCES scenario_targets(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_security_results_version_fk
    FOREIGN KEY (project_id, scenario_id, scenario_version_id, target_id)
    REFERENCES scenario_definition_versions(
      project_id, scenario_id, id, target_id
    ) ON DELETE CASCADE,
  UNIQUE (project_id, lease_id),
  UNIQUE (project_id, id)
);
CREATE INDEX scenario_security_results_project_created_idx
  ON scenario_security_results(project_id, created_at DESC);
CREATE INDEX scenario_security_results_run_created_idx
  ON scenario_security_results(project_id, run_id, created_at DESC);

ALTER TABLE scenario_security_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scenario_security_results
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE scenario_security_results TO service_role;

CREATE OR REPLACE FUNCTION private.forbid_scenario_security_result_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'scenario security results are immutable'
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION private.forbid_scenario_security_result_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER scenario_security_results_immutable_trg
  BEFORE UPDATE OR DELETE ON scenario_security_results
  FOR EACH ROW
  EXECUTE FUNCTION private.forbid_scenario_security_result_mutation();

ALTER TABLE scenario_lifecycle_audit
  DROP CONSTRAINT scenario_lifecycle_audit_action_check;
ALTER TABLE scenario_lifecycle_audit
  ADD CONSTRAINT scenario_lifecycle_audit_action_check CHECK (action IN (
    'target_registered', 'target_verified', 'target_revoked',
    'version_created', 'owner_approved',
    'run_created', 'run_started', 'run_stopped', 'run_aborted', 'run_expired',
    'execution_reserved', 'execution_settled', 'execution_lease_expired',
    'security_result_recorded'
  ));

CREATE OR REPLACE FUNCTION reserve_security_scenario_execution(
  p_key_hash TEXT,
  p_run_id UUID,
  p_expected_run_revision BIGINT
)
RETURNS TABLE (
  lease_id UUID,
  run_revision BIGINT,
  expires_at TIMESTAMPTZ,
  admitted BOOLEAN,
  reason TEXT,
  target_key TEXT,
  target_origin TEXT,
  template TEXT,
  request_units SMALLINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_run public.scenario_runs%ROWTYPE;
  v_definition JSONB;
  v_target public.scenario_targets%ROWTYPE;
  v_template TEXT;
  v_request_units SMALLINT;
  v_lease_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  SELECT * INTO v_key
  FROM public.active_flag_admin_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_run_id IS NULL
     OR p_expected_run_revision IS NULL
     OR p_expected_run_revision < 1 THEN
    RAISE EXCEPTION 'invalid security scenario execution reservation'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_key.project_id, v_key.flag_environment)
  ON CONFLICT DO NOTHING;
  PERFORM private.expire_scenario_runs(
    v_key.project_id, v_key.flag_environment, v_now
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':scenario-execution:' || p_run_id::TEXT,
    0
  ));

  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id
    AND run.environment = v_key.flag_environment
    AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT version.definition
  INTO v_definition
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_run.project_id
    AND version.scenario_id = v_run.scenario_id
    AND version.id = v_run.scenario_version_id;
  SELECT target.*
  INTO v_target
  FROM public.scenario_targets target
  WHERE target.project_id = v_run.project_id
    AND target.id = v_run.target_id;
  IF NOT FOUND
     OR v_definition->>'kind' <> 'security'
     OR v_target.status <> 'verified' THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'INACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::SMALLINT;
    RETURN;
  END IF;

  v_template := v_definition->>'securityTemplate';
  v_request_units := CASE v_template
    WHEN 'rate_limit_v1' THEN 3
    WHEN 'malformed_payload_v1' THEN 1
    WHEN 'invalid_credential_v1' THEN 1
    WHEN 'revoked_credential_v1' THEN 1
    ELSE NULL
  END;
  IF v_request_units IS NULL THEN
    RAISE EXCEPTION 'stored security scenario template is invalid'
      USING ERRCODE = '55000';
  END IF;

  IF v_run.revision <> p_expected_run_revision THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'STALE_REVISION'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::SMALLINT;
    RETURN;
  END IF;
  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'INACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::SMALLINT;
    RETURN;
  END IF;

  PERFORM private.reclaim_scenario_run_leases(
    v_key.project_id, v_run.id, v_now
  );
  PERFORM private.apply_scenario_run_guardrails(
    v_key.project_id, v_run.id, v_now
  );
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id AND run.id = p_run_id;
  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'INACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::SMALLINT;
    RETURN;
  END IF;
  IF v_run.request_count + v_request_units >
     (v_definition#>>'{limits,requestCap}')::INTEGER THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'REQUEST_CAP'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::SMALLINT;
    RETURN;
  END IF;
  IF v_run.active_lease_count >=
     (v_definition#>>'{limits,concurrencyCap}')::INTEGER THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'CONCURRENCY_CAP'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::SMALLINT;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.scenario_security_results result
    WHERE result.project_id = v_key.project_id
      AND result.run_id = v_run.id
      AND result.created_at > v_now - INTERVAL '30 seconds'
  ) THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'COOLDOWN'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::SMALLINT;
    RETURN;
  END IF;

  v_expires_at := LEAST(
    v_now + make_interval(
      secs => (v_definition#>>'{limits,leaseTtlSeconds}')::INTEGER
    ),
    (v_definition->>'expiresAt')::TIMESTAMPTZ
  );
  IF v_expires_at <= v_now THEN
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, NULL::TIMESTAMPTZ, false,
      'INACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::SMALLINT;
    RETURN;
  END IF;

  INSERT INTO public.scenario_run_leases(
    project_id, run_id, expires_at, request_units
  )
  VALUES (
    v_key.project_id, v_run.id, v_expires_at, v_request_units
  )
  RETURNING id INTO v_lease_id;
  UPDATE public.scenario_runs run
  SET request_count = run.request_count + v_request_units,
      active_lease_count = run.active_lease_count + 1
  WHERE run.project_id = v_key.project_id AND run.id = v_run.id
  RETURNING * INTO v_run;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  )
  VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id,
    v_run.id, v_run.target_id, 'execution_reserved', v_system_actor,
    'Bounded defensive simulation execution reserved.',
    jsonb_build_object(
      'leaseId', v_lease_id,
      'expiresAt', v_expires_at,
      'requestUnits', v_request_units,
      'template', v_template
    )
  );
  RETURN QUERY SELECT
    v_lease_id, v_run.revision, v_expires_at, true, 'ADMITTED'::TEXT,
    v_target.key, v_target.origin, v_template, v_request_units;
END;
$$;

CREATE OR REPLACE FUNCTION settle_security_scenario_execution(
  p_key_hash TEXT,
  p_run_id UUID,
  p_lease_id UUID,
  p_observed_statuses SMALLINT[],
  p_latency_ms INTEGER
)
RETURNS TABLE (
  result_id UUID,
  run_revision BIGINT,
  run_status TEXT,
  observed_outcome TEXT,
  succeeded BOOLEAN,
  settled BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_run public.scenario_runs%ROWTYPE;
  v_lease public.scenario_run_leases%ROWTYPE;
  v_definition JSONB;
  v_template TEXT;
  v_expected_outcome TEXT;
  v_observed_outcome TEXT;
  v_succeeded BOOLEAN;
  v_result_id UUID;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_system_actor UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  SELECT * INTO v_key
  FROM public.active_flag_admin_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_run_id IS NULL
     OR p_lease_id IS NULL
     OR p_observed_statuses IS NULL
     OR cardinality(p_observed_statuses) NOT BETWEEN 1 AND 3
     OR EXISTS (
       SELECT 1
       FROM unnest(p_observed_statuses) status
       WHERE status IS NOT NULL AND status NOT BETWEEN 100 AND 599
     )
     OR p_latency_ms IS NULL
     OR p_latency_ms NOT BETWEEN 0 AND 15000 THEN
    RAISE EXCEPTION 'invalid security scenario execution result'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':scenario-execution:' || p_run_id::TEXT,
    0
  ));
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id
    AND run.environment = v_key.flag_environment
    AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lease.* INTO v_lease
  FROM public.scenario_run_leases lease
  WHERE lease.project_id = v_key.project_id
    AND lease.run_id = p_run_id
    AND lease.id = p_lease_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_lease.status <> 'active' THEN
    SELECT result.id, result.observed_outcome, result.succeeded
    INTO v_result_id, v_observed_outcome, v_succeeded
    FROM public.scenario_security_results result
    WHERE result.project_id = v_key.project_id
      AND result.lease_id = v_lease.id;
    RETURN QUERY SELECT
      v_result_id, v_run.revision, v_run.status, v_observed_outcome,
      v_succeeded, false, 'ALREADY_SETTLED'::TEXT;
    RETURN;
  END IF;

  SELECT version.definition INTO v_definition
  FROM public.scenario_definition_versions version
  WHERE version.project_id = v_run.project_id
    AND version.scenario_id = v_run.scenario_id
    AND version.id = v_run.scenario_version_id;
  v_template := v_definition->>'securityTemplate';
  v_expected_outcome := CASE v_template
    WHEN 'malformed_payload_v1' THEN 'validation_rejected'
    WHEN 'rate_limit_v1' THEN 'rate_limited'
    WHEN 'invalid_credential_v1' THEN 'credential_rejected'
    WHEN 'revoked_credential_v1' THEN 'revoked_credential_rejected'
    ELSE NULL
  END;
  IF v_expected_outcome IS NULL
     OR cardinality(p_observed_statuses) <> v_lease.request_units THEN
    RAISE EXCEPTION 'security result does not match immutable template'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_observed_statuses) status WHERE status IS NULL
  ) THEN
    v_observed_outcome := 'transport_failure';
  ELSIF v_template = 'malformed_payload_v1'
        AND p_observed_statuses = ARRAY[400]::SMALLINT[] THEN
    v_observed_outcome := 'validation_rejected';
  ELSIF v_template = 'rate_limit_v1'
        AND p_observed_statuses = ARRAY[204,204,429]::SMALLINT[] THEN
    v_observed_outcome := 'rate_limited';
  ELSIF v_template = 'invalid_credential_v1'
        AND p_observed_statuses = ARRAY[401]::SMALLINT[] THEN
    v_observed_outcome := 'credential_rejected';
  ELSIF v_template = 'revoked_credential_v1'
        AND p_observed_statuses = ARRAY[403]::SMALLINT[] THEN
    v_observed_outcome := 'revoked_credential_rejected';
  ELSE
    v_observed_outcome := 'unexpected_response';
  END IF;
  v_succeeded := v_observed_outcome = v_expected_outcome;

  IF v_lease.expires_at <= v_now THEN
    UPDATE public.scenario_run_leases lease
    SET status = 'expired', outcome = 'lease_expired', settled_at = v_now
    WHERE lease.project_id = v_key.project_id AND lease.id = v_lease.id;
    UPDATE public.scenario_runs run
    SET active_lease_count = run.active_lease_count - 1,
        failure_count = run.failure_count + 1
    WHERE run.project_id = v_key.project_id
      AND run.id = v_run.id
      AND run.active_lease_count > 0
    RETURNING * INTO v_run;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scenario lease counters are inconsistent'
        USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.scenario_lifecycle_audit(
      project_id, scenario_id, scenario_version_id, run_id, target_id,
      action, actor_user_id, reason, metadata
    )
    VALUES (
      v_run.project_id, v_run.scenario_id, v_run.scenario_version_id,
      v_run.id, v_run.target_id, 'execution_lease_expired', v_system_actor,
      'Security execution lease expired before settlement.',
      jsonb_build_object('leaseId', v_lease.id, 'template', v_template)
    );
    PERFORM private.apply_scenario_run_guardrails(
      v_key.project_id, v_run.id, v_now
    );
    SELECT run.* INTO v_run
    FROM public.scenario_runs run
    WHERE run.project_id = v_key.project_id AND run.id = p_run_id;
    RETURN QUERY SELECT
      NULL::UUID, v_run.revision, v_run.status, 'transport_failure'::TEXT,
      false, false, 'LEASE_EXPIRED'::TEXT;
    RETURN;
  END IF;

  UPDATE public.scenario_run_leases lease
  SET status = 'settled',
      outcome = CASE WHEN v_succeeded THEN 'success' ELSE 'failure' END,
      settled_at = v_now
  WHERE lease.project_id = v_key.project_id AND lease.id = v_lease.id;
  UPDATE public.scenario_runs run
  SET active_lease_count = run.active_lease_count - 1,
      success_count = run.success_count + CASE WHEN v_succeeded THEN 1 ELSE 0 END,
      failure_count = run.failure_count + CASE WHEN v_succeeded THEN 0 ELSE 1 END
  WHERE run.project_id = v_key.project_id
    AND run.id = v_run.id
    AND run.active_lease_count > 0
  RETURNING * INTO v_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenario lease counters are inconsistent'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.scenario_security_results(
    project_id, scenario_id, scenario_version_id, run_id, lease_id,
    target_id, template, expected_outcome, observed_outcome,
    observed_statuses, succeeded, latency_ms
  )
  VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id,
    v_run.id, v_lease.id, v_run.target_id, v_template,
    v_expected_outcome, v_observed_outcome, p_observed_statuses,
    v_succeeded, p_latency_ms
  )
  RETURNING id INTO v_result_id;
  INSERT INTO public.scenario_lifecycle_audit(
    project_id, scenario_id, scenario_version_id, run_id, target_id,
    action, actor_user_id, reason, metadata
  )
  VALUES (
    v_run.project_id, v_run.scenario_id, v_run.scenario_version_id,
    v_run.id, v_run.target_id, 'security_result_recorded', v_system_actor,
    'Closed defensive simulation result recorded.',
    jsonb_build_object(
      'resultId', v_result_id,
      'leaseId', v_lease.id,
      'template', v_template,
      'outcome', v_observed_outcome,
      'succeeded', v_succeeded
    )
  );
  PERFORM private.apply_scenario_run_guardrails(
    v_key.project_id, v_run.id, v_now
  );
  SELECT run.* INTO v_run
  FROM public.scenario_runs run
  WHERE run.project_id = v_key.project_id AND run.id = p_run_id;
  RETURN QUERY SELECT
    v_result_id, v_run.revision, v_run.status, v_observed_outcome,
    v_succeeded, true, 'SETTLED'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION get_scenario_security_results(p_key_hash TEXT)
RETURNS TABLE (
  generated_at TIMESTAMPTZ,
  results JSONB
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key
  FROM public.active_flag_admin_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT
    statement_timestamp(),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', result.id,
      'scenarioId', result.scenario_id,
      'scenarioVersionId', result.scenario_version_id,
      'runId', result.run_id,
      'leaseId', result.lease_id,
      'targetId', result.target_id,
      'template', result.template,
      'expectedOutcome', result.expected_outcome,
      'observedOutcome', result.observed_outcome,
      'observedStatuses', to_jsonb(result.observed_statuses),
      'succeeded', result.succeeded,
      'latencyMs', result.latency_ms,
      'createdAt', result.created_at
    ) ORDER BY result.created_at DESC), '[]'::JSONB)
  FROM (
    SELECT scoped.*
    FROM public.scenario_security_results scoped
    JOIN public.scenario_runs run
      ON run.project_id = scoped.project_id AND run.id = scoped.run_id
    WHERE scoped.project_id = v_key.project_id
      AND run.environment = v_key.flag_environment
    ORDER BY scoped.created_at DESC
    LIMIT 100
  ) result;
END;
$$;

REVOKE ALL ON FUNCTION
  reserve_security_scenario_execution(TEXT,UUID,BIGINT),
  settle_security_scenario_execution(TEXT,UUID,UUID,SMALLINT[],INTEGER),
  get_scenario_security_results(TEXT)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  reserve_security_scenario_execution(TEXT,UUID,BIGINT),
  settle_security_scenario_execution(TEXT,UUID,UUID,SMALLINT[],INTEGER),
  get_scenario_security_results(TEXT)
TO service_role;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.reserve_security_scenario_execution(text,uuid,bigint)',
    'public.settle_security_scenario_execution(text,uuid,uuid,smallint[],integer)',
    'public.get_scenario_security_results(text)'
  ]
  LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'security scenario function privilege boundary failed for %',
        v_signature;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.scenario_security_results', 'SELECT')
     OR has_table_privilege(
       'authenticated', 'public.scenario_security_results', 'SELECT'
     )
     OR has_table_privilege(
       'service_role', 'public.scenario_security_results', 'INSERT'
     )
     OR has_table_privilege(
       'service_role', 'public.scenario_security_results', 'UPDATE'
     )
     OR has_table_privilege(
       'service_role', 'public.scenario_security_results', 'DELETE'
     )
     OR NOT has_table_privilege(
       'service_role', 'public.scenario_security_results', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'security scenario result table privilege boundary failed';
  END IF;
END;
$$;
