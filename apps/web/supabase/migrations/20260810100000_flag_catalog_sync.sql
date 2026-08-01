-- flag-serving-and-prd-g · Sprint 4, Story 4.2 — project catalog synchronization.
--
-- A catalog publisher gets its own revocable, owner-provenanced credential.  It can create
-- definition drafts through the canonical import RPC, but it never receives a project id,
-- environment, activation revision, or lifecycle operation to choose.  That makes the sync rail
-- additive rather than a second flag writer.

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS flag_sync_source TEXT;

-- Keep the scope taxonomy closed.  Every new scope has to restate the complete list because a
-- partial CHECK rewrite is how a previously-invalid credential shape quietly becomes valid.
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_scope_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_scope_check
  CHECK (scope IN ('ingest','share','agent_write','flag_read','flag_admin','flag_sync'));

-- `IS TRUE` is deliberate: PostgreSQL accepts a CHECK that evaluates to NULL.  The independent
-- source check below means a future edit to this composite cannot make a source-less sync key.
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (
  (
    (scope = 'share' AND share_lens IN ('team','client','investor') AND flag_environment IS NULL AND flag_actor_user_id IS NULL)
    OR (scope IN ('ingest','agent_write') AND share_lens IS NULL AND flag_environment IS NULL AND flag_actor_user_id IS NULL)
    OR (scope = 'flag_read' AND share_lens IS NULL AND flag_environment IN ('development','preview','production') AND flag_actor_user_id IS NULL)
    OR (scope = 'flag_admin' AND share_lens IS NULL AND flag_environment IN ('development','preview','production') AND flag_actor_user_id IS NOT NULL)
    OR (scope = 'flag_sync' AND share_lens IS NULL AND flag_environment IS NULL AND flag_actor_user_id IS NOT NULL)
  ) IS TRUE
);

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_flag_sync_source_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_flag_sync_source_check CHECK (
  (
    (scope = 'flag_sync' AND flag_sync_source ~ '^[a-z][a-z0-9_-]{0,63}$')
    OR (scope <> 'flag_sync' AND flag_sync_source IS NULL)
  ) IS TRUE
);

COMMENT ON COLUMN public.api_keys.scope IS
  'Credential kind: ingest, share, agent_write, flag_read, flag_admin or flag_sync. Each kind '
  'is resolved through its own active_* view with scope, revocation and expiry welded into SQL.';

CREATE INDEX IF NOT EXISTS api_keys_flag_sync_idx
  ON public.api_keys(project_id, flag_actor_user_id)
  WHERE scope = 'flag_sync' AND revoked_at IS NULL;

-- Scope, revocation, expiry and ownership live in the view rather than in route code.  A key from
-- any other api_keys scope therefore cannot become a catalog writer when a caller is refactored.
CREATE OR REPLACE VIEW public.active_flag_sync_keys AS
  SELECT key.id, key.project_id, key.key_hash, key.flag_actor_user_id, key.flag_sync_source
  FROM public.api_keys key
  JOIN public.projects project ON project.id = key.project_id
  JOIN public.project_members member
    ON member.project_id = key.project_id
   AND member.user_id = key.flag_actor_user_id
   AND member.role = 'owner'
  WHERE key.scope = 'flag_sync'
    AND key.flag_sync_source ~ '^[a-z][a-z0-9_-]{0,63}$'
    AND key.revoked_at IS NULL
    AND (key.expires_at IS NULL OR key.expires_at > now());

REVOKE ALL ON TABLE public.active_flag_sync_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.active_flag_sync_keys TO service_role;
-- A view with joins is not auto-updatable today, but the grant must state the intended property in
-- case a later simplification removes those joins.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.active_flag_sync_keys FROM service_role;

CREATE OR REPLACE FUNCTION public.create_flag_sync_key(
  p_project_id UUID,
  p_key_hash TEXT,
  p_label TEXT,
  p_source TEXT,
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
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'flag sync credential requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}$'
     OR p_label IS NULL OR char_length(p_label) > 120
     OR p_source IS NULL OR p_source !~ '^[a-z][a-z0-9_-]{0,63}$'
     OR (p_expires_at IS NOT NULL AND p_expires_at <= statement_timestamp()) THEN
    RAISE EXCEPTION 'invalid flag sync credential' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.api_keys(project_id,key_hash,label,scope,flag_actor_user_id,flag_sync_source,expires_at)
  VALUES (
    p_project_id,
    p_key_hash,
    COALESCE(NULLIF(btrim(p_label),''),'untitled flag sync key'),
    'flag_sync',
    p_actor_user_id,
    p_source,
    p_expires_at
  )
  RETURNING api_keys.id INTO v_id;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (
    p_project_id,
    p_actor_user_id,
    'flag_sync_key_minted',
    jsonb_build_object('keyId',v_id,'source',p_source)
  );
  RETURN QUERY SELECT v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_flag_sync_key(
  p_project_id UUID,
  p_key_id UUID,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_source TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'flag sync credential requires project ownership' USING ERRCODE = '42501';
  END IF;
  UPDATE public.api_keys
  SET revoked_at = statement_timestamp()
  WHERE id = p_key_id AND project_id = p_project_id AND scope = 'flag_sync' AND revoked_at IS NULL
  RETURNING flag_sync_source INTO v_source;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (
    p_project_id,
    p_actor_user_id,
    'flag_sync_key_revoked',
    jsonb_build_object('keyId',p_key_id,'source',v_source)
  );
  RETURN true;
END;
$$;

-- Resolve the credential in SQL, then delegate to the one existing immutable registry operation.
-- In particular, this wrapper cannot activate/deactivate a definition or touch an environment
-- snapshot: import_flag_definition_catalog creates only draft definitions and lifecycle audit rows.
CREATE OR REPLACE FUNCTION public.sync_flag_definition_catalog(
  p_key_hash TEXT,
  p_entries JSONB
)
RETURNS TABLE (flag_key TEXT, flag_id UUID, version_id UUID, version INTEGER, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_key public.active_flag_sync_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key
  FROM public.active_flag_sync_keys key
  WHERE key.key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    RETURN QUERY
    SELECT imported.flag_key, imported.flag_id, imported.version_id, imported.version, imported.created
    FROM public.import_flag_definition_catalog(
      v_key.project_id,
      p_entries,
      format('catalog sync from %s', v_key.flag_sync_source),
      v_key.flag_actor_user_id
    ) imported;
  EXCEPTION WHEN SQLSTATE '22023' THEN
    -- Drift is a conflict, not malformed input.  The HTTP surface maps the SQLSTATE only; it never
    -- reflects an untrusted definition or another tenant's data in its response.
    IF SQLERRM LIKE 'flag catalog semantic drift for %' THEN
      RAISE EXCEPTION 'flag catalog semantic drift' USING ERRCODE = 'P0001';
    END IF;
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_flag_sync_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), public.revoke_flag_sync_key(UUID,UUID,UUID), public.sync_flag_definition_catalog(TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flag_sync_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), public.revoke_flag_sync_key(UUID,UUID,UUID), public.sync_flag_definition_catalog(TEXT,JSONB) TO service_role;
