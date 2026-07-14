-- Growth Engine v1 · Sprint 3, Story 3.1 (Roadmap/01-growth-engine/growth-engine-v1)
-- North Star metric + leading-inputs data model. Mirrors the `features` table's shape
-- (RLS on, no policies, explicit service_role grants included from the start — Sprint 2
-- needed a follow-up migration for grants; not repeating that here).
--
-- An input's `value_source` decides how Story 3.4's report resolves its time series:
--   - 'telemetry_event': computed on the fly from the existing `events` table (grouping
--     `source_event` occurrences by day) — no separate storage, no ingestion.
--   - 'external_push': read from `input_values`, an append-only ledger populated by
--     POST /v1/inputs/:key/values (Story 3.3). Used for `attributed_revenue`, sourced
--     from Miyagi's own `financial_event` ledger — golden-beans stores this DERIVED
--     daily aggregate only, never a copy of Medusa's order/payment rows (the
--     commerce-truth boundary from the epic's scope doc).

CREATE TABLE IF NOT EXISTS north_star_metrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key          TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
ALTER TABLE north_star_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS leading_inputs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_id     UUID        NOT NULL REFERENCES north_star_metrics(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  value_source  TEXT        NOT NULL CHECK (value_source IN ('telemetry_event', 'external_push')),
  source_event  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
ALTER TABLE leading_inputs ENABLE ROW LEVEL SECURITY;

-- ── feature_inputs ───────────────────────────────────────────────────────────
-- The linkage table (Story 3.2). `feature_key` is a loose reference (not a FK to
-- `features.key`) — mirrors how `events.feature_id` already works, so a feature can be
-- linked before it's ever synced into the registry.
CREATE TABLE IF NOT EXISTS feature_inputs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_key TEXT        NOT NULL,
  input_id    UUID        NOT NULL REFERENCES leading_inputs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, feature_key, input_id)
);
ALTER TABLE feature_inputs ENABLE ROW LEVEL SECURITY;

-- ── input_values ─────────────────────────────────────────────────────────────
-- Append-only ledger for 'external_push' inputs (Story 3.3). `value` stores DOLLARS
-- (converted from Miyagi's financial_event.amount_cents / 100 at sync time —
-- single-currency assumption, noted as known v1 debt: currency_code isn't reconciled).
-- `dedupe_key` (input_id:occurred_on) makes a re-run idempotent (ON CONFLICT DO NOTHING)
-- — a corrected day isn't supported in v1.
--
-- Append-only is enforced by a trigger, not just app discipline — belt (DB trigger) +
-- suspenders (the route only ever inserts) — mirroring medusa-bonsai's own
-- `financial_event_no_mutation` trigger for its analogous ledger (money-adjacent data
-- deserves the same guarantee here).
CREATE TABLE IF NOT EXISTS input_values (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  input_id     UUID          NOT NULL REFERENCES leading_inputs(id) ON DELETE CASCADE,
  occurred_on  DATE          NOT NULL,
  value        NUMERIC(14,2) NOT NULL,
  dedupe_key   TEXT          NOT NULL UNIQUE,
  recorded_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE input_values ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION input_values_no_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'input_values is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS input_values_no_mutation ON input_values;
CREATE TRIGGER input_values_no_mutation
  BEFORE UPDATE OR DELETE ON input_values
  FOR EACH ROW EXECUTE FUNCTION input_values_no_mutation();

-- The route (POST /v1/inputs/:key/values) already checks both of these before
-- inserting, but only service_role can write this table at all, so a second belt here
-- catches a future service-role-level mistake (a bad script, a manual insert) before it
-- can corrupt money-adjacent data: a value row must belong to the SAME project as its
-- input (never cross-tenant), and its input must actually be 'external_push' (a
-- telemetry_event input's values are computed on the fly, never stored here).
CREATE OR REPLACE FUNCTION input_values_check_input() RETURNS trigger AS $$
DECLARE
  input_project_id UUID;
  input_value_source TEXT;
BEGIN
  SELECT project_id, value_source INTO input_project_id, input_value_source
  FROM leading_inputs WHERE id = NEW.input_id;

  IF input_project_id IS NULL THEN
    RAISE EXCEPTION 'input_values.input_id % does not reference an existing leading_inputs row', NEW.input_id;
  END IF;
  IF input_project_id != NEW.project_id THEN
    RAISE EXCEPTION 'input_values.project_id must match its input''s project_id (cross-tenant write rejected)';
  END IF;
  IF input_value_source != 'external_push' THEN
    RAISE EXCEPTION 'input_values can only be written for an external_push input, got %', input_value_source;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS input_values_check_input ON input_values;
CREATE TRIGGER input_values_check_input
  BEFORE INSERT ON input_values
  FOR EACH ROW EXECUTE FUNCTION input_values_check_input();

GRANT SELECT, INSERT, UPDATE ON TABLE north_star_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE leading_inputs TO service_role;
GRANT SELECT, INSERT ON TABLE feature_inputs TO service_role;
GRANT SELECT, INSERT ON TABLE input_values TO service_role;
