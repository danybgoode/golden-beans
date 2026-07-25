-- pod-report · Sprint 1, Story 1.1 — the rendering primitive: versioned, immutable report artifacts.
--
-- EXPAND-only, additive. This resolves the named decision gate "report-rendering becomes an engine
-- primitive" (Daniel, 2026-07-15) with two consumers at birth: the Roadmap Hub (this sprint) and the
-- Pod Report (Sprint 2). It is deliberately ONE table with a `kind` discriminator rather than two
-- tables — both are "a tenant's data, snapshotted at a moment, rendered later", and splitting them
-- would duplicate the versioning, immutability and tenancy machinery for no gain.
--
-- ── Why immutable + versioned rather than an upserted "current" row ───────────────────────────
-- A report is evidence. The Roadmap Hub stamps "as of merge <sha>, 2h ago" and a share link (Sprint
-- 3) hands that exact view to a client or an investor. If a push could overwrite what an earlier
-- link rendered, the artifact stops being evidence and becomes a mutable claim. Same reasoning as
-- experiment_decision_records: history is the product, not a side effect.

CREATE OR REPLACE FUNCTION private.report_artifact_payload_is_valid(p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(
    p_payload IS NOT NULL
    AND jsonb_typeof(p_payload) = 'object'
    -- ── The write cap MUST measure exactly what the read path returns ──────────────────────────
    -- Roadmap/LEARNINGS.md (experiment-governance-v2 S3): a write cap that counts fewer bytes than
    -- the read bound sums can accept a payload that is then permanently unreadable — and an
    -- append-only table can never be shrunk, so that bricks the view forever. Here the read path
    -- (lib/report-artifacts.ts) returns `payload` and nothing else, so bounding `payload` itself
    -- makes write-accept ⟹ read-accept true BY CONSTRUCTION rather than by two numbers agreeing.
    -- 4 MiB against a real extract of ~36 rows (~14 KB) is ~300x headroom.
    AND octet_length(p_payload::TEXT) <= 4194304
    AND jsonb_typeof(p_payload->'items') = 'array'
    -- An empty roadmap is a bug in the generator, not a legitimate state worth storing forever.
    AND jsonb_array_length(p_payload->'items') > 0,
    false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.report_artifact_payload_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE report_artifacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No cascading FK to projects, matching experiment_decision_records: a project cleanup removes the
  -- live tenant but must not silently rewrite the evidence a shared link already rendered.
  project_id      UUID        NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('roadmap', 'pod_report')),
  -- Monotonic per (project, kind). Allocated by the RPC below under a lock, never by the caller —
  -- two concurrent pushes reading "current max + 1" is the classic lost-update race.
  version         INTEGER     NOT NULL CHECK (version > 0),
  -- The PAYLOAD's contract version, distinct from `version` above (which counts pushes). Bumping
  -- the generator's shape bumps this, so an old artifact stays interpretable against the shape it
  -- was written in — the same reasoning as version-pinning the maturity ladder in Sprint 2.
  schema_version  INTEGER     NOT NULL CHECK (schema_version > 0),
  payload         JSONB       NOT NULL CHECK (private.report_artifact_payload_is_valid(payload)),
  -- The freshness stamp's source. Optional because a tenant pushing from their own tooling may have
  -- no commit to cite; gb's own pushes always set it.
  source_commit   TEXT        CHECK (source_commit IS NULL OR source_commit ~ '^[0-9a-f]{7,40}$'),
  source_ref      TEXT        CHECK (source_ref IS NULL OR char_length(source_ref) BETWEEN 1 AND 200),
  -- When the GENERATOR ran, supplied by the caller. Distinct from created_at (when we stored it):
  -- a push retried an hour later must still stamp the roadmap's real age, not the retry's.
  generated_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, version)
);

-- The hub's only hot query: "latest artifact of this kind for this tenant". DESC so the planner
-- takes the first row without a sort.
CREATE INDEX report_artifacts_latest_idx
  ON report_artifacts(project_id, kind, version DESC);

ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;

-- ── Append-only, enforced at the database ────────────────────────────────────────────────────
-- Roadmap/LEARNINGS.md: "A narrower GRANT revokes nothing — on Supabase, new public-schema tables
-- arrive with service_role already granted ALL." Granting SELECT+INSERT alone would be purely
-- additive and the append-only claim would be false. The explicit REVOKE is what makes it true, and
-- the spec asserts the PROPERTY (attempt the mutation with the app's own client) rather than
-- trusting the grant statement to mean what it looks like.
REVOKE ALL ON TABLE report_artifacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE report_artifacts TO service_role;
REVOKE UPDATE, DELETE ON TABLE report_artifacts FROM service_role;

CREATE OR REPLACE FUNCTION private.enforce_report_artifact_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Fixture cleanup by the migration owner is possible only once the tenant is gone, so specs can
    -- tidy up after themselves without opening a hole in normal operation.
    IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id) THEN
      RAISE EXCEPTION 'report artifacts are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'report artifacts are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER report_artifacts_immutable_trg
  BEFORE UPDATE OR DELETE ON report_artifacts
  FOR EACH ROW EXECUTE FUNCTION private.enforce_report_artifact_immutability();

CREATE OR REPLACE FUNCTION private.reject_report_artifact_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'report artifacts are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER report_artifacts_no_truncate_trg
  BEFORE TRUNCATE ON report_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_report_artifact_truncate();

-- ── Version allocation ───────────────────────────────────────────────────────────────────────
-- Concurrent pushes for the same (project, kind) must not both read max(version)=N and both write
-- N+1. Roadmap/LEARNINGS.md is blunt about the trap: `UPDATE … FROM other_table` does NOT lock the
-- joined rows, and a check-then-act on a snapshot gives you nothing under READ COMMITTED. So this
-- takes a transaction-scoped ADVISORY lock keyed on (project, kind) — the allocation and the insert
-- are then serialised for that pair without blocking any other tenant.
CREATE OR REPLACE FUNCTION push_report_artifact(
  p_project_id     UUID,
  p_kind           TEXT,
  p_schema_version INTEGER,
  p_payload        JSONB,
  p_generated_at   TIMESTAMPTZ,
  p_source_commit  TEXT DEFAULT NULL,
  p_source_ref     TEXT DEFAULT NULL
)
RETURNS TABLE (artifact_id UUID, artifact_version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required' USING ERRCODE = '22023';
  END IF;

  -- hashtextextended keeps the two-key lock inside one bigint. Transaction-scoped, so it releases
  -- on commit or rollback with no unlock path to forget.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::TEXT || ':' || p_kind, 0));

  SELECT COALESCE(MAX(a.version), 0) + 1
    INTO v_next
    FROM public.report_artifacts a
   WHERE a.project_id = p_project_id
     AND a.kind = p_kind;

  RETURN QUERY
  INSERT INTO public.report_artifacts (
    project_id, kind, version, schema_version, payload, source_commit, source_ref, generated_at
  )
  VALUES (
    p_project_id, p_kind, v_next, p_schema_version, p_payload, p_source_commit, p_source_ref, p_generated_at
  )
  RETURNING report_artifacts.id, report_artifacts.version;
END;
$$;

-- SECURITY DEFINER + the REVOKE above is what lets the RPC insert while the role itself cannot
-- UPDATE/DELETE. Function-level denial for everyone else, pinned by a spec that asserts a FUNCTION
-- error (not an RLS error — an RLS failure would mean EXECUTE leaked and the body actually ran).
REVOKE ALL ON FUNCTION push_report_artifact(UUID, TEXT, INTEGER, JSONB, TIMESTAMPTZ, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION push_report_artifact(UUID, TEXT, INTEGER, JSONB, TIMESTAMPTZ, TEXT, TEXT)
  TO service_role;
