-- flag-serving-and-prd-g · Sprint 1 — typed, versioned, tenant-scoped flag control plane.
--
-- This is intentionally additive. No request path reads these rows until the application has the
-- FLAG_SERVING_ENABLED gate and the flag_read credential boundary; applying this before code is
-- therefore safe, and is required before a deployment can begin serving snapshots.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- The same bounded JSON domain as the public SDK. Definitions are checked at the database boundary
-- too: a server-side parser is helpful, but a direct RPC/service-role caller must not create a row
-- the local evaluator would refuse.
CREATE OR REPLACE FUNCTION private.flag_json_value_is_valid(p_value JSONB, p_depth INTEGER DEFAULT 0)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_entry RECORD;
BEGIN
  IF p_depth > 8 THEN RETURN false; END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'null', 'boolean' THEN RETURN true;
    WHEN 'string' THEN RETURN char_length(p_value #>> '{}') <= 4096;
    WHEN 'number' THEN RETURN abs((p_value #>> '{}')::NUMERIC) <= 1000000000000000;
    WHEN 'array' THEN
      IF jsonb_array_length(p_value) > 100 THEN RETURN false; END IF;
      FOR v_entry IN SELECT value FROM jsonb_array_elements(p_value) LOOP
        IF NOT private.flag_json_value_is_valid(v_entry.value, p_depth + 1) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'object' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(p_value)) > 100 THEN RETURN false; END IF;
      FOR v_entry IN SELECT key, value FROM jsonb_each(p_value) LOOP
        IF char_length(v_entry.key) > 128
           OR NOT private.flag_json_value_is_valid(v_entry.value, p_depth + 1) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    ELSE RETURN false;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.flag_json_value_is_valid(JSONB, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.flag_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_type TEXT;
  v_variant JSONB;
  v_rule JSONB;
  v_clause JSONB;
  v_metadata RECORD;
  v_count INTEGER;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
     OR octet_length(p_definition::TEXT) > 32768 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) key
             WHERE key NOT IN ('valueType','description','defaultVariantKey','variants','rules','metadata'))
     OR NOT (p_definition ?& ARRAY['valueType','description','defaultVariantKey','variants','rules']) THEN RETURN false; END IF;
  v_type := p_definition->>'valueType';
  IF v_type NOT IN ('boolean','string','number','json')
     OR jsonb_typeof(p_definition->'description') IS DISTINCT FROM 'string'
     OR char_length(p_definition->>'description') NOT BETWEEN 1 AND 500
     OR btrim(p_definition->>'description') = ''
     OR jsonb_typeof(p_definition->'defaultVariantKey') IS DISTINCT FROM 'string'
     OR (p_definition->>'defaultVariantKey') !~ '^[a-z][a-z0-9_-]{0,63}$' THEN RETURN false; END IF;
  IF jsonb_typeof(p_definition->'variants') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'variants') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_definition->'variants') LOOP
    IF jsonb_typeof(v_variant) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_variant) key WHERE key NOT IN ('key','value'))
       OR NOT (v_variant ?& ARRAY['key','value'])
       OR jsonb_typeof(v_variant->'key') IS DISTINCT FROM 'string'
       OR (v_variant->>'key') !~ '^[a-z][a-z0-9_-]{0,63}$' THEN RETURN false; END IF;
    IF (v_type = 'boolean' AND jsonb_typeof(v_variant->'value') <> 'boolean')
       OR (v_type = 'string' AND (jsonb_typeof(v_variant->'value') <> 'string' OR char_length(v_variant->>'value') > 4096))
       OR (v_type = 'number' AND (jsonb_typeof(v_variant->'value') <> 'number' OR abs((v_variant->>'value')::NUMERIC) > 1000000000000000))
       OR (v_type = 'json' AND (jsonb_typeof(v_variant->'value') NOT IN ('object','array') OR octet_length((v_variant->'value')::TEXT) > 16384 OR NOT private.flag_json_value_is_valid(v_variant->'value'))) THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM (SELECT value->>'key' key FROM jsonb_array_elements(p_definition->'variants') GROUP BY value->>'key' HAVING count(*) > 1) duplicate)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_definition->'variants') value WHERE value->>'key' = p_definition->>'defaultVariantKey') THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'rules') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'rules') > 20 THEN RETURN false; END IF;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(p_definition->'rules') LOOP
    IF jsonb_typeof(v_rule) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_rule) key WHERE key NOT IN ('priority','clauses','rollout','variantKey'))
       OR NOT (v_rule ?& ARRAY['priority','clauses','variantKey'])
       OR jsonb_typeof(v_rule->'priority') <> 'number'
       OR (v_rule->>'priority') !~ '^[0-9]+$'
       OR (v_rule->>'priority')::NUMERIC > 1000000
       OR jsonb_typeof(v_rule->'clauses') <> 'array'
       OR jsonb_array_length(v_rule->'clauses') > 5
       OR jsonb_typeof(v_rule->'variantKey') <> 'string'
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_definition->'variants') value WHERE value->>'key' = v_rule->>'variantKey') THEN RETURN false; END IF;
    FOR v_clause IN SELECT value FROM jsonb_array_elements(v_rule->'clauses') LOOP
      IF jsonb_typeof(v_clause) IS DISTINCT FROM 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_clause) key WHERE key NOT IN ('field','operator','value','values'))
         OR jsonb_typeof(v_clause->'field') <> 'string'
         OR v_clause->>'field' NOT IN ('targetingKey','source','channel','campaign','plan','region')
         OR jsonb_typeof(v_clause->'operator') <> 'string'
         OR v_clause->>'operator' NOT IN ('equals','one_of') THEN RETURN false; END IF;
      IF v_clause->>'operator' = 'equals' THEN
        IF NOT (v_clause ? 'value') OR v_clause ? 'values' OR jsonb_typeof(v_clause->'value') NOT IN ('string','number','boolean')
           OR (jsonb_typeof(v_clause->'value') = 'string' AND char_length(v_clause->>'value') > 256)
           OR (jsonb_typeof(v_clause->'value') = 'number' AND ((v_clause->>'value') !~ '^-?[0-9]+$' OR abs((v_clause->>'value')::NUMERIC) > 1000000000000000)) THEN RETURN false; END IF;
      ELSE
        IF v_clause ? 'value' OR jsonb_typeof(v_clause->'values') <> 'array'
           OR jsonb_array_length(v_clause->'values') NOT BETWEEN 1 AND 20
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_clause->'values') value WHERE jsonb_typeof(value) NOT IN ('string','number','boolean') OR (jsonb_typeof(value) = 'string' AND char_length(value #>> '{}') > 256) OR (jsonb_typeof(value) = 'number' AND ((value #>> '{}') !~ '^-?[0-9]+$' OR abs((value #>> '{}')::NUMERIC) > 1000000000000000)))
           OR EXISTS (SELECT 1 FROM (SELECT value FROM jsonb_array_elements(v_clause->'values') GROUP BY value HAVING count(*) > 1) duplicate) THEN RETURN false; END IF;
      END IF;
    END LOOP;
    IF v_rule ? 'rollout' AND (jsonb_typeof(v_rule->'rollout') <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_rule->'rollout') key WHERE key <> 'basisPoints')
       OR NOT (v_rule->'rollout' ? 'basisPoints')
       OR jsonb_typeof(v_rule#>'{rollout,basisPoints}') <> 'number'
       OR (v_rule#>>'{rollout,basisPoints}') !~ '^[0-9]+$'
       OR (v_rule#>>'{rollout,basisPoints}')::NUMERIC > 10000) THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM (SELECT (value->>'priority')::NUMERIC priority FROM jsonb_array_elements(p_definition->'rules') GROUP BY (value->>'priority')::NUMERIC HAVING count(*) > 1) duplicate) THEN RETURN false; END IF;

  IF p_definition ? 'metadata' THEN
    IF jsonb_typeof(p_definition->'metadata') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_definition->'metadata')) > 16 THEN RETURN false; END IF;
    FOR v_metadata IN SELECT key, value FROM jsonb_each(p_definition->'metadata') LOOP
      IF v_metadata.key !~ '^[a-z][a-z0-9_-]{0,63}$' OR jsonb_typeof(v_metadata.value) NOT IN ('string','number','boolean')
         OR (jsonb_typeof(v_metadata.value) = 'string' AND char_length(v_metadata.value #>> '{}') > 256)
         OR (jsonb_typeof(v_metadata.value) = 'number' AND (v_metadata.value #>> '{}') !~ '^-?[0-9]+$') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.flag_definition_is_valid(JSONB) FROM PUBLIC, anon, authenticated;

CREATE TABLE flag_registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key),
  UNIQUE (project_id, id)
);

CREATE TABLE flag_definition_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  flag_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  definition JSONB NOT NULL CHECK (private.flag_definition_is_valid(definition)),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, flag_id) REFERENCES flag_registries(project_id, id) ON DELETE CASCADE,
  UNIQUE (flag_id, version),
  UNIQUE (project_id, flag_id, id)
);

CREATE TABLE flag_environment_states (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('development','preview','production')),
  snapshot_version BIGINT NOT NULL DEFAULT 0 CHECK (snapshot_version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, environment)
);

CREATE TABLE flag_environment_activations (
  project_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development','preview','production')),
  flag_id UUID NOT NULL,
  version_id UUID,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, environment, flag_id),
  FOREIGN KEY (project_id, environment) REFERENCES flag_environment_states(project_id, environment) ON DELETE CASCADE,
  FOREIGN KEY (project_id, flag_id) REFERENCES flag_registries(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, flag_id, version_id) REFERENCES flag_definition_versions(project_id, flag_id, id) ON DELETE RESTRICT
);

CREATE TABLE flag_lifecycle_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  environment TEXT CHECK (environment IS NULL OR environment IN ('development','preview','production')),
  flag_id UUID NOT NULL,
  old_version_id UUID,
  new_version_id UUID,
  action TEXT NOT NULL CHECK (action IN ('definition_created','activated','deactivated')),
  actor_user_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500 AND btrim(reason) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX flag_lifecycle_audit_project_created_idx ON flag_lifecycle_audit(project_id, created_at DESC);

ALTER TABLE flag_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_environment_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_environment_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_lifecycle_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE flag_registries, flag_definition_versions, flag_environment_states, flag_environment_activations, flag_lifecycle_audit TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE flag_registries, flag_definition_versions, flag_environment_states, flag_environment_activations, flag_lifecycle_audit FROM service_role, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_flag_version_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.flag_registries WHERE project_id = OLD.project_id AND id = OLD.flag_id) THEN
      RAISE EXCEPTION 'flag definition versions are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.flag_id IS DISTINCT FROM NEW.flag_id OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.definition IS DISTINCT FROM NEW.definition OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'flag definition versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER flag_definition_versions_immutable_trg BEFORE UPDATE OR DELETE ON flag_definition_versions
FOR EACH ROW EXECUTE FUNCTION private.enforce_flag_version_immutability();

-- Reuse the mature one-table credential lifecycle, but the scope and environment are welded into
-- their own view. An ingest/share/agent-write credential can never serve a snapshot.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS flag_environment TEXT;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_scope_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_scope_check CHECK (scope IN ('ingest','share','agent_write','flag_read'));
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (((scope = 'share' AND share_lens IN ('team','client','investor') AND flag_environment IS NULL) OR (scope IN ('ingest','agent_write') AND share_lens IS NULL AND flag_environment IS NULL) OR (scope = 'flag_read' AND share_lens IS NULL AND flag_environment IN ('development','preview','production'))) IS TRUE);
CREATE INDEX IF NOT EXISTS api_keys_flag_read_idx ON api_keys(project_id, flag_environment) WHERE scope = 'flag_read' AND revoked_at IS NULL;

CREATE OR REPLACE VIEW active_flag_read_keys AS
  SELECT k.id, k.project_id, k.key_hash, k.flag_environment
  FROM api_keys k JOIN projects p ON p.id = k.project_id
  WHERE k.scope = 'flag_read' AND k.flag_environment IN ('development','preview','production')
    AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now());
REVOKE ALL ON TABLE active_flag_read_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_flag_read_keys TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_flag_read_keys, active_ingest_keys, active_share_links, active_agent_write_keys FROM service_role;

CREATE OR REPLACE FUNCTION create_flag_definition_version(p_project_id UUID, p_flag_key TEXT, p_definition JSONB, p_reason TEXT, p_actor_user_id UUID)
RETURNS TABLE (project_id UUID, flag_id UUID, version_id UUID, version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_flag_id UUID; v_version_id UUID; v_version INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner') THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_flag_key IS NULL OR p_flag_key !~ '^[a-z][a-z0-9_.-]{0,127}$' OR NOT private.flag_definition_is_valid(p_definition) OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag definition command' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_flag_key, 0));
  SELECT id INTO v_flag_id FROM public.flag_registries WHERE project_id = p_project_id AND key = p_flag_key FOR UPDATE;
  IF v_flag_id IS NULL THEN INSERT INTO public.flag_registries(project_id,key,created_by) VALUES (p_project_id,p_flag_key,p_actor_user_id) RETURNING id INTO v_flag_id; END IF;
  SELECT COALESCE(max(candidate.version),0)+1 INTO v_version FROM public.flag_definition_versions candidate WHERE candidate.project_id = p_project_id AND candidate.flag_id = v_flag_id;
  INSERT INTO public.flag_definition_versions(project_id,flag_id,version,definition,created_by) VALUES (p_project_id,v_flag_id,v_version,p_definition,p_actor_user_id) RETURNING id INTO v_version_id;
  INSERT INTO public.flag_lifecycle_audit(project_id,flag_id,new_version_id,action,actor_user_id,reason) VALUES (p_project_id,v_flag_id,v_version_id,'definition_created',p_actor_user_id,p_reason);
  RETURN QUERY SELECT p_project_id,v_flag_id,v_version_id,v_version;
END;
$$;

CREATE OR REPLACE FUNCTION set_flag_activation(p_project_id UUID, p_environment TEXT, p_flag_id UUID, p_version_id UUID, p_expected_snapshot_version BIGINT, p_reason TEXT, p_actor_user_id UUID)
RETURNS TABLE (snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_state public.flag_environment_states%ROWTYPE; v_old_version_id UUID; v_changed BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner') THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_environment NOT IN ('development','preview','production') OR p_expected_snapshot_version IS NULL OR p_expected_snapshot_version < 0 OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag activation command' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flag_definition_versions WHERE project_id=p_project_id AND flag_id=p_flag_id AND id=p_version_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_environment, 0));
  INSERT INTO public.flag_environment_states(project_id,environment) VALUES (p_project_id,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.flag_environment_states WHERE project_id=p_project_id AND environment=p_environment FOR UPDATE;
  IF v_state.snapshot_version <> p_expected_snapshot_version THEN RAISE EXCEPTION 'flag snapshot version conflict' USING ERRCODE = '40001'; END IF;
  SELECT version_id INTO v_old_version_id FROM public.flag_environment_activations WHERE project_id=p_project_id AND environment=p_environment AND flag_id=p_flag_id FOR UPDATE;
  v_changed := v_old_version_id IS DISTINCT FROM p_version_id;
  IF v_changed THEN
    INSERT INTO public.flag_environment_activations(project_id,environment,flag_id,version_id,updated_by) VALUES (p_project_id,p_environment,p_flag_id,p_version_id,p_actor_user_id) ON CONFLICT (project_id,environment,flag_id) DO UPDATE SET version_id=EXCLUDED.version_id,updated_by=EXCLUDED.updated_by,updated_at=now();
    UPDATE public.flag_environment_states SET snapshot_version=snapshot_version+1,updated_at=now() WHERE project_id=p_project_id AND environment=p_environment RETURNING * INTO v_state;
    INSERT INTO public.flag_lifecycle_audit(project_id,environment,flag_id,old_version_id,new_version_id,action,actor_user_id,reason) VALUES (p_project_id,p_environment,p_flag_id,v_old_version_id,p_version_id,'activated',p_actor_user_id,p_reason);
  END IF;
  RETURN QUERY SELECT v_state.snapshot_version,v_changed;
END;
$$;

CREATE OR REPLACE FUNCTION deactivate_flag(p_project_id UUID, p_environment TEXT, p_flag_id UUID, p_expected_snapshot_version BIGINT, p_reason TEXT, p_actor_user_id UUID)
RETURNS TABLE (snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_state public.flag_environment_states%ROWTYPE; v_old_version_id UUID; v_changed BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_project_id AND user_id = p_actor_user_id AND role = 'owner') THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_environment NOT IN ('development','preview','production') OR p_expected_snapshot_version IS NULL OR p_expected_snapshot_version < 0 OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag deactivation command' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flag_registries WHERE project_id=p_project_id AND id=p_flag_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_environment, 0));
  INSERT INTO public.flag_environment_states(project_id,environment) VALUES (p_project_id,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.flag_environment_states WHERE project_id=p_project_id AND environment=p_environment FOR UPDATE;
  IF v_state.snapshot_version <> p_expected_snapshot_version THEN RAISE EXCEPTION 'flag snapshot version conflict' USING ERRCODE = '40001'; END IF;
  SELECT version_id INTO v_old_version_id FROM public.flag_environment_activations WHERE project_id=p_project_id AND environment=p_environment AND flag_id=p_flag_id FOR UPDATE;
  v_changed := v_old_version_id IS NOT NULL;
  IF v_changed THEN
    UPDATE public.flag_environment_activations SET version_id=NULL,updated_by=p_actor_user_id,updated_at=now() WHERE project_id=p_project_id AND environment=p_environment AND flag_id=p_flag_id;
    UPDATE public.flag_environment_states SET snapshot_version=snapshot_version+1,updated_at=now() WHERE project_id=p_project_id AND environment=p_environment RETURNING * INTO v_state;
    INSERT INTO public.flag_lifecycle_audit(project_id,environment,flag_id,old_version_id,action,actor_user_id,reason) VALUES (p_project_id,p_environment,p_flag_id,v_old_version_id,'deactivated',p_actor_user_id,p_reason);
  END IF;
  RETURN QUERY SELECT v_state.snapshot_version,v_changed;
END;
$$;

CREATE OR REPLACE FUNCTION get_flag_read_snapshot(p_key_hash TEXT)
RETURNS TABLE (environment TEXT, snapshot_version BIGINT, flags JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT key.flag_environment, COALESCE(state.snapshot_version, 0), COALESCE(snapshot.flags, '[]'::jsonb)
  FROM public.active_flag_read_keys key
  LEFT JOIN public.flag_environment_states state ON state.project_id=key.project_id AND state.environment=key.flag_environment
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('key',registry.key,'definitionVersion',version.version,'definition',version.definition) ORDER BY registry.key) flags
    FROM public.flag_environment_activations activation
    JOIN public.flag_registries registry ON registry.project_id=activation.project_id AND registry.id=activation.flag_id
    JOIN public.flag_definition_versions version ON version.project_id=activation.project_id AND version.flag_id=activation.flag_id AND version.id=activation.version_id
    WHERE activation.project_id=key.project_id AND activation.environment=key.flag_environment AND activation.version_id IS NOT NULL
  ) snapshot ON true
  WHERE key.key_hash=p_key_hash;
$$;

REVOKE ALL ON FUNCTION create_flag_definition_version(UUID,TEXT,JSONB,TEXT,UUID), set_flag_activation(UUID,TEXT,UUID,UUID,BIGINT,TEXT,UUID), deactivate_flag(UUID,TEXT,UUID,BIGINT,TEXT,UUID), get_flag_read_snapshot(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_flag_definition_version(UUID,TEXT,JSONB,TEXT,UUID), set_flag_activation(UUID,TEXT,UUID,UUID,BIGINT,TEXT,UUID), deactivate_flag(UUID,TEXT,UUID,BIGINT,TEXT,UUID), get_flag_read_snapshot(TEXT) TO service_role;
