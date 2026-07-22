-- event-destination-router · hygiene — lock down the cap TRIGGER function's grants.
--
-- enforce_destination_cap() is a trigger function, so it is invoked by the trigger mechanism rather
-- than called directly: a direct `SELECT enforce_destination_cap()` raises "trigger functions can
-- only be called as triggers", and RLS already stops anon writing to event_destinations at all. So
-- the default PUBLIC EXECUTE it inherited is not exploitable.
--
-- It is revoked anyway, because "service-role only" should be true CONCLUSIVELY across every function
-- this epic added rather than true-except-one-that-happens-to-be-harmless. A reader auditing grants
-- should not have to reason about trigger-invocation semantics to satisfy themselves.
REVOKE ALL ON FUNCTION enforce_destination_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_destination_cap() TO service_role;
