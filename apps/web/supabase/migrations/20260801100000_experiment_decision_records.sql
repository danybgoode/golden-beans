-- experiment-governance-v2 · Sprint 3 — append-only human decision evidence.
-- EXPAND-only; application surfaces remain dark behind EXPERIMENT_GOVERNANCE_ENABLED.

CREATE OR REPLACE FUNCTION private.experiment_analysis_snapshot_is_valid(p_snapshot JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(
    p_snapshot IS NOT NULL
    AND jsonb_typeof(p_snapshot) = 'object'
    AND octet_length(p_snapshot::TEXT) <= 262144
    AND jsonb_typeof(p_snapshot->'integrityReady') = 'boolean'
    AND jsonb_typeof(p_snapshot->'decisionReady') = 'boolean'
    AND jsonb_typeof(p_snapshot->'blockers') = 'array'
    AND jsonb_typeof(p_snapshot->'primaryMetric') = 'object'
    AND jsonb_typeof(p_snapshot->'guardrailMetrics') = 'array'
    AND jsonb_typeof(p_snapshot->'diagnostics') = 'object'
    AND jsonb_typeof(p_snapshot#>'{diagnostics,srm}') = 'object'
    AND jsonb_typeof(p_snapshot#>'{diagnostics,integrity}') = 'array',
    false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.experiment_analysis_snapshot_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE experiment_decision_records (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identifiers deliberately carry no cascading operational FKs. A project cleanup removes
  -- the live registry but retains the human decision and the exact evidence used to make it.
  project_id            UUID        NOT NULL,
  experiment_id         UUID        NOT NULL,
  version_id            UUID        NOT NULL,
  definition_version    INTEGER     NOT NULL CHECK (definition_version > 0),
  ordinal               INTEGER     NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  record_kind           TEXT        NOT NULL CHECK (record_kind IN ('decision', 'correction')),
  supersedes_record_id  UUID,
  outcome               TEXT        NOT NULL
    CHECK (outcome IN ('ship_treatment', 'keep_control', 'iterate', 'inconclusive', 'invalid')),
  chosen_variant_key    TEXT        CHECK (
    chosen_variant_key IS NULL OR chosen_variant_key ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  rationale             TEXT        NOT NULL CHECK (
    char_length(rationale) BETWEEN 1 AND 2000
    AND btrim(
      rationale,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    ) <> ''
  ),
  definition_snapshot   JSONB       NOT NULL
    CHECK (private.experiment_definition_is_valid(definition_snapshot)),
  analysis_snapshot     JSONB       NOT NULL
    CHECK (private.experiment_analysis_snapshot_is_valid(analysis_snapshot)),
  -- Derived by the RPC from the full analysis snapshot, never independently supplied by a caller.
  integrity_snapshot    JSONB       NOT NULL CHECK (
    jsonb_typeof(integrity_snapshot) = 'object'
    AND jsonb_typeof(integrity_snapshot->'integrityReady') = 'boolean'
    AND jsonb_typeof(integrity_snapshot->'decisionReady') = 'boolean'
    AND jsonb_typeof(integrity_snapshot->'blockers') = 'array'
    AND jsonb_typeof(integrity_snapshot->'srm') = 'object'
    AND jsonb_typeof(integrity_snapshot->'diagnostics') = 'array'
  ),
  actor_user_id         UUID        NOT NULL,
  idempotency_key       UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_decision_kind_shape CHECK (
    (record_kind = 'decision' AND ordinal = 1 AND supersedes_record_id IS NULL)
    OR (record_kind = 'correction' AND ordinal > 1 AND supersedes_record_id IS NOT NULL)
  ),
  CONSTRAINT experiment_decision_chosen_shape CHECK (
    (outcome IN ('ship_treatment', 'keep_control') AND chosen_variant_key IS NOT NULL)
    OR (outcome IN ('iterate', 'inconclusive', 'invalid') AND chosen_variant_key IS NULL)
  ),
  UNIQUE (project_id, experiment_id, version_id, ordinal),
  UNIQUE (project_id, experiment_id, version_id, idempotency_key),
  UNIQUE (project_id, experiment_id, version_id, id),
  CONSTRAINT experiment_decision_supersedes_same_version_fk
    FOREIGN KEY (project_id, experiment_id, version_id, supersedes_record_id)
    REFERENCES experiment_decision_records(project_id, experiment_id, version_id, id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX experiment_one_initial_decision_idx
  ON experiment_decision_records(project_id, experiment_id, version_id)
  WHERE record_kind = 'decision';
CREATE INDEX experiment_decision_records_project_version_idx
  ON experiment_decision_records(project_id, experiment_id, version_id, ordinal);

ALTER TABLE experiment_decision_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.enforce_experiment_decision_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Migration-owner fixture cleanup is possible only after the operational parent is gone. During
    -- normal operation, even the table owner cannot rewrite history by deleting one record.
    IF EXISTS (
      SELECT 1
      FROM public.experiment_registries registry
      WHERE registry.project_id = OLD.project_id
        AND registry.id = OLD.experiment_id
    ) THEN
      RAISE EXCEPTION 'experiment decision records are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'experiment decision records are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER experiment_decision_records_immutable_trg
  BEFORE UPDATE OR DELETE ON experiment_decision_records
  FOR EACH ROW EXECUTE FUNCTION private.enforce_experiment_decision_immutability();

CREATE OR REPLACE FUNCTION private.reject_experiment_decision_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'experiment decision records are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER experiment_decision_records_no_truncate_trg
  BEFORE TRUNCATE ON experiment_decision_records
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_experiment_decision_truncate();

CREATE OR REPLACE FUNCTION record_experiment_decision(
  p_project_id UUID,
  p_experiment_id UUID,
  p_version_id UUID,
  p_record_kind TEXT,
  p_outcome TEXT,
  p_chosen_variant_key TEXT,
  p_rationale TEXT,
  p_analysis_snapshot JSONB,
  p_actor_user_id UUID,
  p_idempotency_key UUID,
  p_supersedes_record_id UUID DEFAULT NULL
)
RETURNS SETOF experiment_decision_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_version public.experiment_definition_versions%ROWTYPE;
  v_latest public.experiment_decision_records%ROWTYPE;
  v_existing public.experiment_decision_records%ROWTYPE;
  v_inserted public.experiment_decision_records%ROWTYPE;
  v_control_variant TEXT;
  v_existing_history_bytes BIGINT;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_integrity_snapshot JSONB;
BEGIN
  -- Authorization precedes payload validation and record lookup so a malformed or replayed command
  -- cannot disclose whether another project's experiment or idempotency key exists.
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'experiment decisions require project ownership' USING ERRCODE = '42501';
  END IF;

  -- Match the established lifecycle lock order: registry first, then definition version.
  PERFORM 1
  FROM public.experiment_registries registry
  WHERE registry.project_id = p_project_id
    AND registry.id = p_experiment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT candidate.* INTO v_version
  FROM public.experiment_definition_versions candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.experiment_id = p_experiment_id
    AND candidate.id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'decision idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT existing.* INTO v_existing
  FROM public.experiment_decision_records existing
  WHERE existing.project_id = p_project_id
    AND existing.experiment_id = p_experiment_id
    AND existing.version_id = p_version_id
    AND existing.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.record_kind IS DISTINCT FROM p_record_kind
       OR v_existing.outcome IS DISTINCT FROM p_outcome
       OR v_existing.chosen_variant_key IS DISTINCT FROM p_chosen_variant_key
       OR v_existing.rationale IS DISTINCT FROM p_rationale
       OR v_existing.analysis_snapshot IS DISTINCT FROM p_analysis_snapshot
       OR v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_existing.supersedes_record_id IS DISTINCT FROM p_supersedes_record_id THEN
      RAISE EXCEPTION 'decision idempotency key was already used with a different payload'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEXT v_existing;
    RETURN;
  END IF;

  IF p_record_kind IS NULL OR p_record_kind NOT IN ('decision', 'correction') THEN
    RAISE EXCEPTION 'invalid experiment decision record kind' USING ERRCODE = '22023';
  END IF;
  IF p_outcome IS NULL
     OR p_outcome NOT IN ('ship_treatment', 'keep_control', 'iterate', 'inconclusive', 'invalid') THEN
    RAISE EXCEPTION 'invalid experiment decision outcome' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL
     OR char_length(p_rationale) NOT BETWEEN 1 AND 2000
     OR btrim(
       p_rationale,
       U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
     ) = '' THEN
    RAISE EXCEPTION 'invalid experiment decision rationale' USING ERRCODE = '22023';
  END IF;
  IF private.experiment_analysis_snapshot_is_valid(p_analysis_snapshot) IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid experiment analysis snapshot' USING ERRCODE = '22023';
  END IF;

  v_control_variant := v_version.definition->>'controlVariantKey';
  IF p_outcome = 'ship_treatment' THEN
    IF p_chosen_variant_key IS NULL
       OR p_chosen_variant_key = v_control_variant
       OR NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_version.definition->'variants') variant
         WHERE variant->>'key' = p_chosen_variant_key
       ) THEN
      RAISE EXCEPTION 'ship_treatment requires a declared non-control variant' USING ERRCODE = '22023';
    END IF;
  ELSIF p_outcome = 'keep_control' THEN
    IF p_chosen_variant_key IS DISTINCT FROM v_control_variant THEN
      RAISE EXCEPTION 'keep_control requires the declared control variant' USING ERRCODE = '22023';
    END IF;
  ELSIF p_chosen_variant_key IS NOT NULL THEN
    RAISE EXCEPTION 'this decision outcome cannot choose a variant' USING ERRCODE = '22023';
  END IF;

  SELECT candidate.* INTO v_latest
  FROM public.experiment_decision_records candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.experiment_id = p_experiment_id
    AND candidate.version_id = p_version_id
  ORDER BY candidate.ordinal DESC
  LIMIT 1;

  IF p_record_kind = 'decision' THEN
    IF v_version.status <> 'stopped'
       OR v_latest.id IS NOT NULL
       OR p_supersedes_record_id IS NOT NULL THEN
      RAISE EXCEPTION 'initial decision requires an undecided stopped experiment' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF v_version.status <> 'decided'
       OR v_latest.id IS NULL
       OR p_supersedes_record_id IS DISTINCT FROM v_latest.id THEN
      RAISE EXCEPTION 'correction must supersede the latest record of a decided experiment'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF COALESCE(v_latest.ordinal, 0) >= 100 THEN
    RAISE EXCEPTION 'experiment decision history limit reached' USING ERRCODE = '54000';
  END IF;

  v_integrity_snapshot := jsonb_build_object(
    'integrityReady', p_analysis_snapshot->'integrityReady',
    'decisionReady', p_analysis_snapshot->'decisionReady',
    'blockers', p_analysis_snapshot->'blockers',
    'srm', p_analysis_snapshot#>'{diagnostics,srm}',
    'diagnostics', p_analysis_snapshot#>'{diagnostics,integrity}'
  );

  -- Cap the CUMULATIVE readable history by the EXACT same three fields the read resolver sums in
  -- mapExperimentDecisionRows (rationale + analysis + integrity) — so anything accepted here is
  -- guaranteed readable there. Counting analysis alone (an earlier bug) left rationale and integrity
  -- uncounted, so a long-/multi-byte-rationale history could be accepted on write yet fail the read
  -- with `resource_limit`, permanently bricking the whole governed view (append-only, unfixable). The
  -- 4 MiB write cap sits below the read bound MAX_DECISION_HISTORY_BYTES (4.5 MiB); the ~0.5 MiB slack
  -- absorbs only the tiny jsonb-vs-JSON.stringify serialization skew across up to 100 rows, NOT the
  -- rationale/integrity terms (now counted here). An accepted-but-unreadable record is worse than a
  -- rejected write.
  SELECT COALESCE(SUM(octet_length(jsonb_build_object(
    'rationale', candidate.rationale,
    'analysisSnapshot', candidate.analysis_snapshot,
    'integritySnapshot', candidate.integrity_snapshot
  )::TEXT)), 0)
  INTO v_existing_history_bytes
  FROM public.experiment_decision_records candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.experiment_id = p_experiment_id
    AND candidate.version_id = p_version_id;
  IF v_existing_history_bytes + octet_length(jsonb_build_object(
       'rationale', p_rationale,
       'analysisSnapshot', p_analysis_snapshot,
       'integritySnapshot', v_integrity_snapshot
     )::TEXT) > 4194304 THEN
    RAISE EXCEPTION 'experiment decision analysis history payload limit reached'
      USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.experiment_decision_records (
    project_id,
    experiment_id,
    version_id,
    definition_version,
    ordinal,
    record_kind,
    supersedes_record_id,
    outcome,
    chosen_variant_key,
    rationale,
    definition_snapshot,
    analysis_snapshot,
    integrity_snapshot,
    actor_user_id,
    idempotency_key,
    created_at
  )
  VALUES (
    p_project_id,
    p_experiment_id,
    p_version_id,
    v_version.version,
    COALESCE(v_latest.ordinal, 0) + 1,
    p_record_kind,
    p_supersedes_record_id,
    p_outcome,
    p_chosen_variant_key,
    p_rationale,
    v_version.definition,
    p_analysis_snapshot,
    v_integrity_snapshot,
    p_actor_user_id,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_inserted;

  IF p_record_kind = 'decision' THEN
    UPDATE public.experiment_definition_versions target
    SET status = 'decided'
    WHERE target.project_id = p_project_id
      AND target.experiment_id = p_experiment_id
      AND target.id = p_version_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'experiment version disappeared while recording decision' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.experiment_lifecycle_audit (
      project_id,
      experiment_id,
      version_id,
      action,
      actor_user_id,
      created_at
    )
    VALUES (
      p_project_id,
      p_experiment_id,
      p_version_id,
      'version_decided',
      p_actor_user_id,
      v_now
    );
  END IF;

  RETURN NEXT v_inserted;
END;
$$;

REVOKE ALL ON TABLE experiment_decision_records
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE experiment_decision_records TO service_role;

REVOKE ALL ON FUNCTION record_experiment_decision(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_experiment_decision(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, UUID
) TO service_role;

DO $$
BEGIN
  IF has_table_privilege('service_role', 'public.experiment_decision_records', 'INSERT')
     OR has_table_privilege('service_role', 'public.experiment_decision_records', 'UPDATE')
     OR has_table_privilege('service_role', 'public.experiment_decision_records', 'DELETE')
     OR has_table_privilege('service_role', 'public.experiment_decision_records', 'TRUNCATE') THEN
    RAISE EXCEPTION 'experiment_decision_records must be append-only to service_role';
  END IF;
END;
$$;

COMMENT ON TABLE experiment_decision_records IS
  'Append-only human decisions and corrections with immutable definition, analysis and integrity evidence. No product flag or rollout state is stored or mutated here.';
COMMENT ON FUNCTION record_experiment_decision(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, UUID
) IS
  'Owner-only atomic decision/correction writer. Locks registry then version, preserves idempotency, and changes only stopped experiment lifecycle status to decided.';
