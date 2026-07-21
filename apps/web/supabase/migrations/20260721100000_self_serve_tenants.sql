-- multi-tenant-activation · Sprint 2, Stories 2.1 + 2.2 (Roadmap/02-commercial/multi-tenant-activation)
-- The substrate for self-serve tenants: a project can now be born from a confirmed signup rather
-- than a hand-run seed script, and each project carries its OWN isolation limits as data.
--
-- Additive + one contract step. Same RLS-on / no-policies / service-role-only pattern as every
-- other table here (see 20260713220000_track_events.sql).

-- ── contract phase: projects.api_key_hash becomes optional ───────────────────────────────────
-- Story 1.3 moved credential resolution to the api_keys table; apps/web/lib/auth.ts has read
-- api_keys exclusively since it deployed (2026-07-21), and nothing else reads this column. It
-- stays (dropping it is a separate, later contract step once the seed scripts stop writing it),
-- but it can no longer be NOT NULL: a self-serve project's key exists ONLY as an api_keys row, so
-- provisioning would otherwise be forced to duplicate a credential hash into a legacy column
-- purely to satisfy a constraint. UNIQUE is retained and stays meaningful — Postgres does not
-- treat two NULLs as equal, so any number of self-serve projects can carry NULL here.
ALTER TABLE projects ALTER COLUMN api_key_hash DROP NOT NULL;

-- ── who owns a project, and what it's allowed to consume ─────────────────────────────────────
--   created_by:  the auth user whose confirmed signup provisioned this project. NULL for the
--                three hand-seeded tenants that predate self-serve. ON DELETE SET NULL, not
--                CASCADE: deleting an auth user must never delete a project (and its events)
--                out from under the other members of that project.
--   first_event_at: stamped once, by the ingest route, the first time this project ever
--                successfully persists an event. Powers the `first_event_ingested` dogfood
--                funnel stage (Story 3.3) with ONE conditional write per project lifetime
--                instead of a per-request "have they sent anything yet?" query.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS first_event_at TIMESTAMPTZ;

-- Isolation limits, per project row — Story 2.2's acceptance is explicit that these are
-- CONFIGURABLE PER PROJECT, not hardcoded constants, so raising a real customer's ceiling is an
-- UPDATE and never a deploy. Defaults are deliberately generous enough that no existing tenant
-- changes behaviour the day this lands, and small enough that an abusive free signup is bounded.
--
-- monthly_event_quota:   events accepted per calendar month. Enforced by an atomic counter, not
--                        a COUNT(*) over events (see lib/quota.ts).
-- ingest_rate_per_min:   per-API-KEY ingest ceiling — per key, not per project, so one runaway
--                        integration cannot starve a tenant's other, healthy integrations.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monthly_event_quota INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ingest_rate_per_min INTEGER NOT NULL DEFAULT 600;

-- A quota/rate ceiling of 0 would silently brick a tenant's ingest with no way to tell it apart
-- from a misconfigured default; a negative one is nonsense. Require a real positive ceiling —
-- "unlimited" is expressed as a very large number, not as 0.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_monthly_event_quota_positive;
ALTER TABLE projects ADD CONSTRAINT projects_monthly_event_quota_positive CHECK (monthly_event_quota > 0);
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ingest_rate_positive;
ALTER TABLE projects ADD CONSTRAINT projects_ingest_rate_positive CHECK (ingest_rate_per_min > 0);

-- ONE self-serve project per creator, enforced by the DATABASE rather than by an application
-- read-then-write. lib/provisioning.ts checks for an existing membership before inserting, but
-- that check and the insert are two separate round-trips with no transaction between them
-- (supabase-js speaks REST, not sessions) — so two concurrent confirmed callbacks, which is
-- exactly what a double-clicked confirmation link produces, can both observe "no membership" and
-- both create a project. A partial unique index closes that race properly: the loser gets a
-- unique violation and re-reads the winner's tenant (cross-review, Codex 2026-07-20).
--
-- Partial (WHERE created_by IS NOT NULL) so it constrains only self-serve tenants: the
-- hand-seeded projects all carry NULL here and any number of them may coexist.
CREATE UNIQUE INDEX IF NOT EXISTS projects_one_per_creator_idx
  ON projects(created_by) WHERE created_by IS NOT NULL;

-- ── quota refund ─────────────────────────────────────────────────────────────────────────────
-- The ingest guards increment their counter BEFORE the event insert, because an atomic
-- increment-and-compare is the only shape that is race-free (see the rate_limit migration). That
-- leaves one over-charge: an event whose insert then FAILS has consumed quota while storing
-- nothing. Bounded at one per failure — but a sustained outage on `events` means every retry burns
-- another unit, so a tenant could exhaust a whole month with zero rows stored (cross-review, Codex
-- 2026-07-20, correcting an earlier comment that called the overcharge "bounded at one" full stop).
--
-- This gives the route a way to hand the unit back. GREATEST(0, ...) so a refund can never drive a
-- counter negative, which would hand out free quota — the failure mode of a naive decrement.
CREATE OR REPLACE FUNCTION decrement_rate_limit(p_key TEXT, p_window_start TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
  UPDATE rate_limit_counters
  SET count = GREATEST(0, count - 1)
  WHERE key = p_key AND window_start = p_window_start;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION decrement_rate_limit(TEXT, TIMESTAMPTZ) TO service_role;

-- ── audit trail (Story 2.2) ──────────────────────────────────────────────────────────────────
-- An append-only record of every credential and provisioning action. Answers "who minted the key
-- that is ingesting this?" and "when did this project come into existence, and from whose
-- signup?" — questions the api_keys table alone cannot answer, because a revoked key's row tells
-- you it was revoked but never by whom.
--
--   actor_user_id: the auth user who performed the action; NULL for system-performed actions
--                  (the signup provisioner acts before any session exists on some paths) and for
--                  actions whose actor has since been deleted (ON DELETE SET NULL — an audit row
--                  must outlive the account it describes, or the trail erases itself exactly when
--                  it matters most).
--   metadata:      non-secret context only (a key label, a project slug). NEVER a plaintext key
--                  or a password — this table is read by humans debugging incidents.
--   project_id:    ON DELETE SET NULL, deliberately NOT CASCADE. Cascading would make deleting a
--                  project erase its entire credential history — an indirect DELETE that walks
--                  straight around the REVOKE below and defeats the append-only property at
--                  exactly the moment it matters most (cross-review, Codex 2026-07-20). The rows
--                  survive the project; `metadata.slug` is what still identifies them afterward,
--                  which is why the provisioner records the slug there rather than relying on the
--                  foreign key alone.
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_project_created_idx ON audit_log(project_id, created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Append-only against the application, deliberately: a bug (or a compromised app path) must not be
-- able to rewrite history. The service-role key bypasses RLS but NOT table grants, so grants are
-- the right lever — but a NARROWER GRANT ALONE DOES NOT ACHIEVE THIS, which is worth stating
-- plainly because the first version of this migration got it wrong and claimed otherwise in a
-- comment. Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO service_role` in
-- the public schema, so a new table arrives with UPDATE and DELETE already granted; a subsequent
-- `GRANT SELECT, INSERT` is purely additive and revokes nothing.
--
-- Caught by e2e/ingest-guardrails.spec.ts, which attempts the UPDATE and the DELETE with the very
-- client the app uses rather than trusting the grant statement to mean what it looks like it means.
-- An explicit REVOKE is what actually makes the property true.
GRANT SELECT, INSERT ON TABLE audit_log TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM service_role;
-- Same treatment for the roles RLS already blocks — defence in depth costs nothing here, and it
-- means the property survives someone later adding an RLS policy for a legitimate read.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM anon, authenticated;
-- The table owner (a human with a direct Postgres connection) can still prune it — that is the
-- intended escape hatch for retention, and it is deliberately not reachable from the application.
