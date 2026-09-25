-- experiments-for-humans · Sprint 3, Story 3.2 (epic README D7, as corrected before Sprint 3).
--
-- EXPAND-only: one new table and one new function; nothing existing changes.
--
-- Why a function and not a server action: Save draft is FOUR writes — the experiment version, the
-- flag version (which may create the feature), the binding, and the builder's answers — and a double
-- click between two of them from a server action creates a second version. Here they commit or roll
-- back together, under the SAME advisory lock `create_experiment_version` takes (advisory locks are
-- re-entrant within a transaction), and a second identical save returns the first one's rows.
--
-- Why the answers are stored: a definition cannot be turned back into the answers that produced it
-- (the template, the reason, the smallest change worth knowing about are not in it), and both
-- "Continue reopens at Review" and "a failing check blocks Start" — recomputed on the server, never
-- trusted from the browser — need them.

CREATE TABLE experiment_builder_answers (
  project_id    UUID        NOT NULL,
  experiment_id UUID        NOT NULL,
  version_id    UUID        NOT NULL,
  answers       JSONB       NOT NULL
    CHECK (jsonb_typeof(answers) = 'object' AND octet_length(answers::TEXT) <= 16384),
  created_by    UUID        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, version_id),
  CONSTRAINT experiment_builder_answers_version_fk
    FOREIGN KEY (project_id, experiment_id, version_id)
    REFERENCES experiment_definition_versions(project_id, experiment_id, id) ON DELETE CASCADE
);
ALTER TABLE experiment_builder_answers ENABLE ROW LEVEL SECURITY;
-- ⚠️ A narrower GRANT revokes nothing on Supabase (new tables arrive with service_role ALL), so the
-- REVOKE is explicit and the append-only property is asserted below by ATTEMPTING the writes.
REVOKE ALL ON TABLE experiment_builder_answers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE experiment_builder_answers TO service_role;

CREATE OR REPLACE FUNCTION save_experiment_draft(
  p_project_id UUID,
  p_experiment_key TEXT,
  p_definition JSONB,
  p_flag_key TEXT,
  p_flag_definition JSONB,
  p_answers JSONB,
  p_actor_user_id UUID
)
RETURNS TABLE (
  experiment_id UUID,
  version_id UUID,
  version INTEGER,
  flag_id UUID,
  flag_version_id UUID,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_latest RECORD;
  v_bound RECORD;
  v_stored_answers JSONB;
  v_experiment RECORD;
  v_flag RECORD;
  v_flag_definition JSONB;
BEGIN
  -- Ownership FIRST, before any input is judged, so this cannot become a registry-discovery oracle.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_user_id
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'experiment management requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_experiment_key IS NULL OR p_experiment_key !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR p_flag_key IS NULL OR p_flag_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
     OR p_answers IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object'
     OR octet_length(p_answers::TEXT) > 16384
     OR jsonb_typeof(p_flag_definition) IS DISTINCT FROM 'object'
     -- D2: the flag version must name THIS experiment and its rules, or the exposures it produces
     -- would be attributed to another key (or to none).
     OR p_flag_definition #>> '{metadata,experiment_key}' IS DISTINCT FROM p_experiment_key
     OR coalesce(p_flag_definition #>> '{metadata,experiment_rules}', '') !~ '^[0-9]{1,7}(,[0-9]{1,7})*$'
  THEN
    RAISE EXCEPTION 'invalid experiment draft' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_experiment_key, 0));

  -- ── Idempotency: the latest version is a draft with the SAME definition, bound to a flag version
  -- with the SAME definition (its experiment_version aside), with the SAME answers → return it. ──
  SELECT candidate.id, candidate.experiment_id, candidate.version, candidate.status, candidate.definition
  INTO v_latest
  FROM public.experiment_definition_versions candidate
  JOIN public.experiment_registries registry
    ON registry.project_id = candidate.project_id AND registry.id = candidate.experiment_id
  WHERE registry.project_id = p_project_id AND registry.key = p_experiment_key
  ORDER BY candidate.version DESC
  LIMIT 1;

  IF FOUND AND v_latest.status = 'draft' AND v_latest.definition = p_definition THEN
    SELECT binding.flag_id, binding.flag_version_id, flag_version.definition, flag_registry.key
    INTO v_bound
    FROM public.experiment_flag_version_bindings binding
    JOIN public.flag_definition_versions flag_version
      ON flag_version.project_id = binding.project_id
     AND flag_version.flag_id = binding.flag_id
     AND flag_version.id = binding.flag_version_id
    JOIN public.flag_registries flag_registry
      ON flag_registry.project_id = binding.project_id AND flag_registry.id = binding.flag_id
    WHERE binding.project_id = p_project_id AND binding.experiment_version_id = v_latest.id;

    SELECT stored.answers INTO v_stored_answers
    FROM public.experiment_builder_answers stored
    WHERE stored.project_id = p_project_id AND stored.version_id = v_latest.id;

    IF v_bound.flag_id IS NOT NULL
       AND v_bound.key = p_flag_key
       AND v_bound.definition = jsonb_set(p_flag_definition, '{metadata,experiment_version}', to_jsonb(v_latest.version))
       AND v_stored_answers = p_answers THEN
      RETURN QUERY SELECT v_latest.experiment_id, v_latest.id, v_latest.version, v_bound.flag_id, v_bound.flag_version_id, false;
      RETURN;
    END IF;
  END IF;

  -- ── Create: experiment version → flag version (naming that version) → binding → answers. ──
  SELECT created_version.experiment_id, created_version.version_id, created_version.version
  INTO v_experiment
  FROM public.create_experiment_version(p_project_id, p_experiment_key, p_definition, p_actor_user_id) AS created_version;

  v_flag_definition := jsonb_set(p_flag_definition, '{metadata,experiment_version}', to_jsonb(v_experiment.version));

  SELECT created_flag.flag_id, created_flag.version_id
  INTO v_flag
  FROM public.create_flag_definition_version(
    p_project_id,
    p_flag_key,
    v_flag_definition,
    'Experiment ' || p_experiment_key || ' v' || v_experiment.version || ' (draft, not activated)',
    p_actor_user_id
  ) AS created_flag;

  -- Raises on variant-set mismatch or a second flag version; either rolls the whole save back.
  PERFORM 1 FROM public.bind_experiment_flag_version(
    p_project_id, v_experiment.experiment_id, v_experiment.version_id, v_flag.flag_id, v_flag.version_id, p_actor_user_id
  );

  INSERT INTO public.experiment_builder_answers(project_id, experiment_id, version_id, answers, created_by)
  VALUES (p_project_id, v_experiment.experiment_id, v_experiment.version_id, p_answers, p_actor_user_id);

  RETURN QUERY SELECT v_experiment.experiment_id, v_experiment.version_id, v_experiment.version, v_flag.flag_id, v_flag.version_id, true;
END;
$$;

REVOKE ALL ON FUNCTION save_experiment_draft(UUID, TEXT, JSONB, TEXT, JSONB, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_experiment_draft(UUID, TEXT, JSONB, TEXT, JSONB, JSONB, UUID) TO service_role;

-- Migration-time property proof: the answers table is append-only to the application's role.
DO $$
BEGIN
  IF has_table_privilege('service_role', 'public.experiment_builder_answers', 'INSERT')
     OR has_table_privilege('service_role', 'public.experiment_builder_answers', 'UPDATE')
     OR has_table_privilege('service_role', 'public.experiment_builder_answers', 'DELETE')
     OR has_table_privilege('service_role', 'public.experiment_builder_answers', 'TRUNCATE')
     OR has_function_privilege('anon', 'public.save_experiment_draft(uuid,text,jsonb,text,jsonb,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.save_experiment_draft(uuid,text,jsonb,text,jsonb,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'experiment_builder_answers / save_experiment_draft grants are wider than designed';
  END IF;
END;
$$;
