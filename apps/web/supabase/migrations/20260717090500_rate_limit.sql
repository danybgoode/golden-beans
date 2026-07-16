-- commercial-shell · Sprint 1, Story 1.3 (Roadmap/02-commercial/commercial-shell/sprint-1.md)
-- A small, reusable DB-backed rate-limit primitive (lib/rate-limit.ts) for public write routes.
-- DB-backed rather than in-memory: a Vercel serverless deployment doesn't reliably share
-- in-memory state across invocations/instances, so an in-process counter would silently
-- under-count. `key` is caller-defined (e.g. "waitlist:<sha256(ip)>") — never a raw IP, mirroring
-- lib/auth.ts's hashApiKey pattern. RLS ON, no policies, GRANT included from the start.
--
-- Fixed-window counter, incremented via a single atomic `INSERT ... ON CONFLICT DO UPDATE`
-- inside a Postgres function — NOT a naive app-level "SELECT count, then INSERT if under limit"
-- (that shape has a real TOCTOU race: concurrent requests can all read the same pre-insert count
-- and all pass, so a burst can blow well past `max`, bounded only by how fast Postgres processes
-- each insert relative to how fast new counts get read — caught in cross-review on this PR). A
-- single `INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING
-- count` is what Postgres actually serializes correctly under concurrency (row-level lock
-- acquired for the conflicting row) — no lost updates, no window where two callers can both
-- observe "under the limit." Fixed-window (not sliding) trades a small, well-understood
-- boundary-doubling property (up to ~2x `max` requests right at a window edge) for genuine
-- atomicity with zero added infra — the right tradeoff for a public-write spam guard, not a
-- security-critical limiter.

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION increment_rate_limit(p_key TEXT, p_window_start TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO rate_limit_counters (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

GRANT SELECT, INSERT, UPDATE ON TABLE rate_limit_counters TO service_role;
GRANT EXECUTE ON FUNCTION increment_rate_limit(TEXT, TIMESTAMPTZ) TO service_role;
