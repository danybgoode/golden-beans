-- Sprint 2 Story 2.1: transactional catalog import. Definitions only: this deliberately
-- does not create environment state or activation rows, so import cannot serve a flag.
CREATE OR REPLACE FUNCTION import_flag_definition_catalog(
  p_project_id UUID,
  p_entries JSONB,
  p_reason TEXT,
  p_actor_user_id UUID
)
RETURNS TABLE (flag_key TEXT, flag_id UUID, version_id UUID, version INTEGER, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_entry JSONB;
  v_key TEXT;
  v_definition JSONB;
  v_flag_id UUID;
  v_version_id UUID;
  v_version INTEGER;
  v_existing_definition JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 100
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'invalid flag catalog import command' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_entries) value
    WHERE jsonb_typeof(value) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(value) key WHERE key NOT IN ('key', 'definition'))
       OR NOT (value ?& ARRAY['key', 'definition'])
       OR jsonb_typeof(value->'key') <> 'string'
       OR value->>'key' !~ '^[a-z][a-z0-9_.-]{0,127}$'
       OR NOT private.flag_definition_is_valid(value->'definition')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_entries) value
    GROUP BY value->>'key' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'invalid flag catalog import entries' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':flag-catalog-import', 0));
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    v_key := v_entry->>'key';
    v_definition := v_entry->'definition';
    SELECT registry.id INTO v_flag_id
    FROM public.flag_registries registry
    WHERE registry.project_id = p_project_id AND registry.key = v_key
    FOR UPDATE;

    IF v_flag_id IS NULL THEN
      INSERT INTO public.flag_registries(project_id, key, created_by)
      VALUES (p_project_id, v_key, p_actor_user_id)
      RETURNING id INTO v_flag_id;
      v_version := 1;
      INSERT INTO public.flag_definition_versions(project_id, flag_id, version, definition, created_by)
      VALUES (p_project_id, v_flag_id, v_version, v_definition, p_actor_user_id)
      RETURNING id INTO v_version_id;
      INSERT INTO public.flag_lifecycle_audit(project_id, flag_id, new_version_id, action, actor_user_id, reason)
      VALUES (p_project_id, v_flag_id, v_version_id, 'definition_created', p_actor_user_id, p_reason);
      flag_key := v_key; flag_id := v_flag_id; version_id := v_version_id; version := v_version; created := true;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT candidate.id, candidate.version, candidate.definition
    INTO v_version_id, v_version, v_existing_definition
    FROM public.flag_definition_versions candidate
    WHERE candidate.project_id = p_project_id AND candidate.flag_id = v_flag_id
    ORDER BY candidate.version DESC
    LIMIT 1;
    IF v_existing_definition IS DISTINCT FROM v_definition THEN
      RAISE EXCEPTION 'flag catalog semantic drift for %', v_key USING ERRCODE = '22023';
    END IF;
    flag_key := v_key; flag_id := v_flag_id; version_id := v_version_id; version := v_version; created := false;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION import_flag_definition_catalog(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION import_flag_definition_catalog(UUID, JSONB, TEXT, UUID) TO service_role;
