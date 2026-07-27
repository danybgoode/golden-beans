-- flag-serving-and-prd-g · Sprint 1, Story 1.4 — immutable experiment-to-flag version binding.
--
-- A binding is evidence, not an operational pointer: it names the exact immutable experiment and
-- flag versions that were reviewed together. The separate table leaves legacy experiment plans
-- readable and avoids rewriting either version payload after creation.

CREATE TABLE experiment_flag_version_bindings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id         UUID        NOT NULL,
  experiment_version_id UUID        NOT NULL,
  flag_id               UUID        NOT NULL,
  flag_version_id       UUID        NOT NULL,
  created_by            UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_flag_binding_experiment_fk
    FOREIGN KEY (project_id, experiment_id, experiment_version_id)
    REFERENCES experiment_definition_versions(project_id, experiment_id, id) ON DELETE CASCADE,
  CONSTRAINT experiment_flag_binding_flag_fk
    FOREIGN KEY (project_id, flag_id, flag_version_id)
    REFERENCES flag_definition_versions(project_id, flag_id, id) ON DELETE RESTRICT,
  -- One experiment plan has one explicit serving contract. A revised plan gets a new immutable
  -- experiment version rather than silently replacing this evidence.
  UNIQUE (experiment_version_id),
  UNIQUE (project_id, experiment_version_id),
  UNIQUE (project_id, id)
);
CREATE INDEX experiment_flag_version_bindings_project_experiment_idx
  ON experiment_flag_version_bindings(project_id, experiment_id);

CREATE TABLE experiment_flag_binding_audit (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL,
  experiment_id         UUID        NOT NULL,
  experiment_version_id UUID        NOT NULL,
  flag_id               UUID        NOT NULL,
  flag_version_id       UUID        NOT NULL,
  actor_user_id         UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX experiment_flag_binding_audit_project_created_idx
  ON experiment_flag_binding_audit(project_id, created_at DESC);

ALTER TABLE experiment_flag_version_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_flag_binding_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE experiment_flag_version_bindings, experiment_flag_binding_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE experiment_flag_version_bindings, experiment_flag_binding_audit TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_experiment_flag_binding_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    -- PostgreSQL's FK cascade enters this trigger beneath the referential-action trigger. Direct
    -- deletion remains forbidden while project cleanup can remove its operational graph.
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'experiment flag bindings are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER experiment_flag_version_bindings_immutable_trg
  BEFORE UPDATE OR DELETE ON experiment_flag_version_bindings
  FOR EACH ROW EXECUTE FUNCTION private.enforce_experiment_flag_binding_immutability();

CREATE OR REPLACE FUNCTION bind_experiment_flag_version(
  p_project_id UUID,
  p_experiment_id UUID,
  p_experiment_version_id UUID,
  p_flag_id UUID,
  p_flag_version_id UUID,
  p_actor_user_id UUID
)
RETURNS TABLE (
  binding_id UUID,
  project_id UUID,
  experiment_id UUID,
  experiment_version_id UUID,
  flag_id UUID,
  flag_version_id UUID,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_experiment_definition JSONB;
  v_flag_definition JSONB;
  v_existing public.experiment_flag_version_bindings%ROWTYPE;
  v_binding_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'experiment flag binding requires project ownership' USING ERRCODE = '42501';
  END IF;

  -- Serialize competing bind attempts. The unique constraint is the backstop; the lock lets an
  -- idempotent retry return the original evidence instead of becoming a transaction error.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_project_id::TEXT || ':' || p_experiment_version_id::TEXT,
    0
  ));

  SELECT version.definition INTO v_experiment_definition
  FROM public.experiment_definition_versions version
  WHERE version.project_id = p_project_id
    AND version.experiment_id = p_experiment_id
    AND version.id = p_experiment_version_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT version.definition INTO v_flag_definition
  FROM public.flag_definition_versions version
  WHERE version.project_id = p_project_id
    AND version.flag_id = p_flag_id
    AND version.id = p_flag_version_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Version names are the join contract between deterministic assignment and local flag
  -- evaluation. Exact set equality prevents a control/treatment plan from being bound to a flag
  -- whose missing or extra variant would make measured exposure non-reproducible.
  IF EXISTS (
    (
      SELECT value->>'key' AS key
      FROM jsonb_array_elements(v_experiment_definition->'variants')
      EXCEPT
      SELECT value->>'key' AS key
      FROM jsonb_array_elements(v_flag_definition->'variants')
    )
    UNION ALL
    (
      SELECT value->>'key' AS key
      FROM jsonb_array_elements(v_flag_definition->'variants')
      EXCEPT
      SELECT value->>'key' AS key
      FROM jsonb_array_elements(v_experiment_definition->'variants')
    )
  ) THEN
    RAISE EXCEPTION 'experiment and flag variants are incompatible' USING ERRCODE = '22023';
  END IF;

  SELECT binding.* INTO v_existing
  FROM public.experiment_flag_version_bindings binding
  WHERE binding.project_id = p_project_id
    AND binding.experiment_version_id = p_experiment_version_id;
  IF FOUND THEN
    IF v_existing.flag_id = p_flag_id AND v_existing.flag_version_id = p_flag_version_id THEN
      RETURN QUERY SELECT
        v_existing.id, v_existing.project_id, v_existing.experiment_id,
        v_existing.experiment_version_id, v_existing.flag_id, v_existing.flag_version_id, false;
    END IF;
    RAISE EXCEPTION 'experiment version is already bound to a different flag version' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.experiment_flag_version_bindings(
    project_id, experiment_id, experiment_version_id, flag_id, flag_version_id, created_by
  ) VALUES (
    p_project_id, p_experiment_id, p_experiment_version_id, p_flag_id, p_flag_version_id,
    p_actor_user_id
  ) RETURNING id INTO v_binding_id;
  INSERT INTO public.experiment_flag_binding_audit(
    project_id, experiment_id, experiment_version_id, flag_id, flag_version_id, actor_user_id
  ) VALUES (
    p_project_id, p_experiment_id, p_experiment_version_id, p_flag_id, p_flag_version_id,
    p_actor_user_id
  );

  RETURN QUERY SELECT
    v_binding_id, p_project_id, p_experiment_id, p_experiment_version_id,
    p_flag_id, p_flag_version_id, true;
END;
$$;

REVOKE ALL ON FUNCTION bind_experiment_flag_version(UUID, UUID, UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bind_experiment_flag_version(UUID, UUID, UUID, UUID, UUID, UUID)
  TO service_role;

-- Migration-time proof: tenant scope, variant compatibility and direct mutation must all fail.
DO $$
DECLARE
  v_project_a UUID;
  v_project_b UUID;
  v_owner_a UUID := '00000000-0000-0000-0000-0000000000a1';
  v_owner_b UUID := '00000000-0000-0000-0000-0000000000b1';
  v_experiment_id UUID;
  v_experiment_version_id UUID;
  v_second_experiment_version_id UUID;
  v_flag_id UUID;
  v_flag_version_id UUID;
  v_foreign_flag_id UUID;
  v_foreign_flag_version_id UUID;
  v_binding_id UUID;
  v_experiment_definition JSONB := '{
    "hypothesis":"Binding migration assertion",
    "assignmentEntityType":"merchant",
    "eligibility":{"description":"All fixtures."},
    "variants":[{"key":"control","weight":1},{"key":"treatment","weight":1}],
    "controlVariantKey":"control",
    "primaryMetric":{"event":"binding_fixture_completed","direction":"increase"},
    "guardrailMetrics":[],"segmentFields":[],
    "plannedWindow":{"startAt":"2026-01-01T00:00:00Z","endAt":"2026-02-01T00:00:00Z"},
    "minimumSamplePerVariant":1
  }'::JSONB;
  v_flag_definition JSONB := '{
    "valueType":"boolean","description":"Binding migration assertion.",
    "defaultVariantKey":"control",
    "variants":[{"key":"control","value":false},{"key":"treatment","value":true}],
    "rules":[]
  }'::JSONB;
BEGIN
  INSERT INTO public.projects(slug, api_key_hash)
  VALUES ('experiment-flag-binding-assertion-a', NULL)
  RETURNING id INTO v_project_a;
  INSERT INTO public.projects(slug, api_key_hash)
  VALUES ('experiment-flag-binding-assertion-b', NULL)
  RETURNING id INTO v_project_b;
  -- The migration must not assume an Auth fixture exists. The RPC's ownership and compatibility
  -- paths are exercised in the integration spec; this SQL proof pins the database's compound
  -- tenant FKs and direct immutability guarantees without inventing auth.users rows.
  INSERT INTO public.experiment_registries(project_id, key, created_by)
  VALUES (v_project_a, 'binding_assertion', v_owner_a)
  RETURNING id INTO v_experiment_id;
  INSERT INTO public.experiment_definition_versions(
    project_id, experiment_id, version, definition, created_by
  ) VALUES (v_project_a, v_experiment_id, 1, v_experiment_definition, v_owner_a)
  RETURNING id INTO v_experiment_version_id;
  INSERT INTO public.experiment_definition_versions(
    project_id, experiment_id, version, definition, created_by
  ) VALUES (v_project_a, v_experiment_id, 2, v_experiment_definition, v_owner_a)
  RETURNING id INTO v_second_experiment_version_id;
  INSERT INTO public.flag_registries(project_id, key, created_by)
  VALUES (v_project_a, 'binding.assertion', v_owner_a)
  RETURNING id INTO v_flag_id;
  INSERT INTO public.flag_definition_versions(
    project_id, flag_id, version, definition, created_by
  ) VALUES (v_project_a, v_flag_id, 1, v_flag_definition, v_owner_a)
  RETURNING id INTO v_flag_version_id;
  INSERT INTO public.flag_registries(project_id, key, created_by)
  VALUES (v_project_b, 'binding.assertion', v_owner_b)
  RETURNING id INTO v_foreign_flag_id;
  INSERT INTO public.flag_definition_versions(
    project_id, flag_id, version, definition, created_by
  ) VALUES (v_project_b, v_foreign_flag_id, 1, v_flag_definition, v_owner_b)
  RETURNING id INTO v_foreign_flag_version_id;

  INSERT INTO public.experiment_flag_version_bindings(
    project_id, experiment_id, experiment_version_id, flag_id, flag_version_id, created_by
  ) VALUES (
    v_project_a, v_experiment_id, v_experiment_version_id, v_flag_id, v_flag_version_id, v_owner_a
  ) RETURNING id INTO v_binding_id;
  INSERT INTO public.experiment_flag_binding_audit(
    project_id, experiment_id, experiment_version_id, flag_id, flag_version_id, actor_user_id
  ) VALUES (
    v_project_a, v_experiment_id, v_experiment_version_id, v_flag_id, v_flag_version_id, v_owner_a
  );

  BEGIN
    INSERT INTO public.experiment_flag_version_bindings(
      project_id, experiment_id, experiment_version_id, flag_id, flag_version_id, created_by
    ) VALUES (
      v_project_a, v_experiment_id, v_second_experiment_version_id,
      v_foreign_flag_id, v_foreign_flag_version_id, v_owner_a
    );
    RAISE EXCEPTION 'cross-project flag version unexpectedly bound';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.experiment_flag_version_bindings SET created_by = v_owner_b WHERE id = v_binding_id;
    RAISE EXCEPTION 'binding UPDATE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.experiment_flag_version_bindings WHERE id = v_binding_id;
    RAISE EXCEPTION 'binding DELETE unexpectedly bypassed immutability';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  DELETE FROM public.projects WHERE id IN (v_project_a, v_project_b);
  IF EXISTS (SELECT 1 FROM public.experiment_flag_version_bindings WHERE id = v_binding_id) THEN
    RAISE EXCEPTION 'project cleanup left an experiment flag binding behind';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.experiment_flag_binding_audit
    WHERE project_id = v_project_a AND experiment_version_id = v_experiment_version_id
      AND flag_version_id = v_flag_version_id AND actor_user_id = v_owner_a
  ) THEN
    RAISE EXCEPTION 'binding creation did not retain actor-time audit evidence';
  END IF;
  DELETE FROM public.experiment_flag_binding_audit
  WHERE project_id IN (v_project_a, v_project_b);
END;
$$;

COMMENT ON TABLE experiment_flag_version_bindings IS
  'Immutable same-project evidence joining a governed experiment version to an exact compatible flag version.';
COMMENT ON TABLE experiment_flag_binding_audit IS
  'Append-only actor-time evidence written atomically whenever an immutable experiment/flag binding is created.';
