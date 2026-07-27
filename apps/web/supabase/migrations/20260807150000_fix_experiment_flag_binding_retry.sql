-- Correct the first binding function's composite-row retry comparison. Compare against the
-- stored row in SQL so output-column names and a PL/pgSQL record can never alter idempotency.

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

  IF EXISTS (
    SELECT 1 FROM public.experiment_flag_version_bindings binding
    WHERE binding.project_id = p_project_id
      AND binding.experiment_version_id = p_experiment_version_id
      AND binding.flag_id = p_flag_id
      AND binding.flag_version_id = p_flag_version_id
  ) THEN
    RETURN QUERY
    SELECT
      binding.id, binding.project_id, binding.experiment_id,
      binding.experiment_version_id, binding.flag_id, binding.flag_version_id, false
    FROM public.experiment_flag_version_bindings binding
    WHERE binding.project_id = p_project_id
      AND binding.experiment_version_id = p_experiment_version_id
      AND binding.flag_id = p_flag_id
      AND binding.flag_version_id = p_flag_version_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.experiment_flag_version_bindings binding
    WHERE binding.project_id = p_project_id
      AND binding.experiment_version_id = p_experiment_version_id
  ) THEN
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
