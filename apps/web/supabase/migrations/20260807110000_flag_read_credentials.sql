-- flag-serving-and-prd-g · Sprint 1 — owner-scoped lifecycle for the `flag_read` credential.
--
-- api_keys is deliberately not writable by the application role any more: every credential scope
-- now has a narrow owner-checked mutation function, so an endpoint cannot relabel a revoke or
-- mint a flag credential for a foreign project by choosing different JSON fields.

CREATE OR REPLACE FUNCTION create_flag_read_key(
  p_project_id UUID,
  p_environment TEXT,
  p_key_hash TEXT,
  p_label TEXT,
  p_expires_at TIMESTAMPTZ,
  p_actor_user_id UUID
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id=p_project_id AND user_id=p_actor_user_id AND role='owner'
  ) THEN RAISE EXCEPTION 'flag credential management requires project ownership' USING ERRCODE='42501'; END IF;
  IF p_environment NOT IN ('development','preview','production')
     OR p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_label IS NULL OR char_length(p_label) > 120
     OR (p_expires_at IS NOT NULL AND p_expires_at <= statement_timestamp()) THEN
    RAISE EXCEPTION 'invalid flag read credential command' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.api_keys(project_id,key_hash,label,scope,flag_environment,expires_at)
  VALUES (p_project_id,p_key_hash,COALESCE(NULLIF(btrim(p_label),''),'untitled flag read key'),'flag_read',p_environment,p_expires_at)
  RETURNING api_keys.id INTO v_id;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (p_project_id,p_actor_user_id,'flag_read_key_minted',jsonb_build_object('keyId',v_id,'environment',p_environment));
  RETURN QUERY SELECT v_id;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_flag_read_key(
  p_project_id UUID,
  p_key_id UUID,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_environment TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id=p_project_id AND user_id=p_actor_user_id AND role='owner'
  ) THEN RAISE EXCEPTION 'flag credential management requires project ownership' USING ERRCODE='42501'; END IF;
  UPDATE public.api_keys SET revoked_at=statement_timestamp()
  WHERE id=p_key_id AND project_id=p_project_id AND scope='flag_read' AND revoked_at IS NULL
  RETURNING flag_environment INTO v_environment;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (p_project_id,p_actor_user_id,'flag_read_key_revoked',jsonb_build_object('keyId',p_key_id,'environment',v_environment));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION create_flag_read_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), revoke_flag_read_key(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_flag_read_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), revoke_flag_read_key(UUID,UUID,UUID) TO service_role;
