-- flag-serving-and-prd-g · Sprint 2, Story 2.3 — Miyagi's familiar admin surface
-- talks to Golden through a separate, revocable control-plane credential. The credential pins
-- project + environment in the database, so neither the browser nor the Miyagi server chooses a
-- tenant on an individual request. `external_actor_id` preserves the verified Clerk admin who
-- initiated the action; `actor_user_id` remains the Golden project owner that minted the service
-- credential, preserving the existing ownership and audit invariants.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS flag_actor_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_scope_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_scope_check
  CHECK (scope IN ('ingest','share','agent_write','flag_read','flag_admin'));

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (
  (
    (scope = 'share' AND share_lens IN ('team','client','investor') AND flag_environment IS NULL AND flag_actor_user_id IS NULL)
    OR (scope IN ('ingest','agent_write') AND share_lens IS NULL AND flag_environment IS NULL AND flag_actor_user_id IS NULL)
    OR (scope = 'flag_read' AND share_lens IS NULL AND flag_environment IN ('development','preview','production') AND flag_actor_user_id IS NULL)
    OR (scope = 'flag_admin' AND share_lens IS NULL AND flag_environment IN ('development','preview','production') AND flag_actor_user_id IS NOT NULL)
  ) IS TRUE
);

CREATE INDEX IF NOT EXISTS api_keys_flag_admin_idx
  ON api_keys(project_id, flag_environment, flag_actor_user_id)
  WHERE scope = 'flag_admin' AND revoked_at IS NULL;

CREATE OR REPLACE VIEW active_flag_admin_keys AS
  SELECT key.id, key.project_id, key.key_hash, key.flag_environment, key.flag_actor_user_id
  FROM api_keys key
  JOIN project_members member
    ON member.project_id = key.project_id
   AND member.user_id = key.flag_actor_user_id
   AND member.role = 'owner'
  WHERE key.scope = 'flag_admin'
    AND key.flag_environment IN ('development','preview','production')
    AND key.revoked_at IS NULL
    AND (key.expires_at IS NULL OR key.expires_at > now());
REVOKE ALL ON TABLE active_flag_admin_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_flag_admin_keys TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_flag_admin_keys FROM service_role;

ALTER TABLE flag_lifecycle_audit ADD COLUMN IF NOT EXISTS external_actor_id TEXT;
ALTER TABLE flag_lifecycle_audit DROP CONSTRAINT IF EXISTS flag_lifecycle_audit_external_actor_id_check;
ALTER TABLE flag_lifecycle_audit ADD CONSTRAINT flag_lifecycle_audit_external_actor_id_check
  CHECK (external_actor_id IS NULL OR external_actor_id ~ '^user_[A-Za-z0-9]{1,128}$');

CREATE OR REPLACE FUNCTION create_flag_admin_key(
  p_project_id UUID,
  p_environment TEXT,
  p_key_hash TEXT,
  p_label TEXT,
  p_expires_at TIMESTAMPTZ,
  p_actor_user_id UUID
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'flag admin credential requires project ownership' USING ERRCODE = '42501';
  END IF;
  IF p_environment NOT IN ('development','preview','production')
     OR p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}$'
     OR p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid flag admin credential' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.api_keys(project_id,key_hash,label,scope,flag_environment,flag_actor_user_id,expires_at)
  VALUES (p_project_id,p_key_hash,COALESCE(NULLIF(btrim(p_label),''),'Miyagi flag admin'),'flag_admin',p_environment,p_actor_user_id,p_expires_at)
  RETURNING api_keys.id INTO v_id;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (p_project_id,p_actor_user_id,'flag_admin_key_minted',jsonb_build_object('keyId',v_id,'environment',p_environment));
  RETURN QUERY SELECT v_id;
END;
$$;

-- The read and write sides must share this predicate. A generic/static boolean may be valid for
-- Golden's broader control plane, but `/admin/flags` is Miyagi's familiar boolean toggle — showing
-- one it cannot safely mutate would recreate a misleading second operational surface.
CREATE OR REPLACE FUNCTION private.is_static_miyagi_boolean_definition(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_definition IS NULL
     -- Every required field must reject NULL as well as the wrong value. SQL's ordinary
     -- comparisons yield NULL for an absent JSON property, which would otherwise let a
     -- non-Miyagi definition slip past this fail-closed ownership predicate.
     OR p_definition->>'valueType' IS DISTINCT FROM 'boolean'
     OR (p_definition->>'defaultVariantKey' IS DISTINCT FROM 'on'
         AND p_definition->>'defaultVariantKey' IS DISTINCT FROM 'off')
     OR p_definition->'rules' IS DISTINCT FROM '[]'::jsonb
     OR p_definition #>> '{metadata,source}' IS DISTINCT FROM 'miyagi' THEN
    RETURN false;
  END IF;
  -- `jsonb_array_elements` throws for a missing, null, or non-array property. Guard the
  -- expansion separately so one malformed active definition is excluded, never an outage for
  -- every flag in this credential-scoped snapshot.
  IF jsonb_typeof(p_definition->'variants') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_definition->'variants') value
    -- Imported definitions may carry presentation metadata on a variant. Its immutable
    -- operational meaning remains the exact key plus JSON boolean value; compare those
    -- properties rather than the whole JSON object, while rejecting strings/numbers/null.
    WHERE value->>'key' = 'on' AND value->'value' = 'true'::jsonb
  ) AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_definition->'variants') value
    WHERE value->>'key' = 'off' AND value->'value' = 'false'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION private.is_static_miyagi_boolean_definition(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_flag_admin_snapshot(p_key_hash TEXT)
RETURNS TABLE (
  environment TEXT,
  snapshot_version BIGINT,
  snapshot_updated_at TIMESTAMPTZ,
  flags JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT key.flag_environment,
         COALESCE(state.snapshot_version, 0),
         state.updated_at,
         COALESCE(snapshot.flags, '[]'::jsonb)
  FROM public.active_flag_admin_keys key
  LEFT JOIN public.flag_environment_states state
    ON state.project_id = key.project_id AND state.environment = key.flag_environment
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'key', registry.key,
        -- WITH ORDINALITY is 1-based while JSONB array subscripts are 0-based. Use the matched
        -- variant directly so a default of `off` and a default of `on` both report their real value.
        'value', variant.value->'value',
        'definitionVersion', version.version,
        -- Legacy definitions can carry arbitrary metadata. Keep the admin DTO's closed enums
        -- valid so one malformed value cannot turn a valid credential into a false 401.
        'criticality', CASE version.definition #>> '{metadata,criticality}'
          WHEN 'medium' THEN 'medium'
          WHEN 'high' THEN 'high'
          ELSE 'low'
        END,
        'polarity', CASE version.definition #>> '{metadata,polarity}'
          WHEN 'killswitch' THEN 'killswitch'
          ELSE 'enablement'
        END,
        -- The current registry validates description, but legacy immutable versions can omit it
        -- (or hold JSON null). This admin DTO promises a string so one old version cannot make
        -- the entire credential snapshot fail closed as malformed.
        'description', COALESCE(version.definition->>'description', ''),
        'reason', 'STATIC'
      ) ORDER BY registry.key
    ) AS flags
    FROM public.flag_environment_activations activation
    JOIN public.flag_registries registry
      ON registry.project_id = activation.project_id AND registry.id = activation.flag_id
    JOIN public.flag_definition_versions version
      ON version.project_id = activation.project_id AND version.flag_id = activation.flag_id AND version.id = activation.version_id
    JOIN LATERAL jsonb_array_elements(version.definition->'variants') WITH ORDINALITY variant(value, ordinality)
      ON variant.value->>'key' = version.definition->>'defaultVariantKey'
    WHERE activation.project_id = key.project_id
      AND activation.environment = key.flag_environment
      AND activation.version_id IS NOT NULL
      AND private.is_static_miyagi_boolean_definition(version.definition)
  ) snapshot ON true
  WHERE key.key_hash = p_key_hash;
$$;

CREATE OR REPLACE FUNCTION revoke_flag_admin_key(
  p_project_id UUID,
  p_key_id UUID,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_environment TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members member
    WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'flag admin credential requires project ownership' USING ERRCODE = '42501';
  END IF;
  UPDATE public.api_keys SET revoked_at = statement_timestamp()
  WHERE id = p_key_id AND project_id = p_project_id AND scope = 'flag_admin' AND revoked_at IS NULL
  RETURNING flag_environment INTO v_environment;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_log(project_id,actor_user_id,action,metadata)
  VALUES (p_project_id,p_actor_user_id,'flag_admin_key_revoked',jsonb_build_object('keyId',p_key_id,'environment',v_environment));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION set_flag_admin_boolean(
  p_key_hash TEXT,
  p_flag_key TEXT,
  p_enabled BOOLEAN,
  p_expected_snapshot_version BIGINT,
  p_reason TEXT,
  p_external_actor_id TEXT
)
RETURNS TABLE (snapshot_version BIGINT, definition_version INTEGER, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_key public.active_flag_admin_keys%ROWTYPE;
  v_state public.flag_environment_states%ROWTYPE;
  v_flag_id UUID;
  v_old_version_id UUID;
  v_old_definition JSONB;
  v_old_version INTEGER;
  v_new_definition JSONB;
  v_new_version_id UUID;
  v_new_version INTEGER;
  v_current_enabled BOOLEAN;
BEGIN
  SELECT * INTO v_key FROM public.active_flag_admin_keys WHERE key_hash = p_key_hash;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_flag_key IS NULL OR p_flag_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
     OR p_enabled IS NULL
     OR p_expected_snapshot_version IS NULL OR p_expected_snapshot_version < 0
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = ''
     OR p_external_actor_id IS NULL OR p_external_actor_id !~ '^user_[A-Za-z0-9]{1,128}$' THEN
    RAISE EXCEPTION 'invalid Miyagi flag administration command' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_key.project_id::TEXT || ':' || v_key.flag_environment, 0));
  SELECT * INTO v_state
  FROM public.flag_environment_states
  WHERE project_id = v_key.project_id AND environment = v_key.flag_environment
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'flag environment is not initialized' USING ERRCODE = '22023'; END IF;
  IF v_state.snapshot_version <> p_expected_snapshot_version THEN
    RAISE EXCEPTION 'flag snapshot version conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT registry.id, activation.version_id, version.definition, version.version
    INTO v_flag_id, v_old_version_id, v_old_definition, v_old_version
  FROM public.flag_registries registry
  JOIN public.flag_environment_activations activation
    ON activation.project_id = registry.project_id
   AND activation.flag_id = registry.id
   AND activation.environment = v_key.flag_environment
  JOIN public.flag_definition_versions version
    ON version.project_id = activation.project_id
   AND version.flag_id = activation.flag_id
   AND version.id = activation.version_id
  WHERE registry.project_id = v_key.project_id AND registry.key = p_flag_key
  FOR UPDATE OF registry, activation, version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Miyagi flag is not active in this environment' USING ERRCODE = '22023'; END IF;

  -- This scoped operation only flips imported static Miyagi booleans. Allowing it to mutate a
  -- targeted/general-purpose definition would turn the familiar toggle into an implicit rule editor.
  IF NOT private.is_static_miyagi_boolean_definition(v_old_definition) THEN
    RAISE EXCEPTION 'flag is not a static Miyagi boolean' USING ERRCODE = '22023';
  END IF;

  v_current_enabled := v_old_definition->>'defaultVariantKey' = 'on';
  IF v_current_enabled = p_enabled THEN
    RETURN QUERY SELECT v_state.snapshot_version, v_old_version, false;
    RETURN;
  END IF;

  v_new_definition := jsonb_set(v_old_definition, '{defaultVariantKey}', to_jsonb(CASE WHEN p_enabled THEN 'on' ELSE 'off' END));
  SELECT COALESCE(max(version), 0) + 1 INTO v_new_version
  FROM public.flag_definition_versions
  WHERE project_id = v_key.project_id AND flag_id = v_flag_id;
  INSERT INTO public.flag_definition_versions(project_id,flag_id,version,definition,created_by)
  VALUES (v_key.project_id,v_flag_id,v_new_version,v_new_definition,v_key.flag_actor_user_id)
  RETURNING id INTO v_new_version_id;
  UPDATE public.flag_environment_activations
  SET version_id = v_new_version_id, updated_by = v_key.flag_actor_user_id, updated_at = now()
  WHERE project_id = v_key.project_id AND environment = v_key.flag_environment AND flag_id = v_flag_id;
  UPDATE public.flag_environment_states
  SET snapshot_version = public.flag_environment_states.snapshot_version + 1, updated_at = now()
  WHERE project_id = v_key.project_id AND environment = v_key.flag_environment
  RETURNING * INTO v_state;
  INSERT INTO public.flag_lifecycle_audit(
    project_id,environment,flag_id,old_version_id,new_version_id,action,actor_user_id,external_actor_id,reason
  ) VALUES (
    v_key.project_id,v_key.flag_environment,v_flag_id,v_old_version_id,v_new_version_id,'activated',
    v_key.flag_actor_user_id,p_external_actor_id,p_reason
  );
  RETURN QUERY SELECT v_state.snapshot_version, v_new_version, true;
END;
$$;

REVOKE ALL ON FUNCTION create_flag_admin_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), revoke_flag_admin_key(UUID,UUID,UUID), get_flag_admin_snapshot(TEXT), set_flag_admin_boolean(TEXT,TEXT,BOOLEAN,BIGINT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_flag_admin_key(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID), revoke_flag_admin_key(UUID,UUID,UUID), get_flag_admin_snapshot(TEXT), set_flag_admin_boolean(TEXT,TEXT,BOOLEAN,BIGINT,TEXT,TEXT) TO service_role;
