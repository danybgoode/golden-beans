-- signals-loop · Sprint 3, Story 3.2 — staged writes: propose → confirm → apply.
--
-- The engine's FIRST public mutation surface. Everything before this epic was read-only from the
-- outside; an agent holding a connector URL could look and could not touch.
--
-- ── Why a staging table rather than a direct write ─────────────────────────────────────────────
-- The tool an agent calls does not mutate. It PROPOSES: it returns a preview of exactly what would
-- change plus a single-use confirmation token, and nothing happens until a second call presents that
-- token. Lifted from medusa-bonsai's `catalog-management` pattern, and the reason is specific to
-- who is calling. A language model deciding to resolve forty tasks because it misread a queue is a
-- realistic failure, not a paranoid one — and the model is the CUSTOMER'S, running under prompts
-- this engine will never see. Two steps mean the destructive act is a deliberate second decision
-- that a human reviewing a transcript can see as a distinct event.
--
-- ── Why the token is a ROW and not a signed blob ───────────────────────────────────────────────
-- A signed/JWT-style token needs no table and cannot be made single-use without one, because
-- "has this been spent?" is state. Single-use is the property that matters most here: a replayed
-- confirmation is a second mutation the agent never decided to make. So the row IS the ledger, and
-- spending it is an atomic UPDATE (see consume_write_confirmation).
--
-- ── What it stores, and what it deliberately does not ──────────────────────────────────────────
-- The token is stored HASHED, through the same lib/credential-hash.ts every other credential in this
-- codebase uses. It is a bearer capability that authorizes a mutation, so it gets the treatment a
-- bearer capability gets — not "it is short-lived, plaintext is fine." A leaked database backup
-- must not contain spendable write confirmations.
--
-- EXPAND-only and additive: nothing reads this until lib/task-write-staging.ts does.

CREATE TABLE IF NOT EXISTS task_write_confirmations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE so a hash collision or a repeated insert is a database error rather than two rows that
  -- both look spendable.
  token_hash       TEXT        NOT NULL UNIQUE,
  -- The project the PROPOSING credential resolved to. `consume_write_confirmation` requires the
  -- applying caller to resolve to this same project, so a token minted under project A's credential
  -- is inert under project B's even if the string leaks. That is the second half of the two-
  -- credential rule (Amendment 2), carried across the two calls.
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id          UUID        NOT NULL REFERENCES tasks(id)     ON DELETE CASCADE,
  action           TEXT        NOT NULL CHECK (action IN ('claim', 'resolve', 'dismiss')),
  -- The proposed mutation's parameters, frozen at propose time. Re-reading them from the apply call
  -- would defeat the entire design: the agent would be able to confirm something other than what it
  -- was shown. The preview an agent sees and the mutation that runs are built from THESE columns.
  actor            TEXT,
  resolution       TEXT,
  evidence_pointer TEXT,
  -- Which agent_write credential proposed this, for the audit trail. ON DELETE SET NULL because a
  -- revoked key's row may later be pruned and that must not cascade into deleting history.
  agent_key_id     UUID        REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  -- NULL means unspent. Set exactly once, atomically, by consume_write_confirmation.
  consumed_at      TIMESTAMPTZ
);

-- The only lookup this table serves on the hot path.
CREATE INDEX IF NOT EXISTS task_write_confirmations_unspent_idx
  ON task_write_confirmations(project_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE task_write_confirmations ENABLE ROW LEVEL SECURITY;

-- No anon policies, matching every other table here: this is reached service-role only, server-side.
REVOKE ALL ON TABLE task_write_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE task_write_confirmations TO service_role;
-- UPDATE is granted because spending a token IS an update. DELETE is not: expired rows are evidence
-- of proposals that were never confirmed, which is exactly the trail worth keeping when asking "what
-- did this agent try to do?". Pruning is an owner-level maintenance act, deliberately not reachable
-- from the application — the same arrangement audit_log uses and for the same reason.
--
-- A narrower GRANT revokes nothing on Supabase (LEARNINGS, and re-confirmed against this database in
-- the sibling migration 20260806100000): default privileges hand service_role ALL on a new
-- public-schema table, so the DELETE has to be taken away explicitly or the line above is decorative.
REVOKE DELETE, TRUNCATE ON TABLE task_write_confirmations FROM service_role;

COMMENT ON TABLE task_write_confirmations IS
  'Single-use confirmation tokens for the connector''s staged write tools (propose -> confirm -> '
  'apply). Tokens are stored hashed; spending one is an atomic UPDATE in consume_write_confirmation. '
  'signals-loop Sprint 3, Story 3.2.';

-- ── Spending a confirmation, atomically ─────────────────────────────────────────────────────────
--
-- Single-use is a CONCURRENCY property, not a validation one. The tempting shape —
--
--   SELECT … WHERE consumed_at IS NULL;   -- check
--   UPDATE … SET consumed_at = now();     -- act
--
-- is check-then-act, and two concurrent applies with the same token both pass the check and both
-- mutate. Roadmap/LEARNINGS.md has a whole entry on this class from the delivery-router epic, where
-- iterating fast on lock/settle logic manufactured new races as quickly as it closed old ones.
--
-- So the UPDATE's WHERE clause IS the gate: `consumed_at IS NULL` is evaluated by the same statement
-- that sets it, under a row lock, and whether it matched is reported by ROW_COUNT. Exactly one
-- concurrent caller can observe a match. No SELECT-then-UPDATE, no advisory lock needed, nothing to
-- get subtly wrong on a later edit.
--
-- Expiry is compared HERE, in database time, for the same reason active_share_links exists: a token
-- judged live by the app's clock and spent against the database's is a skew window.
--
-- The reason returned for a failure is classified by a SECOND query scoped to the SAME project, so
-- an unknown token and another tenant's token are indistinguishable — no existence oracle over other
-- projects' confirmations. That classification is advisory only; it can never turn a refusal into a
-- success, because the UPDATE above already decided.
CREATE OR REPLACE FUNCTION consume_write_confirmation(
  p_token_hash TEXT,
  p_project_id UUID
)
RETURNS TABLE (
  ok               BOOLEAN,
  reason           TEXT,
  task_id          UUID,
  action           TEXT,
  actor            TEXT,
  resolution       TEXT,
  evidence_pointer TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row        task_write_confirmations%ROWTYPE;
  v_consumed   TIMESTAMPTZ;
  v_found      BOOLEAN;
BEGIN
  UPDATE task_write_confirmations c
     SET consumed_at = now()
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id
     AND c.consumed_at IS NULL
     AND c.expires_at > now()
  RETURNING c.* INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_row.task_id, v_row.action, v_row.actor,
                        v_row.resolution, v_row.evidence_pointer;
    RETURN;
  END IF;

  -- Classify the refusal. Scoped to the same project on purpose (see the header): a token belonging
  -- to another tenant must answer exactly as an invented one does.
  SELECT TRUE, c.consumed_at INTO v_found, v_consumed
    FROM task_write_confirmations c
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id;

  IF NOT COALESCE(v_found, FALSE) THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSIF v_consumed IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'already_used'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 'expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$$;

-- A CREATE OR REPLACE on a function silently restores PostgreSQL's PUBLIC EXECUTE default when the
-- signature changes forces a drop — Roadmap/LEARNINGS.md has this scar, where a service-role-only
-- function quietly became anon-callable. Stated explicitly every time, never assumed.
REVOKE ALL ON FUNCTION consume_write_confirmation(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_write_confirmation(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION consume_write_confirmation(TEXT, UUID) IS
  'Atomically spend a single-use write confirmation. The UPDATE''s WHERE clause is the gate, so two '
  'concurrent applies cannot both succeed. Refusal reasons are scoped to the caller''s project, so '
  'another tenant''s token is indistinguishable from an unknown one.';
