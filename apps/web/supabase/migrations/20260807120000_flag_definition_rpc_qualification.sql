-- flag-serving-and-prd-g · Sprint 1 hotfix — SQL RPC output-column names become PL/pgSQL variables.
-- Qualify every table reference in the owner check/registry lookup so Postgres never interprets
-- `project_id` as the RETURNS TABLE output variable when the function is invoked through PostgREST.

CREATE OR REPLACE FUNCTION create_flag_definition_version(p_project_id UUID, p_flag_key TEXT, p_definition JSONB, p_reason TEXT, p_actor_user_id UUID)
RETURNS TABLE (project_id UUID, flag_id UUID, version_id UUID, version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_flag_id UUID; v_version_id UUID; v_version INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner'
  ) THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_flag_key IS NULL OR p_flag_key !~ '^[a-z][a-z0-9_.-]{0,127}$' OR NOT private.flag_definition_is_valid(p_definition) OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag definition command' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_flag_key, 0));
  SELECT registry.id INTO v_flag_id FROM public.flag_registries registry WHERE registry.project_id = p_project_id AND registry.key = p_flag_key FOR UPDATE;
  IF v_flag_id IS NULL THEN INSERT INTO public.flag_registries(project_id,key,created_by) VALUES (p_project_id,p_flag_key,p_actor_user_id) RETURNING id INTO v_flag_id; END IF;
  SELECT COALESCE(max(candidate.version),0)+1 INTO v_version FROM public.flag_definition_versions candidate WHERE candidate.project_id = p_project_id AND candidate.flag_id = v_flag_id;
  INSERT INTO public.flag_definition_versions(project_id,flag_id,version,definition,created_by) VALUES (p_project_id,v_flag_id,v_version,p_definition,p_actor_user_id) RETURNING id INTO v_version_id;
  INSERT INTO public.flag_lifecycle_audit(project_id,flag_id,new_version_id,action,actor_user_id,reason) VALUES (p_project_id,v_flag_id,v_version_id,'definition_created',p_actor_user_id,p_reason);
  RETURN QUERY SELECT p_project_id,v_flag_id,v_version_id,v_version;
END;
$$;
REVOKE ALL ON FUNCTION create_flag_definition_version(UUID,TEXT,JSONB,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_flag_definition_version(UUID,TEXT,JSONB,TEXT,UUID) TO service_role;
