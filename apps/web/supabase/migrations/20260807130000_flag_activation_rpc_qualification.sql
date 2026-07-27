-- flag-serving-and-prd-g · Sprint 1 hotfix — qualify state revision increments in RETURNS TABLE RPCs.

CREATE OR REPLACE FUNCTION set_flag_activation(p_project_id UUID, p_environment TEXT, p_flag_id UUID, p_version_id UUID, p_expected_snapshot_version BIGINT, p_reason TEXT, p_actor_user_id UUID)
RETURNS TABLE (snapshot_version BIGINT, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_state public.flag_environment_states%ROWTYPE; v_old_version_id UUID; v_changed BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_members member WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner') THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_environment NOT IN ('development','preview','production') OR p_expected_snapshot_version IS NULL OR p_expected_snapshot_version < 0 OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag activation command' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flag_definition_versions candidate WHERE candidate.project_id=p_project_id AND candidate.flag_id=p_flag_id AND candidate.id=p_version_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_environment, 0));
  INSERT INTO public.flag_environment_states(project_id,environment) VALUES (p_project_id,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.flag_environment_states state WHERE state.project_id=p_project_id AND state.environment=p_environment FOR UPDATE;
  IF v_state.snapshot_version <> p_expected_snapshot_version THEN RAISE EXCEPTION 'flag snapshot version conflict' USING ERRCODE = '40001'; END IF;
  SELECT activation.version_id INTO v_old_version_id FROM public.flag_environment_activations activation WHERE activation.project_id=p_project_id AND activation.environment=p_environment AND activation.flag_id=p_flag_id FOR UPDATE;
  v_changed := v_old_version_id IS DISTINCT FROM p_version_id;
  IF v_changed THEN
    INSERT INTO public.flag_environment_activations(project_id,environment,flag_id,version_id,updated_by) VALUES (p_project_id,p_environment,p_flag_id,p_version_id,p_actor_user_id) ON CONFLICT (project_id,environment,flag_id) DO UPDATE SET version_id=EXCLUDED.version_id,updated_by=EXCLUDED.updated_by,updated_at=now();
    UPDATE public.flag_environment_states state SET snapshot_version=state.snapshot_version+1,updated_at=now() WHERE state.project_id=p_project_id AND state.environment=p_environment RETURNING * INTO v_state;
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
  IF NOT EXISTS (SELECT 1 FROM public.project_members member WHERE member.project_id = p_project_id AND member.user_id = p_actor_user_id AND member.role = 'owner') THEN RAISE EXCEPTION 'flag management requires project ownership' USING ERRCODE = '42501'; END IF;
  IF p_environment NOT IN ('development','preview','production') OR p_expected_snapshot_version IS NULL OR p_expected_snapshot_version < 0 OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'invalid flag deactivation command' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flag_registries registry WHERE registry.project_id=p_project_id AND registry.id=p_flag_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_environment, 0));
  INSERT INTO public.flag_environment_states(project_id,environment) VALUES (p_project_id,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.flag_environment_states state WHERE state.project_id=p_project_id AND state.environment=p_environment FOR UPDATE;
  IF v_state.snapshot_version <> p_expected_snapshot_version THEN RAISE EXCEPTION 'flag snapshot version conflict' USING ERRCODE = '40001'; END IF;
  SELECT activation.version_id INTO v_old_version_id FROM public.flag_environment_activations activation WHERE activation.project_id=p_project_id AND activation.environment=p_environment AND activation.flag_id=p_flag_id FOR UPDATE;
  v_changed := v_old_version_id IS NOT NULL;
  IF v_changed THEN
    UPDATE public.flag_environment_activations activation SET version_id=NULL,updated_by=p_actor_user_id,updated_at=now() WHERE activation.project_id=p_project_id AND activation.environment=p_environment AND activation.flag_id=p_flag_id;
    UPDATE public.flag_environment_states state SET snapshot_version=state.snapshot_version+1,updated_at=now() WHERE state.project_id=p_project_id AND state.environment=p_environment RETURNING * INTO v_state;
    INSERT INTO public.flag_lifecycle_audit(project_id,environment,flag_id,old_version_id,action,actor_user_id,reason) VALUES (p_project_id,p_environment,p_flag_id,v_old_version_id,'deactivated',p_actor_user_id,p_reason);
  END IF;
  RETURN QUERY SELECT v_state.snapshot_version,v_changed;
END;
$$;
REVOKE ALL ON FUNCTION set_flag_activation(UUID,TEXT,UUID,UUID,BIGINT,TEXT,UUID), deactivate_flag(UUID,TEXT,UUID,BIGINT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_flag_activation(UUID,TEXT,UUID,UUID,BIGINT,TEXT,UUID), deactivate_flag(UUID,TEXT,UUID,BIGINT,TEXT,UUID) TO service_role;
