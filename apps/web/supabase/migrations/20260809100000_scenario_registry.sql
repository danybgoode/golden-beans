-- flag-serving-and-prd-g · Sprint 3, Story 3.1 — governed scenario registry and run state.
--
-- EXPAND-only and born dark. Application routes remain behind RESILIENCE_SCENARIOS_ENABLED or
-- SECURITY_SIMULATIONS_ENABLED. Definitions/audit remain inspectable while execution is OFF.

CREATE OR REPLACE FUNCTION private.scenario_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_expiry TIMESTAMPTZ;
BEGIN
  IF p_definition IS NULL
     OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
     OR octet_length(p_definition::TEXT) > 65536
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_definition) AS key
       WHERE key NOT IN (
         'contractVersion', 'kind', 'targetKey', 'environment', 'cohort', 'startAt',
         'expiresAt', 'limits', 'guardrails', 'flag', 'experiment', 'securityTemplate'
       )
     )
     OR NOT (p_definition ?& ARRAY[
       'contractVersion', 'kind', 'targetKey', 'environment', 'cohort', 'startAt',
       'expiresAt', 'limits', 'guardrails', 'flag'
     ])
     OR p_definition->>'contractVersion' <> '1'
     OR jsonb_typeof(p_definition->'contractVersion') IS DISTINCT FROM 'number'
     OR p_definition->>'kind' NOT IN ('resilience', 'security')
     OR jsonb_typeof(p_definition->'kind') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_definition->'targetKey') IS DISTINCT FROM 'string'
     OR (p_definition->>'targetKey') !~ '^[a-z][a-z0-9_.-]{0,127}$'
     OR p_definition->>'environment' NOT IN ('development', 'preview', 'production')
     OR jsonb_typeof(p_definition->'environment') IS DISTINCT FROM 'string'
     OR p_definition->>'cohort' NOT IN ('synthetic', 'internal', 'external')
     OR jsonb_typeof(p_definition->'cohort') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_definition->'startAt') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_definition->'expiresAt') IS DISTINCT FROM 'string'
     OR p_definition->>'startAt' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR p_definition->>'expiresAt' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN RETURN false; END IF;

  v_start := (p_definition->>'startAt')::TIMESTAMPTZ;
  v_expiry := (p_definition->>'expiresAt')::TIMESTAMPTZ;
  IF v_start >= v_expiry OR v_expiry - v_start > INTERVAL '1 hour' THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'limits') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_definition->'limits') AS key
       WHERE key NOT IN ('requestCap', 'concurrencyCap', 'leaseTtlSeconds')
     )
     OR NOT ((p_definition->'limits') ?& ARRAY[
       'requestCap', 'concurrencyCap', 'leaseTtlSeconds'
     ])
     OR jsonb_typeof(p_definition#>'{limits,requestCap}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_definition#>'{limits,concurrencyCap}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_definition#>'{limits,leaseTtlSeconds}') IS DISTINCT FROM 'number'
     OR p_definition#>>'{limits,requestCap}' !~ '^[0-9]+$'
     OR p_definition#>>'{limits,concurrencyCap}' !~ '^[0-9]+$'
     OR p_definition#>>'{limits,leaseTtlSeconds}' !~ '^[0-9]+$'
     OR (p_definition#>>'{limits,requestCap}')::INTEGER NOT BETWEEN 1 AND 100
     OR (p_definition#>>'{limits,concurrencyCap}')::INTEGER NOT BETWEEN 1 AND 5
     OR (p_definition#>>'{limits,leaseTtlSeconds}')::INTEGER NOT BETWEEN 1 AND 30
     OR (p_definition#>>'{limits,concurrencyCap}')::INTEGER >
        (p_definition#>>'{limits,requestCap}')::INTEGER
  THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'guardrails') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_definition->'guardrails') AS key
       WHERE key NOT IN ('abortAfterFailures', 'maxErrorRateBasisPoints')
     )
     OR NOT ((p_definition->'guardrails') ?& ARRAY[
       'abortAfterFailures', 'maxErrorRateBasisPoints'
     ])
     OR jsonb_typeof(p_definition#>'{guardrails,abortAfterFailures}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_definition#>'{guardrails,maxErrorRateBasisPoints}') IS DISTINCT FROM 'number'
     OR p_definition#>>'{guardrails,abortAfterFailures}' !~ '^[0-9]+$'
     OR p_definition#>>'{guardrails,maxErrorRateBasisPoints}' !~ '^[0-9]+$'
     OR (p_definition#>>'{guardrails,abortAfterFailures}')::INTEGER NOT BETWEEN 1 AND 10
     OR (p_definition#>>'{guardrails,maxErrorRateBasisPoints}')::INTEGER NOT BETWEEN 1 AND 10000
  THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'flag') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_definition->'flag') AS key
       WHERE key NOT IN ('key', 'definitionVersion')
     )
     OR NOT ((p_definition->'flag') ?& ARRAY['key', 'definitionVersion'])
     OR jsonb_typeof(p_definition#>'{flag,key}') IS DISTINCT FROM 'string'
     OR (p_definition#>>'{flag,key}') !~ '^[a-z][a-z0-9_.-]{0,127}$'
     OR jsonb_typeof(p_definition#>'{flag,definitionVersion}') IS DISTINCT FROM 'number'
     OR p_definition#>>'{flag,definitionVersion}' !~ '^[0-9]+$'
     OR (p_definition#>>'{flag,definitionVersion}')::NUMERIC < 1
  THEN RETURN false; END IF;

  IF p_definition ? 'experiment' THEN
    IF jsonb_typeof(p_definition->'experiment') IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_definition->'experiment') AS key
         WHERE key NOT IN ('key', 'definitionVersion')
       )
       OR NOT ((p_definition->'experiment') ?& ARRAY['key', 'definitionVersion'])
       OR jsonb_typeof(p_definition#>'{experiment,key}') IS DISTINCT FROM 'string'
       OR (p_definition#>>'{experiment,key}') !~ '^[a-z][a-z0-9_-]{0,63}$'
       OR jsonb_typeof(p_definition#>'{experiment,definitionVersion}') IS DISTINCT FROM 'number'
       OR p_definition#>>'{experiment,definitionVersion}' !~ '^[0-9]+$'
       OR (p_definition#>>'{experiment,definitionVersion}')::NUMERIC < 1
    THEN RETURN false; END IF;
  END IF;

  IF p_definition->>'kind' = 'resilience' AND p_definition ? 'securityTemplate' THEN
    RETURN false;
  END IF;
  IF p_definition->>'kind' = 'security' AND (
    jsonb_typeof(p_definition->'securityTemplate') IS DISTINCT FROM 'string'
    OR p_definition->>'securityTemplate' NOT IN (
      'malformed_payload_v1', 'rate_limit_v1',
      'invalid_credential_v1', 'revoked_credential_v1'
    )
  ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.scenario_definition_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

-- A referenced flag is the only payload source for a resilience scenario. Validate that source at
-- the database boundary too, otherwise a service-role caller could register an arbitrary JSON
-- value that the SDK would later reject (or an older executor could accidentally interpret).
CREATE OR REPLACE FUNCTION private.scenario_fault_is_valid(p_fault JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_fault IS NULL OR jsonb_typeof(p_fault) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  IF p_fault->>'kind' = 'none' THEN
    RETURN p_fault = '{"kind":"none"}'::JSONB;
  END IF;
  IF p_fault->>'kind' = 'delay' THEN
    RETURN (
      SELECT COUNT(*) = 2 FROM jsonb_object_keys(p_fault)
    )
      AND jsonb_typeof(p_fault->'delayMs') IS NOT DISTINCT FROM 'number'
      AND p_fault->>'delayMs' ~ '^[0-9]+$'
      AND (p_fault->>'delayMs')::NUMERIC BETWEEN 1 AND 2000;
  END IF;
  IF p_fault->>'kind' = 'synthetic_error' THEN
    RETURN p_fault = '{"kind":"synthetic_error","errorCode":"GB_RESILIENCE_503"}'::JSONB;
  END IF;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.scenario_fault_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.scenario_flag_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_variant JSONB;
  v_default JSONB;
BEGIN
  IF NOT private.flag_definition_is_valid(p_definition)
     OR p_definition->>'valueType' IS DISTINCT FROM 'json'
     OR jsonb_typeof(p_definition->'variants') IS DISTINCT FROM 'array'
  THEN
    RETURN false;
  END IF;
  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_definition->'variants') LOOP
    IF NOT private.scenario_fault_is_valid(v_variant->'value') THEN
      RETURN false;
    END IF;
  END LOOP;
  SELECT variant->'value' INTO v_default
  FROM jsonb_array_elements(p_definition->'variants') AS variant
  WHERE variant->>'key' = p_definition->>'defaultVariantKey';
  -- A missing/invalid context must always choose an explicit no-op, never inject by default.
  RETURN v_default = '{"kind":"none"}'::JSONB;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.scenario_flag_definition_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE scenario_targets (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key                      TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  target_kind              TEXT        NOT NULL CHECK (target_kind = 'miyagi_resilience_probe_v1'),
  origin                   TEXT        NOT NULL CHECK (
    origin ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$'
  ),
  ownership_challenge_hash TEXT        NOT NULL CHECK (ownership_challenge_hash ~ '^[0-9a-f]{64}$'),
  status                   TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'revoked')),
  created_by               UUID        NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by              UUID,
  verified_at              TIMESTAMPTZ,
  revoked_by               UUID,
  revoked_at               TIMESTAMPTZ,
  CONSTRAINT scenario_target_verified_pair
    CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  CONSTRAINT scenario_target_revoked_pair
    CHECK ((revoked_by IS NULL) = (revoked_at IS NULL)),
  CONSTRAINT scenario_target_state_shape CHECK (
    (status = 'pending' AND verified_at IS NULL AND revoked_at IS NULL)
    OR (status = 'verified' AND verified_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE scenario_registries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  created_by UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE scenario_definition_versions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL,
  scenario_id           UUID        NOT NULL,
  version               INTEGER     NOT NULL CHECK (version > 0),
  definition            JSONB       NOT NULL CHECK (private.scenario_definition_is_valid(definition)),
  target_id             UUID        NOT NULL,
  flag_id               UUID        NOT NULL,
  flag_version_id       UUID        NOT NULL,
  experiment_id         UUID,
  experiment_version_id UUID,
  created_by            UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scenario_versions_registry_fk
    FOREIGN KEY (project_id, scenario_id)
    REFERENCES scenario_registries(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_versions_target_fk
    FOREIGN KEY (project_id, target_id)
    REFERENCES scenario_targets(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_versions_flag_fk
    FOREIGN KEY (project_id, flag_id, flag_version_id)
    REFERENCES flag_definition_versions(project_id, flag_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_versions_experiment_fk
    FOREIGN KEY (project_id, experiment_id, experiment_version_id)
    REFERENCES experiment_definition_versions(project_id, experiment_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_versions_experiment_pair
    CHECK ((experiment_id IS NULL) = (experiment_version_id IS NULL)),
  UNIQUE (scenario_id, version),
  UNIQUE (project_id, scenario_id, id),
  UNIQUE (project_id, scenario_id, id, target_id),
  UNIQUE (project_id, id)
);

CREATE TABLE scenario_owner_approvals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  scenario_id         UUID        NOT NULL,
  scenario_version_id UUID        NOT NULL,
  approval_kind       TEXT        NOT NULL
    CHECK (approval_kind IN ('external_cohort', 'production_security')),
  actor_user_id       UUID        NOT NULL,
  external_actor_id   TEXT        NOT NULL
    CHECK (external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$'),
  reason              TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scenario_approvals_version_fk
    FOREIGN KEY (project_id, scenario_id, scenario_version_id)
    REFERENCES scenario_definition_versions(project_id, scenario_id, id) ON DELETE CASCADE,
  UNIQUE (scenario_version_id, approval_kind),
  UNIQUE (project_id, id)
);

CREATE TABLE scenario_environment_states (
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment      TEXT        NOT NULL
    CHECK (environment IN ('development', 'preview', 'production')),
  -- SDK scenario snapshots use positive revisions. Starting at one keeps the empty state valid,
  -- while each start/stop/expiry still advances the monotonic environment revision.
  snapshot_version BIGINT      NOT NULL DEFAULT 1 CHECK (snapshot_version > 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, environment)
);

CREATE TABLE scenario_runs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  scenario_id         UUID        NOT NULL,
  scenario_version_id UUID        NOT NULL,
  target_id           UUID        NOT NULL,
  environment         TEXT        NOT NULL
    CHECK (environment IN ('development', 'preview', 'production')),
  status              TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'stopped', 'aborted', 'expired')),
  revision            BIGINT      NOT NULL DEFAULT 1 CHECK (revision > 0),
  request_count       INTEGER     NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  active_lease_count  INTEGER     NOT NULL DEFAULT 0 CHECK (active_lease_count >= 0),
  success_count       INTEGER     NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count       INTEGER     NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  created_by          UUID        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_by          UUID,
  started_at          TIMESTAMPTZ,
  stopped_by          UUID,
  stopped_at          TIMESTAMPTZ,
  stop_reason         TEXT CHECK (
    stop_reason IS NULL OR (char_length(stop_reason) BETWEEN 1 AND 500 AND btrim(stop_reason) <> '')
  ),
  CONSTRAINT scenario_runs_version_fk
    FOREIGN KEY (project_id, scenario_id, scenario_version_id, target_id)
    REFERENCES scenario_definition_versions(project_id, scenario_id, id, target_id)
    ON DELETE CASCADE,
  CONSTRAINT scenario_runs_environment_fk
    FOREIGN KEY (project_id, environment)
    REFERENCES scenario_environment_states(project_id, environment) ON DELETE CASCADE,
  CONSTRAINT scenario_runs_started_pair CHECK ((started_by IS NULL) = (started_at IS NULL)),
  CONSTRAINT scenario_runs_counter_shape CHECK (
    active_lease_count <= request_count
    AND success_count + failure_count <= request_count
  ),
  CONSTRAINT scenario_runs_stopped_shape CHECK (
    (status = 'draft' AND started_at IS NULL AND stopped_at IS NULL AND stop_reason IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND stopped_at IS NULL AND stop_reason IS NULL)
    OR (
      status IN ('stopped', 'aborted', 'expired')
      AND started_at IS NOT NULL
      AND stopped_at IS NOT NULL
      AND stopped_by IS NOT NULL
      AND stop_reason IS NOT NULL
    )
  ),
  UNIQUE (project_id, id)
);
CREATE UNIQUE INDEX scenario_one_running_target_idx
  ON scenario_runs(project_id, environment, target_id)
  WHERE status = 'running';
CREATE INDEX scenario_runs_project_created_idx
  ON scenario_runs(project_id, created_at DESC);

CREATE TABLE scenario_run_leases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL,
  run_id      UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'expired')),
  outcome     TEXT CHECK (
    outcome IS NULL OR outcome IN ('success', 'failure', 'lease_expired')
  ),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  settled_at  TIMESTAMPTZ,
  CONSTRAINT scenario_run_leases_run_fk
    FOREIGN KEY (project_id, run_id)
    REFERENCES scenario_runs(project_id, id) ON DELETE CASCADE,
  CONSTRAINT scenario_run_leases_window CHECK (
    expires_at > reserved_at AND expires_at - reserved_at <= INTERVAL '30 seconds'
  ),
  CONSTRAINT scenario_run_leases_state_shape CHECK (
    (status = 'active' AND outcome IS NULL AND settled_at IS NULL)
    OR (
      status = 'settled'
      AND outcome IN ('success', 'failure')
      AND settled_at IS NOT NULL
    )
    OR (
      status = 'expired'
      AND outcome = 'lease_expired'
      AND settled_at IS NOT NULL
    )
  ),
  UNIQUE (project_id, id)
);
CREATE INDEX scenario_run_leases_active_expiry_idx
  ON scenario_run_leases(project_id, run_id, expires_at)
  WHERE status = 'active';

CREATE TABLE scenario_lifecycle_audit (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  scenario_id         UUID,
  scenario_version_id UUID,
  run_id              UUID,
  target_id           UUID,
  action              TEXT        NOT NULL CHECK (action IN (
    'target_registered', 'target_verified', 'target_revoked',
    'version_created', 'owner_approved',
    'run_created', 'run_started', 'run_stopped', 'run_aborted', 'run_expired',
    'execution_reserved', 'execution_settled', 'execution_lease_expired'
  )),
  actor_user_id       UUID        NOT NULL,
  external_actor_id   TEXT CHECK (
    external_actor_id IS NULL OR external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$'
  ),
  reason              TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  metadata            JSONB       NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 4096
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scenario_lifecycle_audit_project_created_idx
  ON scenario_lifecycle_audit(project_id, created_at DESC);

ALTER TABLE scenario_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_owner_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_environment_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_run_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_lifecycle_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  scenario_targets,
  scenario_registries,
  scenario_definition_versions,
  scenario_owner_approvals,
  scenario_environment_states,
  scenario_runs,
  scenario_run_leases,
  scenario_lifecycle_audit
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE
  scenario_targets,
  scenario_registries,
  scenario_definition_versions,
  scenario_owner_approvals,
  scenario_environment_states,
  scenario_runs,
  scenario_run_leases,
  scenario_lifecycle_audit
TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_scenario_target_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'scenario target ownership is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.key IS DISTINCT FROM NEW.key
     OR OLD.target_kind IS DISTINCT FROM NEW.target_kind
     OR OLD.origin IS DISTINCT FROM NEW.origin
     OR OLD.ownership_challenge_hash IS DISTINCT FROM NEW.ownership_challenge_hash
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT (
       (OLD.status = 'pending' AND NEW.status IN ('verified', 'revoked'))
       OR (OLD.status = 'verified' AND NEW.status = 'revoked')
     )
  THEN
    RAISE EXCEPTION 'invalid scenario target lifecycle transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scenario_targets_lifecycle_trg
  BEFORE UPDATE OR DELETE ON scenario_targets
  FOR EACH ROW EXECUTE FUNCTION private.enforce_scenario_target_lifecycle();

CREATE OR REPLACE FUNCTION private.enforce_scenario_version_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_target public.scenario_targets%ROWTYPE;
  v_flag_key TEXT;
  v_flag_version INTEGER;
  v_flag_definition JSONB;
  v_experiment_key TEXT;
  v_experiment_version INTEGER;
BEGIN
  SELECT target.* INTO v_target
  FROM public.scenario_targets target
  WHERE target.project_id = NEW.project_id AND target.id = NEW.target_id;
  IF NOT FOUND
     OR v_target.status <> 'verified'
     OR v_target.key <> NEW.definition->>'targetKey'
  THEN
    RAISE EXCEPTION 'scenario definition must reference its exact verified target'
      USING ERRCODE = '22023';
  END IF;

  SELECT registry.key, version.version, version.definition
  INTO v_flag_key, v_flag_version, v_flag_definition
  FROM public.flag_definition_versions version
  JOIN public.flag_registries registry
    ON registry.project_id = version.project_id AND registry.id = version.flag_id
  WHERE version.project_id = NEW.project_id
    AND version.flag_id = NEW.flag_id
    AND version.id = NEW.flag_version_id;
  IF NOT FOUND
     OR v_flag_key <> NEW.definition#>>'{flag,key}'
     OR v_flag_version <> (NEW.definition#>>'{flag,definitionVersion}')::INTEGER
     OR NOT private.scenario_flag_definition_is_valid(v_flag_definition)
  THEN
    RAISE EXCEPTION 'scenario definition must reference an exact closed-fault flag version'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.experiment_id IS NULL THEN
    IF NEW.definition ? 'experiment' THEN
      RAISE EXCEPTION 'scenario experiment reference does not match its immutable row'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT registry.key, version.version
    INTO v_experiment_key, v_experiment_version
    FROM public.experiment_definition_versions version
    JOIN public.experiment_registries registry
      ON registry.project_id = version.project_id AND registry.id = version.experiment_id
    WHERE version.project_id = NEW.project_id
      AND version.experiment_id = NEW.experiment_id
      AND version.id = NEW.experiment_version_id;
    IF NOT FOUND
       OR v_experiment_key <> NEW.definition#>>'{experiment,key}'
       OR v_experiment_version <> (NEW.definition#>>'{experiment,definitionVersion}')::INTEGER
       OR NOT EXISTS (
         SELECT 1
         FROM public.experiment_flag_version_bindings binding
         WHERE binding.project_id = NEW.project_id
           AND binding.experiment_id = NEW.experiment_id
           AND binding.experiment_version_id = NEW.experiment_version_id
           AND binding.flag_id = NEW.flag_id
           AND binding.flag_version_id = NEW.flag_version_id
       )
    THEN
      RAISE EXCEPTION 'scenario experiment must be bound to its exact flag version'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scenario_definition_versions_references_trg
  BEFORE INSERT ON scenario_definition_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_scenario_version_references();

CREATE OR REPLACE FUNCTION private.forbid_scenario_definition_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'scenario definitions and approvals are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER scenario_definition_versions_immutable_trg
  BEFORE UPDATE OR DELETE ON scenario_definition_versions
  FOR EACH ROW EXECUTE FUNCTION private.forbid_scenario_definition_mutation();
CREATE TRIGGER scenario_owner_approvals_immutable_trg
  BEFORE UPDATE OR DELETE ON scenario_owner_approvals
  FOR EACH ROW EXECUTE FUNCTION private.forbid_scenario_definition_mutation();

COMMENT ON TABLE scenario_definition_versions IS
  'Immutable tenant-scoped scenario plans bound to an exact verified target and closed-fault flag version.';
COMMENT ON TABLE scenario_owner_approvals IS
  'Immutable owner approvals required for external cohorts and production security scenarios.';
COMMENT ON TABLE scenario_run_leases IS
  'Short-lived database-owned execution reservations enforcing global request and concurrency caps across serverless instances.';
COMMENT ON TABLE scenario_lifecycle_audit IS
  'Append-only actor-time lifecycle and bounded execution evidence; request-derived reads remain project scoped.';

-- Migration-time property proof: exact tenant/target/flag references and immutable ownership are
-- structural properties, not conventions in the application RPC.
DO $$
DECLARE
  v_project_a UUID;
  v_project_b UUID;
  v_actor UUID := '00000000-0000-0000-0000-0000000000a1';
  v_target_a UUID;
  v_target_a_other UUID;
  v_target_b UUID;
  v_flag_a UUID;
  v_flag_a_version UUID;
  v_open_flag UUID;
  v_open_flag_version UUID;
  v_scenario UUID;
  v_scenario_version UUID;
  v_approval UUID;
  v_fixture_suffix TEXT := replace(gen_random_uuid()::TEXT, '-', '');
  v_definition JSONB := '{
    "contractVersion":1,
    "kind":"resilience",
    "targetKey":"migration.probe",
    "environment":"production",
    "cohort":"internal",
    "startAt":"2026-01-01T00:00:00.000Z",
    "expiresAt":"2026-01-01T00:10:00.000Z",
    "limits":{"requestCap":3,"concurrencyCap":1,"leaseTtlSeconds":5},
    "guardrails":{"abortAfterFailures":2,"maxErrorRateBasisPoints":5000},
    "flag":{"key":"scenario.migration_probe","definitionVersion":1}
  }'::JSONB;
  v_closed_flag JSONB := '{
    "valueType":"json",
    "description":"Closed scenario migration assertion.",
    "defaultVariantKey":"control",
    "variants":[
      {"key":"control","value":{"kind":"none"}},
      {"key":"delay","value":{"kind":"delay","delayMs":10}}
    ],
    "rules":[]
  }'::JSONB;
  v_open_flag_definition JSONB := '{
    "valueType":"json",
    "description":"Open scenario migration assertion.",
    "defaultVariantKey":"control",
    "variants":[{"key":"control","value":{"kind":"caller_chosen","url":"https://example.test"}}],
    "rules":[]
  }'::JSONB;
BEGIN
  INSERT INTO public.projects(slug, api_key_hash)
  VALUES (
    'scenario-migration-assertion-a-' || left(v_fixture_suffix, 12),
    encode(gen_random_bytes(32), 'hex')
  )
  RETURNING id INTO v_project_a;
  INSERT INTO public.projects(slug, api_key_hash)
  VALUES (
    'scenario-migration-assertion-b-' || left(v_fixture_suffix, 12),
    encode(gen_random_bytes(32), 'hex')
  )
  RETURNING id INTO v_project_b;
  INSERT INTO public.scenario_targets(
    project_id, key, target_kind, origin, ownership_challenge_hash,
    status, created_by, verified_by, verified_at
  ) VALUES (
    v_project_a, 'migration.probe', 'miyagi_resilience_probe_v1',
    'https://migration-a.example.test', repeat('a', 64),
    'verified', v_actor, v_actor, now()
  ) RETURNING id INTO v_target_a;
  INSERT INTO public.scenario_targets(
    project_id, key, target_kind, origin, ownership_challenge_hash,
    status, created_by, verified_by, verified_at
  ) VALUES (
    v_project_a, 'migration.other', 'miyagi_resilience_probe_v1',
    'https://migration-other.example.test', repeat('c', 64),
    'verified', v_actor, v_actor, now()
  ) RETURNING id INTO v_target_a_other;
  INSERT INTO public.scenario_targets(
    project_id, key, target_kind, origin, ownership_challenge_hash,
    status, created_by, verified_by, verified_at
  ) VALUES (
    v_project_b, 'migration.probe', 'miyagi_resilience_probe_v1',
    'https://migration-b.example.test', repeat('b', 64),
    'verified', v_actor, v_actor, now()
  ) RETURNING id INTO v_target_b;
  INSERT INTO public.flag_registries(project_id, key, created_by)
  VALUES (v_project_a, 'scenario.migration_probe', v_actor)
  RETURNING id INTO v_flag_a;
  INSERT INTO public.flag_definition_versions(project_id, flag_id, version, definition, created_by)
  VALUES (v_project_a, v_flag_a, 1, v_closed_flag, v_actor)
  RETURNING id INTO v_flag_a_version;
  INSERT INTO public.flag_registries(project_id, key, created_by)
  VALUES (v_project_a, 'scenario.open_probe', v_actor)
  RETURNING id INTO v_open_flag;
  INSERT INTO public.flag_definition_versions(project_id, flag_id, version, definition, created_by)
  VALUES (v_project_a, v_open_flag, 1, v_open_flag_definition, v_actor)
  RETURNING id INTO v_open_flag_version;
  INSERT INTO public.scenario_registries(project_id, key, created_by)
  VALUES (v_project_a, 'migration_probe', v_actor)
  RETURNING id INTO v_scenario;
  INSERT INTO public.scenario_definition_versions(
    project_id, scenario_id, version, definition, target_id,
    flag_id, flag_version_id, created_by
  ) VALUES (
    v_project_a, v_scenario, 1, v_definition, v_target_a,
    v_flag_a, v_flag_a_version, v_actor
  ) RETURNING id INTO v_scenario_version;

  BEGIN
    INSERT INTO public.scenario_definition_versions(
      project_id, scenario_id, version, definition, target_id,
      flag_id, flag_version_id, created_by
    ) VALUES (
      v_project_a, v_scenario, 2, v_definition, v_target_b,
      v_flag_a, v_flag_a_version, v_actor
    );
    RAISE EXCEPTION 'cross-project scenario target unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.scenario_definition_versions(
      project_id, scenario_id, version, definition, target_id,
      flag_id, flag_version_id, created_by
    ) VALUES (
      v_project_a, v_scenario, 2,
      jsonb_set(v_definition, '{flag,key}', '"scenario.open_probe"'),
      v_target_a, v_open_flag, v_open_flag_version, v_actor
    );
    RAISE EXCEPTION 'open scenario fault payload unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    UPDATE public.scenario_definition_versions
    SET definition = jsonb_set(definition, '{cohort}', '"external"')
    WHERE id = v_scenario_version;
    RAISE EXCEPTION 'scenario definition UPDATE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE public.scenario_targets
    SET origin = 'https://rewritten.example.test'
    WHERE id = v_target_a;
    RAISE EXCEPTION 'scenario target ownership UPDATE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  INSERT INTO public.scenario_owner_approvals(
    project_id, scenario_id, scenario_version_id, approval_kind,
    actor_user_id, external_actor_id, reason
  ) VALUES (
    v_project_a, v_scenario, v_scenario_version, 'external_cohort',
    v_actor, 'user_MigrationAssertion', 'Migration immutability assertion.'
  ) RETURNING id INTO v_approval;
  BEGIN
    UPDATE public.scenario_owner_approvals SET reason = 'Rewritten.' WHERE id = v_approval;
    RAISE EXCEPTION 'scenario approval UPDATE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.scenario_owner_approvals WHERE id = v_approval;
    RAISE EXCEPTION 'scenario approval DELETE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  INSERT INTO public.scenario_environment_states(project_id, environment)
  VALUES (v_project_a, 'production');
  BEGIN
    INSERT INTO public.scenario_runs(
      project_id, scenario_id, scenario_version_id, target_id, environment, created_by
    ) VALUES (
      v_project_a, v_scenario, v_scenario_version, v_target_a_other, 'production', v_actor
    );
    RAISE EXCEPTION 'scenario run unexpectedly changed its immutable target';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  DELETE FROM public.projects WHERE id IN (v_project_a, v_project_b);
  IF EXISTS (
    SELECT 1 FROM public.scenario_definition_versions WHERE id = v_scenario_version
  ) OR EXISTS (
    SELECT 1 FROM public.scenario_owner_approvals WHERE id = v_approval
  ) THEN
    RAISE EXCEPTION 'project cleanup left scenario registry state behind';
  END IF;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.scenario_targets',
    'public.scenario_registries',
    'public.scenario_definition_versions',
    'public.scenario_owner_approvals',
    'public.scenario_environment_states',
    'public.scenario_runs',
    'public.scenario_run_leases',
    'public.scenario_lifecycle_audit'
  ]
  LOOP
    IF has_table_privilege('anon', v_table, 'SELECT')
       OR has_table_privilege('authenticated', v_table, 'SELECT')
       OR has_table_privilege('service_role', v_table, 'INSERT')
       OR has_table_privilege('service_role', v_table, 'UPDATE')
       OR has_table_privilege('service_role', v_table, 'DELETE')
       OR has_table_privilege('service_role', v_table, 'TRUNCATE')
       OR NOT has_table_privilege('service_role', v_table, 'SELECT')
    THEN
      RAISE EXCEPTION 'scenario table privilege boundary failed for %', v_table;
    END IF;
  END LOOP;
END;
$$;
