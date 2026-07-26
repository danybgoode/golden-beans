-- signals-loop · Sprint 1, Story 1.0 (Roadmap/01-growth-engine/signals-loop/sprint-1.md)
-- Signals and tasks: the storage half of the closed loop.
--
-- EXPAND-only and strictly additive. `events` is not touched — signals ride the existing /v1/track
-- envelope as reserved `$error`/`$friction` events (the S1.1 tags/metadata forward-compat, built
-- for exactly this), and this migration only adds where they are GROUPED to.
--
-- ── The three properties this file is responsible for ─────────────────────────────────────────
--
-- 1. GROUPING IS ATOMIC. A crash loop sends the same fingerprint from many concurrent serverless
--    invocations. Every counter here is advanced inside a single SQL statement
--    (`ON CONFLICT DO UPDATE SET event_count = signals.event_count + 1`), never by reading a value
--    into application code and writing it back. Roadmap/LEARNINGS.md is unambiguous about the cost
--    of the alternative: event-destination-router S2 spent 24 cross-review rounds on lock/settle
--    races, and the durable lesson was that iterating fast on that kind of code manufactures new
--    races as quickly as it closes old ones. The way to win is to not write it.
--
-- 2. ONE ACTIVE TASK PER SIGNAL, ENFORCED BY THE DATABASE. "An open task absorbs new matching
--    signals" is the acceptance criterion; a partial UNIQUE index makes a second one
--    unrepresentable rather than merely unlikely. Application-level dedupe would be a
--    check-then-act race, which is the same family of bug as (1).
--
-- 3. NOTHING IS DELETED. Signals and tasks are the evidence a resolution claim rests on. DELETE is
--    REVOKEd, not merely unused — because on Supabase a new public-schema table arrives with
--    service_role already granted ALL, so a narrower GRANT revokes nothing and a comment claiming
--    "append-only" would simply be false (Roadmap/LEARNINGS.md, multi-tenant-activation S2).

CREATE SCHEMA IF NOT EXISTS private;

-- ══ signals ═══════════════════════════════════════════════════════════════════════════════════
-- One row per distinct problem per project. A thousand repeats are a count on one row, not a
-- thousand rows — which is the entire reason this table exists rather than the queue reading
-- `events` directly.

CREATE TABLE IF NOT EXISTS signals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 'error'    — captured from a customer's runtime via the SDK.
  -- 'friction' — DERIVED server-side from funnel aggregates the engine already had. No client code.
  kind           TEXT        NOT NULL CHECK (kind IN ('error', 'friction')),
  -- Computed by lib/signal-fingerprint.ts, server-side, and NEVER read from the request payload.
  -- The engine decides what counts as one problem; a client that fingerprints its own errors has
  -- re-implemented the grouping in n places and the counts stop being comparable across releases.
  fingerprint    TEXT        NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  -- Already scrubbed by lib/signal-scrub.ts before it reaches here. Bounded so a pathological
  -- message cannot bloat the row the dashboard lists.
  title          TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  feature_id     TEXT        CHECK (feature_id IS NULL OR char_length(feature_id) BETWEEN 1 AND 128),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- BIGINT, not INTEGER: this is the one counter in the schema that a crash loop can drive very
  -- high very fast, and an overflow here would abort ingest for that tenant.
  event_count    BIGINT      NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  -- Maintained from signal_users below — EXACT, not estimated. A "users affected" number that is
  -- actually "events seen" would make the impact rank a lie in precisely the crash-loop case where
  -- it matters most: one user in a retry loop must not outrank a thousand users hitting it once.
  users_affected INTEGER     NOT NULL DEFAULT 0 CHECK (users_affected >= 0),
  -- The most recent SCRUBBED occurrence, for the evidence bundle. Capped hard: this is the field
  -- most likely to grow without anyone noticing, and it is the one carrying customer runtime data.
  sample         JSONB       NOT NULL DEFAULT '{}'::JSONB
                             CHECK (octet_length(sample::TEXT) <= 65536),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The grouping key. Per-project, not global: two tenants hitting the same library bug are two
  -- separate problems, owned by two separate teams, and must never share a row.
  UNIQUE (project_id, fingerprint)
);

-- The queue's hot read: this project's signals, most impactful first.
CREATE INDEX IF NOT EXISTS signals_project_rank_idx
  ON signals(project_id, users_affected DESC, event_count DESC);
CREATE INDEX IF NOT EXISTS signals_project_last_seen_idx
  ON signals(project_id, last_seen_at DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- ══ signal_users ══════════════════════════════════════════════════════════════════════════════
-- The distinct-user set behind `signals.users_affected`.
--
-- A separate table rather than a counter incremented on every event, because "users affected" must
-- count each user ONCE however many times they hit the bug. Rather than a COUNT(DISTINCT) over
-- `events` on every read — which grows without bound and pulls the queue's latency along with it —
-- membership is recorded once and the counter is advanced only on a genuinely new member.

CREATE TABLE IF NOT EXISTS signal_users (
  signal_id  UUID        NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  -- The tenant's own opaque user id, exactly as `events.user_id` stores it. No new PII surface:
  -- this is an identifier the engine already holds, joined to a signal.
  user_id    TEXT        NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, user_id)
);

ALTER TABLE signal_users ENABLE ROW LEVEL SECURITY;

-- ══ tasks ═════════════════════════════════════════════════════════════════════════════════════
-- A signal that crossed a promotion threshold, with the product context that makes it actionable.
-- This is the unit an agent pulls.

CREATE TABLE IF NOT EXISTS tasks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  signal_id        UUID        NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'claimed', 'resolved', 'dismissed')),
  title            TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- The evidence bundle: feature, flag state, funnel position, experiment variant, scrubbed sample
  -- events. Every field traces to an engine query — nothing here is inferred or generated, because
  -- there is no LLM anywhere in this engine and that is the product claim.
  evidence         JSONB       NOT NULL DEFAULT '{}'::JSONB
                               CHECK (octet_length(evidence::TEXT) <= 131072),
  -- Persisted so the queue can be ordered without recomputing decay for every row on every read.
  -- Recomputed at promotion and on each refresh; see lib/signal-rank.ts for why it is rounded.
  impact_rank      NUMERIC     NOT NULL DEFAULT 0 CHECK (impact_rank >= 0),
  -- Who claimed it. An opaque agent-supplied label, not a user id: the whole point of the epic is
  -- that the claimer is the CUSTOMER'S agent, which this engine has no account for and wants none.
  claimed_by       TEXT        CHECK (claimed_by IS NULL OR char_length(claimed_by) BETWEEN 1 AND 128),
  claimed_at       TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  resolution       TEXT        CHECK (resolution IN ('fixed', 'wont_fix', 'duplicate', 'not_reproducible')),
  -- signals-loop Amendment 4.2 — a commit SHA, PR URL or note. NULLABLE on purpose: a resolution
  -- with no pointer is recorded as resolved WITHOUT evidence, never silently as evidenced. Same
  -- rule pod-report welded in one layer up (an unresolvable evidence pointer downgrades a claim
  -- rather than being quietly accepted).
  evidence_pointer TEXT        CHECK (evidence_pointer IS NULL OR char_length(evidence_pointer) BETWEEN 1 AND 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Lifecycle consistency, at the database ──────────────────────────────────────────────────
  -- Every predicate below is wrapped in `IS TRUE`. Roadmap/LEARNINGS.md (pod-report S3): a
  -- composite CHECK that evaluates to NULL is a SUGGESTION — PostgreSQL accepts the row. That bug
  -- shipped, survived four review rounds, and permitted exactly the row the constraint appeared to
  -- forbid. `IS TRUE` collapses NULL to false, which is the only reading anyone ever intends.
  CONSTRAINT tasks_terminal_has_timestamp CHECK (
    (CASE
       WHEN status IN ('resolved', 'dismissed') THEN resolved_at IS NOT NULL
       ELSE resolved_at IS NULL
     END) IS TRUE
  ),
  -- A resolution code belongs to a resolved task and to nothing else — both directions, so a
  -- dismissed task cannot carry 'fixed' and a resolved one cannot carry nothing.
  CONSTRAINT tasks_resolution_matches_status CHECK (
    ((status = 'resolved') = (resolution IS NOT NULL)) IS TRUE
  ),
  -- Both claim columns are welded to the status, in BOTH directions. The first version constrained
  -- only `claimed_at`, which left `claimed_by` free to carry an agent name on an open or resolved
  -- task (cross-review, Codex round 2). That is ambiguous state the write path in Story 3.2 would
  -- have had to interpret — and "who holds this task?" answered from a column the schema permits on
  -- an unclaimed row is exactly the kind of question that gets answered wrongly at 2am.
  CONSTRAINT tasks_claimed_has_timestamp CHECK (
    ((status = 'claimed') = (claimed_at IS NOT NULL)) IS TRUE
  ),
  -- claimed_by travels with claimed_at, so the pair is always both-set or both-null. A resolved task
  -- therefore records no claimant; if that history is ever wanted it belongs in the audit trail,
  -- which is append-only, rather than in a mutable column on the task itself.
  CONSTRAINT tasks_claimed_by_matches_claimed_at CHECK (
    ((claimed_by IS NOT NULL) = (claimed_at IS NOT NULL)) IS TRUE
  )
);

-- ── The dedupe rule, made unrepresentable ─────────────────────────────────────────────────────
-- At most ONE non-terminal task per signal. A new matching signal occurrence therefore has nowhere
-- to create a second task and must absorb into the existing one. Doing this in application code
-- would be SELECT-then-INSERT — a check-then-act race that two concurrent promotions win together.
-- Resolved and dismissed rows are excluded, so a problem that comes back gets a fresh task with its
-- own history rather than reopening one whose resolution was already claimed.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_one_active_per_signal
  ON tasks(signal_id) WHERE status IN ('open', 'claimed');

CREATE INDEX IF NOT EXISTS tasks_project_queue_idx
  ON tasks(project_id, status, impact_rank DESC);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ══ friction_rules ════════════════════════════════════════════════════════════════════════════
-- Per-project detector overrides. A project with NO rows evaluates against the defaults in
-- lib/friction-rules.ts, so friction works out of the box and tuning is opt-in.
--
-- The acceptance criterion is "changing a threshold (data, not code) changes the output" — this
-- table is what makes that true, and it is the same principle as projects.monthly_event_quota:
-- raising a customer's ceiling is an UPDATE, never a deploy (AGENTS.md).

CREATE TABLE IF NOT EXISTS friction_rules (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  kind       TEXT        NOT NULL CHECK (kind IN ('adoption_drop_off', 'dead_end', 'abandoned_adoption')),
  threshold  NUMERIC     NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  -- The smallest denominator worth an opinion, and the single most important guard against the
  -- epic's named risk: one targeted user who didn't adopt is a 0% adoption rate and a screaming
  -- red signal. A rule with no floor is a rule that destroys trust in the whole queue.
  min_sample INTEGER     NOT NULL CHECK (min_sample >= 1),
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

ALTER TABLE friction_rules ENABLE ROW LEVEL SECURITY;

-- ══ The lazy-evaluation claim stamp ═══════════════════════════════════════════════════════════
-- signals-loop Amendment 3 (epic README, Daniel 2026-07-26): friction detectors run inside the
-- already-tenant-scoped read paths for ONE resolved project_id — not from a cron.
--
-- The alternative was a `projects_with_friction_due()` scheduler like the delivery dispatcher, and
-- that would have required a NEW ROW in AGENTS.md's cross-tenant scheduler-exemption registry —
-- which that file says must be a deliberate, recorded decision by Daniel and never an inference by
-- analogy from an existing row. We declined the exemption instead of taking it.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS friction_evaluated_at TIMESTAMPTZ;

-- ══ record_signal ═════════════════════════════════════════════════════════════════════════════
-- Group one occurrence into its signal, atomically, and report the resulting state.

CREATE OR REPLACE FUNCTION record_signal(
  p_project_id  UUID,
  p_kind        TEXT,
  p_fingerprint TEXT,
  p_title       TEXT,
  p_feature_id  TEXT,
  p_user_id     TEXT,
  p_sample      JSONB,
  p_occurred_at TIMESTAMPTZ
)
RETURNS TABLE (signal_id UUID, event_count BIGINT, users_affected INTEGER, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id      UUID;
  v_new     BOOLEAN;
  v_at      TIMESTAMPTZ;
  v_users   INTEGER;
BEGIN
  -- Never trust a caller-supplied timestamp to be in the future. A client clock running fast would
  -- otherwise pin last_seen_at ahead of now() and park the signal at the top of every ranked queue
  -- permanently — lib/signal-rank.ts clamps the same thing on the read side, and a bound enforced
  -- at only one of the two layers is a bound one refactor away from being absent.
  v_at := LEAST(COALESCE(p_occurred_at, now()), now());

  INSERT INTO signals AS s (
    project_id, kind, fingerprint, title, feature_id,
    first_seen_at, last_seen_at, event_count, sample
  )
  VALUES (
    p_project_id, p_kind, p_fingerprint, p_title, NULLIF(p_feature_id, ''),
    v_at, v_at, 1, COALESCE(p_sample, '{}'::JSONB)
  )
  ON CONFLICT (project_id, fingerprint) DO UPDATE
    SET event_count  = s.event_count + 1,
        -- GREATEST/LEAST rather than assignment: occurrences can arrive out of order (a batched or
        -- offline client flushing a queue), and a late-arriving OLD event must not rewind
        -- last_seen_at or the whole recency half of the impact rank starts lying.
        last_seen_at = GREATEST(s.last_seen_at, EXCLUDED.last_seen_at),
        first_seen_at = LEAST(s.first_seen_at, EXCLUDED.first_seen_at),
        -- Latest sample wins. Deliberate: the evidence bundle wants the most recent reproduction,
        -- and the row is already bounded, so accumulating samples would grow without a ceiling.
        sample       = EXCLUDED.sample,
        title        = EXCLUDED.title
  -- `xmax = 0` is true only for a freshly INSERTed row, which is how an upsert reports which branch
  -- it took. Used to fire the first-task Telegram line exactly once (Story 2.1).
  RETURNING s.id, (s.xmax = 0) INTO v_id, v_new;

  -- Exact distinct-user accounting. The INSERT is the test: if it created a row this user is new to
  -- this signal, and only then does the counter move. `GET DIAGNOSTICS` reads what the statement
  -- actually did rather than re-querying, so there is no window between deciding and counting.
  IF p_user_id IS NOT NULL AND p_user_id <> '' THEN
    INSERT INTO signal_users (signal_id, user_id)
    VALUES (v_id, p_user_id)
    -- ON CONSTRAINT, not a column list. `RETURNS TABLE (signal_id …)` above declares an OUT
    -- PARAMETER called `signal_id`, and a bare `ON CONFLICT (signal_id, user_id)` conflict target
    -- cannot be table-qualified — so plpgsql resolves the name against the parameter and aborts the
    -- whole function with "column reference signal_id is ambiguous". Every call. Naming the
    -- constraint sidesteps the resolution entirely.
    --
    -- This was not caught by reading the file; it was caught by executing it against a real
    -- database (Roadmap/LEARNINGS.md — static review and real execution are complementary, and the
    -- bug class that only execution finds is real).
    ON CONFLICT ON CONSTRAINT signal_users_pkey DO NOTHING;

    GET DIAGNOSTICS v_users = ROW_COUNT;
    IF v_users > 0 THEN
      -- `= users_affected + 1`, evaluated by the database under the row lock the UPDATE takes.
      -- Reading the value into plpgsql and writing it back would be the lost-update race this
      -- entire file is arranged to avoid.
      UPDATE signals SET users_affected = signals.users_affected + 1 WHERE id = v_id;
    END IF;
  END IF;

  RETURN QUERY
    SELECT s2.id, s2.event_count, s2.users_affected, v_new
    FROM signals s2
    WHERE s2.id = v_id;
END;
$$;

-- Roadmap/LEARNINGS.md: DROP+CREATE (which CREATE OR REPLACE becomes on a signature change)
-- silently restores Postgres' PUBLIC EXECUTE default. Re-REVOKE every time, unconditionally.
REVOKE ALL ON FUNCTION record_signal(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_signal(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  TO service_role;

-- ══ claim_friction_evaluation ═════════════════════════════════════════════════════════════════
-- Returns TRUE to exactly one caller per throttle window, per project.

CREATE OR REPLACE FUNCTION claim_friction_evaluation(
  p_project_id       UUID,
  p_throttle_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
BEGIN
  -- ── Why a conditional UPDATE and NOT an advisory lock ───────────────────────────────────────
  -- The obvious shape is pg_try_advisory_xact_lock. It would be WRONG here, and subtly: a
  -- transaction-scoped advisory lock is released when this function returns, which is BEFORE the
  -- application code that then runs the detectors. Every concurrent reader would acquire it in
  -- turn and every one of them would do the work — a lock that reads as protection and provides
  -- none.
  --
  -- A single conditional UPDATE has no such window. Exactly one concurrent caller can match the
  -- predicate and move the stamp; the losers see 0 rows because the winner's committed write moved
  -- friction_evaluated_at out of their WHERE clause. The stamp is taken BEFORE the work rather than
  -- after, so a caller that crashes mid-evaluation costs one stale window — the correct trade
  -- against the alternative, where a crash leaves the claim open and every subsequent reader piles
  -- onto the same work.
  UPDATE projects
     SET friction_evaluated_at = now()
   WHERE id = p_project_id
     AND (
       friction_evaluated_at IS NULL
       OR friction_evaluated_at < now() - make_interval(secs => GREATEST(p_throttle_seconds, 0))
     );

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed;
END;
$$;

REVOKE ALL ON FUNCTION claim_friction_evaluation(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_friction_evaluation(UUID, INTEGER) TO service_role;

-- ══ Grants ════════════════════════════════════════════════════════════════════════════════════
-- On Supabase a new public-schema table arrives with service_role already granted ALL, so the
-- REVOKEs below are what make the "nothing is deleted" claim true. A narrower GRANT alone would be
-- purely additive and the claim would be a comment asserting a property the schema does not have —
-- which Roadmap/LEARNINGS.md rates as worse than no comment, because a reviewer who sees a stated
-- rationale spends their scrutiny elsewhere.

REVOKE ALL ON TABLE signals, signal_users, tasks, friction_rules FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE signals      TO service_role;
GRANT SELECT, INSERT         ON TABLE signal_users TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE tasks        TO service_role;
-- friction_rules is CONFIGURATION, not evidence: removing an override to fall back to the defaults
-- is a legitimate operation, so DELETE stays. Signals and tasks are what a resolution claim rests
-- on, so for those it does not.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE friction_rules TO service_role;

REVOKE DELETE, TRUNCATE ON TABLE signals, signal_users, tasks FROM service_role;

COMMENT ON TABLE signals IS
  'Deterministically grouped error/friction signals, one row per distinct problem per project. '
  'Fingerprints are computed server-side (lib/signal-fingerprint.ts) and never read from a payload. '
  'signals-loop Sprint 1, Story 1.0.';
COMMENT ON TABLE tasks IS
  'Signals promoted past a threshold, carrying the evidence bundle an agent acts on. At most one '
  'non-terminal task per signal, enforced by the tasks_one_active_per_signal partial unique index. '
  'signals-loop Sprint 1, Story 1.0.';
COMMENT ON COLUMN projects.friction_evaluated_at IS
  'Lazy friction-evaluation throttle stamp (signals-loop Amendment 3). Claimed by '
  'claim_friction_evaluation(); deliberately NOT driven by a cron, so no cross-tenant '
  'scheduler-exemption registry row is needed.';
