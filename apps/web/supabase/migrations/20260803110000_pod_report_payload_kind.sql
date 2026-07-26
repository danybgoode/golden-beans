-- pod-report · Sprint 2.5a — teach the payload validity backstop about `kind`.
--
-- EXPAND-only, additive, and NOT an edit to 20260802100000_report_artifacts.sql — that migration is
-- already merged to `main` (Sprint 1, PR #30) and applied to production, so it is fixed history; the
-- discipline here is the same one every other migration in this directory follows (see
-- 20260726110000_cap_trigger_grants.sql, 20260803100000_report_shares.sql: correct forward, never
-- rewrite a shipped file).
--
-- ── The bug this closes ──────────────────────────────────────────────────────────────────────
-- `private.report_artifact_payload_is_valid(payload)` was written with only the roadmap shape in
-- mind, even though its own migration's header names BOTH kinds as the table's audience at birth. It
-- hard-requires `jsonb_typeof(payload->'items') = 'array'` and non-empty — a condition no `pod_report`
-- payload can ever satisfy, because that artifact is a computed document (`delivery`, `benchmarks`,
-- `maturity`, `caveats` — see lib/pod-report-schema.ts), not a list of rows. Confirmed directly
-- against the local DB before writing this fix:
--   select private.report_artifact_payload_is_valid(
--     '{"delivery":{"notInstrumented":[]}}'::jsonb
--   );  -- => false
-- Every `pod_report` push would have failed this CHECK with a bare constraint-violation 500 the
-- first time anyone tried it — undetectable by reading lib/pod-report-schema.ts or the route in
-- isolation, only by exercising the RPC.
--
-- ── Why the function grows a `p_kind` argument rather than two functions ────────────────────────
-- Both branches share the "is this even a JSON object, and is it under the size cap" preamble, and a
-- second function would either duplicate that or import the first — for a two-way branch, one
-- function reads as clearly as two. `report_artifacts_kind_check` already constrains `kind` to
-- exactly these two values, so the ELSE arm below is unreachable in practice and exists only so an
-- unrecognised kind fails closed rather than falling through to `true`.
CREATE OR REPLACE FUNCTION private.report_artifact_payload_is_valid(p_kind TEXT, p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) != 'object' THEN
    RETURN false;
  END IF;

  -- ── The write cap MUST measure exactly what the read path returns ──────────────────────────
  -- Same reasoning as Sprint 1 (Roadmap/LEARNINGS.md, the experiment-governance-v2 S3 trap):
  -- lib/report-artifacts.ts returns `payload` and nothing else for EITHER kind, so bounding
  -- `payload` itself makes write-accept imply read-accept by construction. One shared ceiling
  -- rather than a per-kind number to keep in sync with the app layer's own cap
  -- (POD_REPORT_MAX_PAYLOAD_BYTES = 2 MiB in lib/pod-report-schema.ts) — this is the generous DB
  -- backstop, not the primary bound, exactly as it was for roadmap.
  IF octet_length(p_payload::TEXT) > 4194304 THEN
    RETURN false;
  END IF;

  IF p_kind = 'roadmap' THEN
    RETURN COALESCE(
      jsonb_typeof(p_payload->'items') = 'array'
      AND jsonb_array_length(p_payload->'items') > 0,
      false
    );
  ELSIF p_kind = 'pod_report' THEN
    -- The one structural fact this backstop insists on, mirroring the app-level rule in
    -- parsePodReportPush: `delivery.notInstrumented` must be an array. That is this epic's central
    -- promise (Decision 4 — never render speed without its declared gaps) arriving as data, so it
    -- is the one thing worth a database-level guarantee rather than trusting the route alone. The
    -- DB is a backstop, not a second copy of the full parser — everything else in the document is
    -- left to lib/pod-report-schema.ts, same division of labour as roadmap's `items` check leaves
    -- row-shape validation to zod.
    RETURN COALESCE(
      jsonb_typeof(p_payload->'delivery') = 'object'
      AND jsonb_typeof(p_payload->'delivery'->'notInstrumented') = 'array',
      false
    );
  ELSE
    RETURN false;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.report_artifact_payload_is_valid(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

-- Repoint the CHECK at the two-argument function, then drop the one-argument version it replaces —
-- nothing else references it (grep confirms the only call site was this constraint).
ALTER TABLE report_artifacts
  DROP CONSTRAINT report_artifacts_payload_check;
ALTER TABLE report_artifacts
  ADD CONSTRAINT report_artifacts_payload_check
  CHECK (private.report_artifact_payload_is_valid(kind, payload));

DROP FUNCTION IF EXISTS private.report_artifact_payload_is_valid(JSONB);
