-- flag-serving-and-prd-g · Sprint 3, Story 3.5 — policy-bound manual/automatic breakers.
--
-- A trip invocation names only a policy and immutable evidence. The safe flag/version is resolved
-- from the policy inside the database; no invocation can choose a flag, value, or direction.

CREATE OR REPLACE FUNCTION private.breaker_policy_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(
    p_definition IS NOT NULL
    AND jsonb_typeof(p_definition) = 'object'
    AND octet_length(p_definition::TEXT) <= 32768
    AND p_definition->>'contractVersion' = '1'
    AND jsonb_typeof(p_definition->'flag') = 'object'
    AND jsonb_typeof(p_definition->'evidence') = 'object'
    AND p_definition#>>'{evidence,resolver}' = 'scenario_impact_v1'
    AND jsonb_typeof(p_definition#>'{evidence,scenario}') = 'object'
    AND jsonb_typeof(p_definition#>'{evidence,experiment}') = 'object'
    AND p_definition#>>'{evidence,metricRole}' IN ('primary', 'guardrail')
    AND p_definition#>>'{evidence,adverseDirection}' IN ('increase', 'decrease')
    AND p_definition#>>'{evidence,requiredIntegrity}' = 'valid'
    AND p_definition->>'riskClass' IN ('standard', 'money_auth_checkout')
    AND p_definition->>'confirmationMode' IN ('manual', 'owner_preapproved_emergency')
    AND (p_definition->>'windowSeconds') ~ '^[0-9]+$'
    AND (p_definition->>'windowSeconds')::INTEGER BETWEEN 1 AND 86400
    AND (p_definition->>'cooldownSeconds') ~ '^[0-9]+$'
    AND (p_definition->>'cooldownSeconds')::INTEGER BETWEEN 1 AND 604800
    AND (p_definition->>'maxTrips') ~ '^[0-9]+$'
    AND (p_definition->>'maxTrips')::INTEGER BETWEEN 1 AND 10,
    false
  );
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.breaker_policy_definition_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE breaker_policies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key                   TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  definition            JSONB       NOT NULL CHECK (
    private.breaker_policy_definition_is_valid(definition)
  ),
  flag_id               UUID        NOT NULL,
  protective_version_id UUID        NOT NULL,
  scenario_id           UUID        NOT NULL,
  scenario_version_id   UUID        NOT NULL,
  experiment_id         UUID        NOT NULL,
  experiment_version_id UUID        NOT NULL,
  created_by            UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, flag_id, protective_version_id)
    REFERENCES flag_definition_versions(project_id, flag_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, scenario_id, scenario_version_id)
    REFERENCES scenario_definition_versions(project_id, scenario_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, experiment_id, experiment_version_id)
    REFERENCES experiment_definition_versions(project_id, experiment_id, id) ON DELETE CASCADE,
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE breaker_policy_states (
  project_id      UUID        NOT NULL,
  policy_id       UUID        NOT NULL,
  environment     TEXT        NOT NULL CHECK (
    environment IN ('development', 'preview', 'production')
  ),
  status          TEXT        NOT NULL DEFAULT 'armed' CHECK (status IN ('armed', 'disabled')),
  revision        BIGINT      NOT NULL DEFAULT 1 CHECK (revision > 0),
  trip_count      INTEGER     NOT NULL DEFAULT 0 CHECK (trip_count >= 0),
  last_tripped_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, policy_id),
  FOREIGN KEY (project_id, policy_id)
    REFERENCES breaker_policies(project_id, id) ON DELETE CASCADE
);

CREATE TABLE breaker_owner_approvals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL,
  policy_id         UUID        NOT NULL,
  actor_user_id     UUID        NOT NULL,
  external_actor_id TEXT        NOT NULL CHECK (
    external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$'
  ),
  reason            TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, policy_id)
    REFERENCES breaker_policies(project_id, id) ON DELETE CASCADE,
  UNIQUE (project_id, policy_id),
  UNIQUE (project_id, id)
);

CREATE TABLE breaker_confirmations (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID        NOT NULL,
  policy_id                 UUID        NOT NULL,
  evidence_id               UUID        NOT NULL,
  expected_policy_revision  BIGINT      NOT NULL CHECK (expected_policy_revision > 0),
  expected_snapshot_version BIGINT      NOT NULL CHECK (expected_snapshot_version >= 0),
  phrase_hash               TEXT        NOT NULL CHECK (phrase_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id             UUID        NOT NULL,
  external_actor_id         TEXT        NOT NULL CHECK (
    external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$'
  ),
  reason                    TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  expires_at                TIMESTAMPTZ NOT NULL,
  used_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, policy_id)
    REFERENCES breaker_policies(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, evidence_id)
    REFERENCES scenario_impact_evidence(project_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at AND expires_at - created_at <= INTERVAL '10 minutes'),
  CHECK (used_at IS NULL OR used_at >= created_at),
  UNIQUE (project_id, id)
);

CREATE TABLE breaker_trip_records (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID        NOT NULL,
  policy_id            UUID        NOT NULL,
  policy_revision      BIGINT      NOT NULL CHECK (policy_revision > 0),
  evidence_id          UUID        NOT NULL,
  confirmation_id      UUID,
  mode                 TEXT        NOT NULL CHECK (mode IN ('manual', 'automatic')),
  observed_basis_points INTEGER    NOT NULL,
  old_version_id       UUID,
  protective_version_id UUID       NOT NULL,
  old_snapshot_version BIGINT      NOT NULL CHECK (old_snapshot_version >= 0),
  new_snapshot_version BIGINT      NOT NULL CHECK (new_snapshot_version > old_snapshot_version),
  actor_user_id        UUID        NOT NULL,
  external_actor_id    TEXT        NOT NULL CHECK (
    external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$|^system:automatic_breaker$'
  ),
  reason               TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, policy_id)
    REFERENCES breaker_policies(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, evidence_id)
    REFERENCES scenario_impact_evidence(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, confirmation_id)
    REFERENCES breaker_confirmations(project_id, id) ON DELETE RESTRICT,
  UNIQUE (project_id, policy_id, evidence_id, mode),
  UNIQUE (project_id, id)
);

CREATE TABLE breaker_audit (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL,
  policy_id         UUID,
  evidence_id       UUID,
  trip_id           UUID,
  action            TEXT        NOT NULL CHECK (action IN (
    'policy_created', 'owner_approved', 'confirmation_prepared', 'tripped'
  )),
  actor_user_id     UUID        NOT NULL,
  external_actor_id TEXT        NOT NULL CHECK (
    external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$|^system:automatic_breaker$'
  ),
  reason            TEXT        NOT NULL CHECK (
    char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''
  ),
  metadata          JSONB       NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 4096
  ),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX breaker_audit_project_created_idx ON breaker_audit(project_id, created_at DESC);

ALTER TABLE breaker_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaker_policy_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaker_owner_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaker_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaker_trip_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaker_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.forbid_breaker_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'breaker policy evidence is immutable' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION private.forbid_breaker_immutable_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER breaker_policies_immutable_trg
  BEFORE UPDATE OR DELETE ON breaker_policies
  FOR EACH ROW EXECUTE FUNCTION private.forbid_breaker_immutable_mutation();
CREATE TRIGGER breaker_owner_approvals_immutable_trg
  BEFORE UPDATE OR DELETE ON breaker_owner_approvals
  FOR EACH ROW EXECUTE FUNCTION private.forbid_breaker_immutable_mutation();
CREATE TRIGGER breaker_trip_records_immutable_trg
  BEFORE UPDATE OR DELETE ON breaker_trip_records
  FOR EACH ROW EXECUTE FUNCTION private.forbid_breaker_immutable_mutation();
CREATE TRIGGER breaker_audit_immutable_trg
  BEFORE UPDATE OR DELETE ON breaker_audit
  FOR EACH ROW EXECUTE FUNCTION private.forbid_breaker_immutable_mutation();

CREATE OR REPLACE FUNCTION create_breaker_policy(
  p_key_hash TEXT,
  p_policy_key TEXT,
  p_definition JSONB,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (policy_id UUID, revision BIGINT, created BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_flag_id UUID;
  v_flag_version_id UUID;
  v_safe_definition JSONB;
  v_scenario_id UUID;
  v_scenario_version_id UUID;
  v_experiment_id UUID;
  v_experiment_version_id UUID;
  v_existing public.breaker_policies%ROWTYPE;
  v_policy_id UUID;
  v_protective_value JSONB;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_policy_key IS NULL OR p_policy_key !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR private.breaker_policy_definition_is_valid(p_definition) IS NOT TRUE
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN
    RAISE EXCEPTION 'invalid breaker policy command' USING ERRCODE = '22023';
  END IF;

  SELECT registry.id, version.id, version.definition
  INTO v_flag_id, v_flag_version_id, v_safe_definition
  FROM public.flag_registries registry
  JOIN public.flag_definition_versions version
    ON version.project_id = registry.project_id AND version.flag_id = registry.id
  WHERE registry.project_id = v_key.project_id
    AND registry.key = p_definition#>>'{flag,key}'
    AND version.version = (p_definition#>>'{flag,definitionVersion}')::INTEGER;
  IF NOT FOUND
     OR v_safe_definition->'rules' IS DISTINCT FROM '[]'::JSONB
     OR v_safe_definition->>'defaultVariantKey'
        IS DISTINCT FROM p_definition#>>'{flag,protectiveVariantKey}'
  THEN
    RAISE EXCEPTION 'breaker protective flag version is not a static safe definition'
      USING ERRCODE = '22023';
  END IF;
  SELECT variant->'value' INTO v_protective_value
  FROM jsonb_array_elements(v_safe_definition->'variants') variant
  WHERE variant->>'key' = p_definition#>>'{flag,protectiveVariantKey}';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'breaker protective variant does not exist' USING ERRCODE = '22023';
  END IF;
  IF (p_definition#>>'{flag,protectiveDirection}' = 'enable' AND v_protective_value <> 'true'::JSONB)
     OR (p_definition#>>'{flag,protectiveDirection}' = 'disable' AND v_protective_value <> 'false'::JSONB)
  THEN
    RAISE EXCEPTION 'breaker protective direction contradicts the safe variant'
      USING ERRCODE = '22023';
  END IF;

  SELECT registry.id, version.id INTO v_scenario_id, v_scenario_version_id
  FROM public.scenario_registries registry
  JOIN public.scenario_definition_versions version
    ON version.project_id = registry.project_id AND version.scenario_id = registry.id
  WHERE registry.project_id = v_key.project_id
    AND registry.key = p_definition#>>'{evidence,scenario,key}'
    AND version.version = (p_definition#>>'{evidence,scenario,definitionVersion}')::INTEGER;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'breaker scenario version does not exist' USING ERRCODE = '22023';
  END IF;
  SELECT registry.id, version.id INTO v_experiment_id, v_experiment_version_id
  FROM public.experiment_registries registry
  JOIN public.experiment_definition_versions version
    ON version.project_id = registry.project_id AND version.experiment_id = registry.id
  WHERE registry.project_id = v_key.project_id
    AND registry.key = p_definition#>>'{evidence,experiment,key}'
    AND version.version = (p_definition#>>'{evidence,experiment,definitionVersion}')::INTEGER;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'breaker experiment version does not exist' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':breaker:' || p_policy_key, 0
  ));
  SELECT policy.* INTO v_existing
  FROM public.breaker_policies policy
  WHERE policy.project_id = v_key.project_id AND policy.key = p_policy_key;
  IF FOUND THEN
    IF v_existing.definition IS DISTINCT FROM p_definition THEN
      RAISE EXCEPTION 'breaker policy key is already defined differently' USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT v_existing.id, state.revision, false
    FROM public.breaker_policy_states state
    WHERE state.project_id = v_existing.project_id AND state.policy_id = v_existing.id;
    RETURN;
  END IF;
  INSERT INTO public.breaker_policies(
    project_id, key, definition, flag_id, protective_version_id,
    scenario_id, scenario_version_id, experiment_id, experiment_version_id, created_by
  ) VALUES (
    v_key.project_id, p_policy_key, p_definition, v_flag_id, v_flag_version_id,
    v_scenario_id, v_scenario_version_id, v_experiment_id, v_experiment_version_id,
    v_key.flag_actor_user_id
  ) RETURNING id INTO v_policy_id;
  INSERT INTO public.breaker_policy_states(project_id, policy_id, environment)
  VALUES (v_key.project_id, v_policy_id, v_key.flag_environment);
  INSERT INTO public.breaker_audit(
    project_id, policy_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_policy_id, 'policy_created', v_key.flag_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_policy_id, 1::BIGINT, true;
END;
$$;

CREATE OR REPLACE FUNCTION approve_breaker_automatic(
  p_key_hash TEXT,
  p_policy_id UUID,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (approval_id UUID, created BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_policy public.breaker_policies%ROWTYPE;
  v_existing UUID;
  v_id UUID;
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN RAISE EXCEPTION 'invalid breaker approval' USING ERRCODE = '22023'; END IF;
  SELECT policy.* INTO v_policy FROM public.breaker_policies policy
  WHERE policy.project_id = v_key.project_id AND policy.id = p_policy_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_policy.definition->>'confirmationMode' <> 'owner_preapproved_emergency' THEN
    RAISE EXCEPTION 'manual breaker policies cannot be approved for automation'
      USING ERRCODE = '22023';
  END IF;
  SELECT approval.id INTO v_existing FROM public.breaker_owner_approvals approval
  WHERE approval.project_id = v_key.project_id AND approval.policy_id = v_policy.id;
  IF FOUND THEN RETURN QUERY SELECT v_existing, false; RETURN; END IF;
  INSERT INTO public.breaker_owner_approvals(
    project_id, policy_id, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_policy.id, v_key.flag_actor_user_id, p_external_actor_id, p_reason
  ) RETURNING id INTO v_id;
  INSERT INTO public.breaker_audit(
    project_id, policy_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_policy.id, 'owner_approved', v_key.flag_actor_user_id,
    p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_breaker_evidence(
  p_project_id UUID,
  p_policy_id UUID,
  p_evidence_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS TABLE (eligible BOOLEAN, reason TEXT, observed_basis_points INTEGER)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_policy public.breaker_policies%ROWTYPE;
  v_evidence public.scenario_impact_evidence%ROWTYPE;
  v_metric JSONB;
  v_observed INTEGER;
  v_min_sample INTEGER;
BEGIN
  SELECT policy.* INTO v_policy FROM public.breaker_policies policy
  WHERE policy.project_id = p_project_id AND policy.id = p_policy_id;
  SELECT evidence.* INTO v_evidence FROM public.scenario_impact_evidence evidence
  WHERE evidence.project_id = p_project_id AND evidence.id = p_evidence_id;
  IF v_policy.id IS NULL OR v_evidence.id IS NULL THEN
    RETURN QUERY SELECT false, 'reference_mismatch'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF v_evidence.scenario_id <> v_policy.scenario_id
     OR v_evidence.scenario_version_id <> v_policy.scenario_version_id
     OR v_evidence.experiment_id <> v_policy.experiment_id
     OR v_evidence.experiment_version_id <> v_policy.experiment_version_id THEN
    RETURN QUERY SELECT false, 'reference_mismatch'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF (v_evidence.evidence->>'generatedAt')::TIMESTAMPTZ > p_now
     OR p_now - (v_evidence.evidence->>'generatedAt')::TIMESTAMPTZ >
        make_interval(secs => (v_policy.definition->>'windowSeconds')::INTEGER) THEN
    RETURN QUERY SELECT false, 'evidence_expired'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF v_evidence.evidence#>>'{canonicalAnalysis,integrityReady}' <> 'true' THEN
    RETURN QUERY SELECT false, 'integrity_blocked'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  v_min_sample := (v_policy.definition#>>'{evidence,minimumSamplePerVariant}')::INTEGER;
  IF v_evidence.evidence#>>'{canonicalAnalysis,decisionReady}' <> 'true'
     OR v_evidence.evidence#>>'{canonicalAnalysis,sampleStatus}' <> 'met'
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_evidence.evidence#>'{canonicalAnalysis,variants}') variant
       WHERE (variant->>'observedSubjects')::INTEGER < v_min_sample
     ) THEN
    RETURN QUERY SELECT false, 'sample_blocked'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF v_policy.definition#>>'{evidence,metricRole}' = 'primary' THEN
    v_metric := v_evidence.evidence#>'{canonicalAnalysis,primaryMetric}';
  ELSE
    SELECT metric INTO v_metric
    FROM jsonb_array_elements(v_evidence.evidence#>'{canonicalAnalysis,guardrailMetrics}') metric
    WHERE metric->>'event' = v_policy.definition#>>'{evidence,metricEvent}';
  END IF;
  IF v_metric IS NULL OR v_metric->>'event' <> v_policy.definition#>>'{evidence,metricEvent}' THEN
    RETURN QUERY SELECT false, 'metric_missing'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF v_policy.definition#>>'{evidence,adverseDirection}' = 'increase' THEN
    SELECT max(round((variant->>'absoluteDeltaFromControl')::NUMERIC * 10000))::INTEGER
    INTO v_observed
    FROM jsonb_array_elements(v_metric->'variants') variant
    WHERE jsonb_typeof(variant->'absoluteDeltaFromControl') = 'number';
  ELSE
    SELECT min(round((variant->>'absoluteDeltaFromControl')::NUMERIC * 10000))::INTEGER
    INTO v_observed
    FROM jsonb_array_elements(v_metric->'variants') variant
    WHERE jsonb_typeof(variant->'absoluteDeltaFromControl') = 'number';
  END IF;
  IF v_observed IS NULL THEN
    RETURN QUERY SELECT false, 'metric_missing'::TEXT, NULL::INTEGER; RETURN;
  END IF;
  IF (
    v_policy.definition#>>'{evidence,adverseDirection}' = 'increase'
    AND v_observed >= (v_policy.definition#>>'{evidence,thresholdBasisPoints}')::INTEGER
  ) OR (
    v_policy.definition#>>'{evidence,adverseDirection}' = 'decrease'
    AND v_observed <= -(v_policy.definition#>>'{evidence,thresholdBasisPoints}')::INTEGER
  ) THEN
    RETURN QUERY SELECT true, 'threshold_crossed'::TEXT, v_observed; RETURN;
  END IF;
  RETURN QUERY SELECT false, 'threshold_not_crossed'::TEXT, v_observed;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'integrity_blocked'::TEXT, NULL::INTEGER;
END;
$$;
REVOKE ALL ON FUNCTION private.resolve_breaker_evidence(UUID,UUID,UUID,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION prepare_breaker_confirmation(
  p_key_hash TEXT,
  p_policy_id UUID,
  p_evidence_id UUID,
  p_expected_policy_revision BIGINT,
  p_expected_snapshot_version BIGINT,
  p_phrase_hash TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (confirmation_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_state public.breaker_policy_states%ROWTYPE;
  v_flag_state public.flag_environment_states%ROWTYPE;
  v_resolution RECORD;
  v_id UUID;
  v_expiry TIMESTAMPTZ := statement_timestamp() + INTERVAL '5 minutes';
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_phrase_hash IS NULL OR p_phrase_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$'
  THEN RAISE EXCEPTION 'invalid breaker confirmation' USING ERRCODE = '22023'; END IF;
  SELECT state.* INTO v_state FROM public.breaker_policy_states state
  WHERE state.project_id = v_key.project_id AND state.policy_id = p_policy_id;
  SELECT state.* INTO v_flag_state FROM public.flag_environment_states state
  WHERE state.project_id = v_key.project_id AND state.environment = v_key.flag_environment;
  IF v_state.policy_id IS NULL OR v_flag_state.project_id IS NULL THEN RETURN; END IF;
  IF v_state.status <> 'armed' OR v_state.revision <> p_expected_policy_revision
     OR v_flag_state.snapshot_version <> p_expected_snapshot_version THEN
    RAISE EXCEPTION 'breaker state changed' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_resolution FROM private.resolve_breaker_evidence(
    v_key.project_id, p_policy_id, p_evidence_id, statement_timestamp()
  );
  IF NOT v_resolution.eligible THEN
    RAISE EXCEPTION 'breaker evidence is not eligible: %', v_resolution.reason
      USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.breaker_confirmations(
    project_id, policy_id, evidence_id, expected_policy_revision,
    expected_snapshot_version, phrase_hash, actor_user_id, external_actor_id, reason, expires_at
  ) VALUES (
    v_key.project_id, p_policy_id, p_evidence_id, p_expected_policy_revision,
    p_expected_snapshot_version, p_phrase_hash, v_key.flag_actor_user_id,
    p_external_actor_id, p_reason, v_expiry
  ) RETURNING id INTO v_id;
  INSERT INTO public.breaker_audit(
    project_id, policy_id, evidence_id, action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, p_policy_id, p_evidence_id, 'confirmation_prepared',
    v_key.flag_actor_user_id, p_external_actor_id, p_reason
  );
  RETURN QUERY SELECT v_id, v_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION trip_breaker_policy(
  p_key_hash TEXT,
  p_policy_id UUID,
  p_evidence_id UUID,
  p_expected_policy_revision BIGINT,
  p_expected_snapshot_version BIGINT,
  p_mode TEXT,
  p_confirmation_id UUID,
  p_phrase_hash TEXT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (
  trip_id UUID,
  policy_revision BIGINT,
  snapshot_version BIGINT,
  trip_count INTEGER,
  changed BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_policy public.breaker_policies%ROWTYPE;
  v_state public.breaker_policy_states%ROWTYPE;
  v_flag_state public.flag_environment_states%ROWTYPE;
  v_confirmation public.breaker_confirmations%ROWTYPE;
  v_resolution RECORD;
  v_old_version_id UUID;
  v_trip_id UUID;
  v_actor TEXT;
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  SELECT * INTO v_key FROM private.active_scenario_admin_key(p_key_hash);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_mode NOT IN ('manual', 'automatic')
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR (
       p_mode = 'manual'
       AND (p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$')
     )
     OR (
       p_mode = 'automatic'
       AND p_external_actor_id IS DISTINCT FROM 'system:automatic_breaker'
     )
  THEN RAISE EXCEPTION 'invalid breaker trip command' USING ERRCODE = '22023'; END IF;
  v_actor := p_external_actor_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_key.project_id::TEXT || ':' || v_key.flag_environment, 0
  ));
  SELECT policy.* INTO v_policy FROM public.breaker_policies policy
  WHERE policy.project_id = v_key.project_id AND policy.id = p_policy_id;
  SELECT state.* INTO v_state FROM public.breaker_policy_states state
  WHERE state.project_id = v_key.project_id AND state.policy_id = p_policy_id
  FOR UPDATE;
  SELECT state.* INTO v_flag_state FROM public.flag_environment_states state
  WHERE state.project_id = v_key.project_id AND state.environment = v_key.flag_environment
  FOR UPDATE;
  IF v_policy.id IS NULL OR v_state.policy_id IS NULL OR v_flag_state.project_id IS NULL THEN RETURN; END IF;
  IF v_state.status <> 'armed' OR v_state.revision <> p_expected_policy_revision
     OR v_flag_state.snapshot_version <> p_expected_snapshot_version THEN
    RAISE EXCEPTION 'breaker state changed' USING ERRCODE = 'P0001';
  END IF;
  IF v_state.trip_count >= (v_policy.definition->>'maxTrips')::INTEGER THEN
    RAISE EXCEPTION 'breaker maximum trips reached' USING ERRCODE = '55000';
  END IF;
  IF v_state.last_tripped_at IS NOT NULL
     AND v_now - v_state.last_tripped_at <
       make_interval(secs => (v_policy.definition->>'cooldownSeconds')::INTEGER) THEN
    RAISE EXCEPTION 'breaker is in cooldown' USING ERRCODE = '55000';
  END IF;

  IF p_mode = 'manual' THEN
    SELECT confirmation.* INTO v_confirmation
    FROM public.breaker_confirmations confirmation
    WHERE confirmation.project_id = v_key.project_id
      AND confirmation.id = p_confirmation_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_confirmation.policy_id <> v_policy.id
       OR v_confirmation.evidence_id <> p_evidence_id
       OR v_confirmation.expected_policy_revision <> p_expected_policy_revision
       OR v_confirmation.expected_snapshot_version <> p_expected_snapshot_version
       OR v_confirmation.phrase_hash IS DISTINCT FROM p_phrase_hash
       OR v_confirmation.external_actor_id <> p_external_actor_id
       OR v_confirmation.used_at IS NOT NULL
       OR v_confirmation.expires_at <= v_now THEN
      RAISE EXCEPTION 'invalid or expired breaker confirmation' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_policy.definition->>'confirmationMode' <> 'owner_preapproved_emergency'
       OR NOT EXISTS (
         SELECT 1 FROM public.breaker_owner_approvals approval
         WHERE approval.project_id = v_key.project_id AND approval.policy_id = v_policy.id
       ) THEN
      RAISE EXCEPTION 'breaker automatic trip is not owner approved' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_resolution FROM private.resolve_breaker_evidence(
    v_key.project_id, v_policy.id, p_evidence_id, v_now
  );
  IF NOT v_resolution.eligible THEN
    RAISE EXCEPTION 'breaker evidence is not eligible: %', v_resolution.reason
      USING ERRCODE = '55000';
  END IF;
  SELECT activation.version_id INTO v_old_version_id
  FROM public.flag_environment_activations activation
  WHERE activation.project_id = v_key.project_id
    AND activation.environment = v_key.flag_environment
    AND activation.flag_id = v_policy.flag_id
  FOR UPDATE;
  IF NOT FOUND OR v_old_version_id = v_policy.protective_version_id THEN
    RAISE EXCEPTION 'breaker flag is already protective or inactive' USING ERRCODE = '55000';
  END IF;

  UPDATE public.flag_environment_activations
  SET version_id = v_policy.protective_version_id,
      updated_by = v_key.flag_actor_user_id,
      updated_at = v_now
  WHERE project_id = v_key.project_id
    AND environment = v_key.flag_environment
    AND flag_id = v_policy.flag_id
    AND version_id = v_old_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'breaker activation changed' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.flag_environment_states
  SET snapshot_version = public.flag_environment_states.snapshot_version + 1,
      updated_at = v_now
  WHERE project_id = v_key.project_id AND environment = v_key.flag_environment
  RETURNING * INTO v_flag_state;
  UPDATE public.breaker_policy_states
  SET revision = public.breaker_policy_states.revision + 1,
      trip_count = public.breaker_policy_states.trip_count + 1,
      last_tripped_at = v_now,
      updated_at = v_now
  WHERE project_id = v_key.project_id AND policy_id = v_policy.id
  RETURNING * INTO v_state;
  IF p_mode = 'manual' THEN
    UPDATE public.breaker_confirmations SET used_at = v_now
    WHERE project_id = v_key.project_id AND id = v_confirmation.id;
  END IF;
  INSERT INTO public.flag_lifecycle_audit(
    project_id, environment, flag_id, old_version_id, new_version_id,
    action, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_key.flag_environment, v_policy.flag_id, v_old_version_id,
    v_policy.protective_version_id, 'activated', v_key.flag_actor_user_id,
    CASE WHEN p_mode = 'manual' THEN v_actor ELSE NULL END,
    p_reason
  );
  INSERT INTO public.breaker_trip_records(
    project_id, policy_id, policy_revision, evidence_id, confirmation_id, mode,
    observed_basis_points, old_version_id, protective_version_id,
    old_snapshot_version, new_snapshot_version, actor_user_id, external_actor_id, reason
  ) VALUES (
    v_key.project_id, v_policy.id, p_expected_policy_revision, p_evidence_id,
    CASE WHEN p_mode = 'manual' THEN v_confirmation.id ELSE NULL END, p_mode,
    v_resolution.observed_basis_points, v_old_version_id, v_policy.protective_version_id,
    p_expected_snapshot_version, v_flag_state.snapshot_version,
    v_key.flag_actor_user_id, v_actor, p_reason
  ) RETURNING id INTO v_trip_id;
  INSERT INTO public.breaker_audit(
    project_id, policy_id, evidence_id, trip_id, action,
    actor_user_id, external_actor_id, reason,
    metadata
  ) VALUES (
    v_key.project_id, v_policy.id, p_evidence_id, v_trip_id, 'tripped',
    v_key.flag_actor_user_id, v_actor, p_reason,
    jsonb_build_object(
      'mode', p_mode,
      'observedBasisPoints', v_resolution.observed_basis_points,
      'snapshotVersion', v_flag_state.snapshot_version
    )
  );
  RETURN QUERY SELECT
    v_trip_id, v_state.revision, v_flag_state.snapshot_version, v_state.trip_count, true;
END;
$$;

CREATE OR REPLACE FUNCTION get_breaker_admin_snapshot(p_key_hash TEXT)
RETURNS TABLE (
  environment TEXT,
  snapshot_version BIGINT,
  generated_at TIMESTAMPTZ,
  policies JSONB,
  approvals JSONB,
  trips JSONB,
  audit JSONB
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
  RETURN QUERY SELECT
    v_key.flag_environment,
    COALESCE((
      SELECT state.snapshot_version FROM public.flag_environment_states state
      WHERE state.project_id = v_key.project_id AND state.environment = v_key.flag_environment
    ), 0),
    statement_timestamp(),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', policy.id, 'key', policy.key, 'definition', policy.definition,
        'status', state.status, 'revision', state.revision, 'tripCount', state.trip_count,
        'lastTrippedAt', state.last_tripped_at, 'createdAt', policy.created_at
      ) ORDER BY policy.created_at DESC, policy.id)
      FROM public.breaker_policies policy
      JOIN public.breaker_policy_states state
        ON state.project_id = policy.project_id AND state.policy_id = policy.id
      WHERE policy.project_id = v_key.project_id
        AND state.environment = v_key.flag_environment
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', approval.id, 'policyId', approval.policy_id,
        'externalActorId', approval.external_actor_id, 'reason', approval.reason,
        'createdAt', approval.created_at
      ) ORDER BY approval.created_at DESC, approval.id)
      FROM public.breaker_owner_approvals approval
      WHERE approval.project_id = v_key.project_id
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', trip.id, 'policyId', trip.policy_id, 'evidenceId', trip.evidence_id,
        'mode', trip.mode, 'observedBasisPoints', trip.observed_basis_points,
        'oldSnapshotVersion', trip.old_snapshot_version,
        'newSnapshotVersion', trip.new_snapshot_version,
        'externalActorId', trip.external_actor_id, 'reason', trip.reason,
        'createdAt', trip.created_at
      ) ORDER BY trip.created_at DESC, trip.id)
      FROM (
        SELECT * FROM public.breaker_trip_records item
        WHERE item.project_id = v_key.project_id
        ORDER BY item.created_at DESC, item.id LIMIT 100
      ) trip
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', entry.id, 'policyId', entry.policy_id, 'evidenceId', entry.evidence_id,
        'tripId', entry.trip_id, 'action', entry.action,
        'externalActorId', entry.external_actor_id, 'reason', entry.reason,
        'metadata', entry.metadata, 'createdAt', entry.created_at
      ) ORDER BY entry.created_at DESC, entry.id)
      FROM (
        SELECT * FROM public.breaker_audit item
        WHERE item.project_id = v_key.project_id
        ORDER BY item.created_at DESC, item.id LIMIT 100
      ) entry
    ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON TABLE
  breaker_policies, breaker_policy_states, breaker_owner_approvals,
  breaker_confirmations, breaker_trip_records, breaker_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE
  breaker_policies, breaker_policy_states, breaker_owner_approvals,
  breaker_confirmations, breaker_trip_records, breaker_audit
  TO service_role;
REVOKE ALL ON FUNCTION
  create_breaker_policy(TEXT,TEXT,JSONB,TEXT,TEXT),
  approve_breaker_automatic(TEXT,UUID,TEXT,TEXT),
  prepare_breaker_confirmation(TEXT,UUID,UUID,BIGINT,BIGINT,TEXT,TEXT,TEXT),
  trip_breaker_policy(TEXT,UUID,UUID,BIGINT,BIGINT,TEXT,UUID,TEXT,TEXT,TEXT),
  get_breaker_admin_snapshot(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  create_breaker_policy(TEXT,TEXT,JSONB,TEXT,TEXT),
  approve_breaker_automatic(TEXT,UUID,TEXT,TEXT),
  prepare_breaker_confirmation(TEXT,UUID,UUID,BIGINT,BIGINT,TEXT,TEXT,TEXT),
  trip_breaker_policy(TEXT,UUID,UUID,BIGINT,BIGINT,TEXT,UUID,TEXT,TEXT,TEXT),
  get_breaker_admin_snapshot(TEXT)
  TO service_role;
