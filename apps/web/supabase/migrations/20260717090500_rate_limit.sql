-- commercial-shell · Sprint 1, Story 1.3 (Roadmap/02-commercial/commercial-shell/sprint-1.md)
-- A small, reusable DB-backed rate-limit primitive (lib/rate-limit.ts) for public write routes.
-- DB-backed rather than in-memory: a Vercel serverless deployment doesn't reliably share
-- in-memory state across invocations/instances, so an in-process counter would silently
-- under-count. `key` is caller-defined (e.g. "waitlist:<sha256(ip)>") — never a raw IP, mirroring
-- lib/auth.ts's hashApiKey pattern. RLS ON, no policies, GRANT included from the start.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rate_limit_hits_key_created_idx ON rate_limit_hits (key, created_at);

GRANT SELECT, INSERT ON TABLE rate_limit_hits TO service_role;
