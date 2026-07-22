-- event-destination-router · Sprint 2, Story 2.1 — destination lifecycle + signed webhook.
--
-- EXPAND-only on the minimal event_destinations table Story 1.2 created. Every column added is
-- nullable OR has a default, so this is safe to apply before the code that reads it. Story 1.2 built
-- the table with just enough to be an outbox fan-out target (id/project_id/name/enabled/
-- event_filter); this makes it a real, configurable, SIGNED destination.

-- ── the webhook target + its signing secret ───────────────────────────────────────────────────
--   target_url:      where an eligible event is POSTed. HTTPS-only in the app (lib/destinations.ts);
--                    a CHECK enforces the shape at the DB for any other writer. NULL until a tenant
--                    configures it — a destination with no URL is dark regardless of `enabled`.
--   signing_secret:  the HMAC-SHA256 secret we sign each delivery with AND the receiver verifies
--                    with — a SHARED secret, so unlike an API key (where we store only a hash to
--                    verify INBOUND) we must retain the actual value to sign OUTBOUND. It is shown to
--                    the tenant EXACTLY ONCE at create/rotate and never returned by any read path
--                    (lib/destinations.ts selects it only on the internal send path, never in a
--                    management query). Stored plaintext behind RLS (service-role-only, no policies)
--                    — the same trust boundary every secret in this DB sits behind today; encryption
--                    at rest via pgcrypto is a v2 enhancement that needs an env-provided key (a named
--                    prod secret), deliberately not introduced here.
--   secret_set_at:   when the current secret was minted — lets the UI show "rotated 3 days ago"
--                    without ever exposing the value, and gives rotation an audit anchor.
ALTER TABLE event_destinations
  ADD COLUMN IF NOT EXISTS target_url     TEXT,
  ADD COLUMN IF NOT EXISTS signing_secret TEXT,
  ADD COLUMN IF NOT EXISTS secret_set_at  TIMESTAMPTZ;

-- HTTPS-only, bounded length. A webhook target that is plain http would ship signed tenant events in
-- cleartext; the signature proves origin but does nothing for confidentiality. localhost is allowed
-- ONLY over http for the test/dev receiver (the specs' disposable sink) — a real target must be
-- https. Enforced here so a seed/backfill can't smuggle an http target past the app validation.
ALTER TABLE event_destinations
  ADD CONSTRAINT event_destinations_target_url_shape CHECK (
    target_url IS NULL
    OR (
      char_length(target_url) BETWEEN 1 AND 2048
      AND (
        target_url ~ '^https://'
        OR target_url ~ '^http://localhost(:[0-9]+)?(/|$)'
        OR target_url ~ '^http://127\.0\.0\.1(:[0-9]+)?(/|$)'
      )
    )
  ),
  -- The signing secret is opaque and bounded; a delivery cannot be attempted without one, so the two
  -- webhook fields travel together — a destination is "deliverable" only when BOTH url and secret are
  -- set. The app enforces set-both-at-once; this bounds the secret's length for any other writer.
  ADD CONSTRAINT event_destinations_signing_secret_shape CHECK (
    signing_secret IS NULL OR char_length(signing_secret) BETWEEN 16 AND 128
  ),
  -- secret_set_at is present exactly when the secret is.
  ADD CONSTRAINT event_destinations_secret_paired CHECK (
    (signing_secret IS NULL) = (secret_set_at IS NULL)
  ),
  -- ENABLED ⟹ DELIVERABLE (cross-review, Codex round 8). Without this, a destination could be
  -- `enabled` with no url/secret: ingest_event's fan-out queues for any ENABLED destination, but the
  -- dispatcher only CLAIMS deliverable (url+secret) rows — so those queued deliveries would pile up
  -- pending forever with no UI path to add a url, an undrainable backlog. Making enabled⟹deliverable
  -- a DB invariant means the fan-out's `enabled` check and the claim's `enabled AND url AND secret`
  -- check can never disagree. (Prod has zero destination rows, and createDestination always sets
  -- url+secret before a row can be enabled, so nothing existing violates this.)
  ADD CONSTRAINT event_destinations_enabled_requires_target CHECK (
    NOT enabled OR (target_url IS NOT NULL AND signing_secret IS NOT NULL)
  );

COMMENT ON COLUMN event_destinations.signing_secret IS
  'Shared HMAC-SHA256 secret. Retained (not hashed) because we must SIGN outbound with it. Shown to the tenant once at create/rotate; never returned by a management/read path — only the internal send path selects it. Plaintext behind RLS; encrypt-at-rest is a v2 enhancement needing an env key.';
COMMENT ON COLUMN event_destinations.target_url IS
  'HTTPS webhook endpoint (http only for localhost/127.0.0.1 test receivers). NULL = dark regardless of enabled.';
