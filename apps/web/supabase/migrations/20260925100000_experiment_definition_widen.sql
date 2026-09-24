-- experiments-for-humans · Sprint 1, Story 1.2 (epic README D1) — widen the experiment definition.
--
-- EXPAND-only: CREATE OR REPLACE of ONE validation function and nothing else. The function backs two
-- CHECK constraints (experiment_definition_versions.definition and
-- experiment_decision_records.definition_snapshot), so both widen together. The new domain is a strict
-- superset of the old one — every stored row stays valid (verified live after apply: 6 versions and 3
-- decision snapshots on 2026-09-24, zero invalid).
--   · variants[].label — optional, 1-40 code points, no Cc character, no edge whitespace, distinct.
--   · eligibility.tags.<field> — a scalar, or a list of 1-20 typed-distinct scalars (one-of).
-- lib/experiment-definition.ts parseExperimentDefinition accepts exactly this domain; the parity spec
-- (e2e/experiment-definition-widen.spec.ts) feeds the same fixtures to both.
-- NUL is excluded from the Cc range below because jsonb text cannot hold U+0000 at all.

CREATE OR REPLACE FUNCTION private.experiment_definition_is_valid(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_variant JSONB;
  v_metric JSONB;
  v_tag RECORD;
  v_value JSONB;
  v_label TEXT;
  v_segment JSONB;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF octet_length(p_definition::TEXT) > 32768 THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition) AS k
    WHERE k NOT IN (
      'hypothesis', 'assignmentEntityType', 'eligibility', 'variants', 'controlVariantKey',
      'primaryMetric', 'guardrailMetrics', 'segmentFields', 'plannedWindow',
      'minimumSamplePerVariant'
    )
  ) THEN RETURN false; END IF;
  IF NOT (p_definition ?& ARRAY[
    'hypothesis', 'assignmentEntityType', 'eligibility', 'variants', 'controlVariantKey',
    'primaryMetric', 'guardrailMetrics', 'segmentFields', 'plannedWindow',
    'minimumSamplePerVariant'
  ]) THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'hypothesis') IS DISTINCT FROM 'string'
     OR char_length(p_definition->>'hypothesis') NOT BETWEEN 1 AND 500
     OR btrim(
       p_definition->>'hypothesis',
       U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
     ) = '' THEN RETURN false; END IF;
  IF jsonb_typeof(p_definition->'assignmentEntityType') IS DISTINCT FROM 'string'
     OR (p_definition->>'assignmentEntityType') !~ '^[a-z][a-z0-9_]{0,63}$' THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'eligibility') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'eligibility') AS k
    WHERE k NOT IN ('description', 'tags')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'eligibility') ? 'description')
     OR jsonb_typeof(p_definition#>'{eligibility,description}') IS DISTINCT FROM 'string'
     OR char_length(p_definition#>>'{eligibility,description}') NOT BETWEEN 1 AND 500
     OR btrim(
       p_definition#>>'{eligibility,description}',
       U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
     ) = '' THEN RETURN false; END IF;
  IF (p_definition->'eligibility') ? 'tags' THEN
    IF jsonb_typeof(p_definition#>'{eligibility,tags}') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT COUNT(*) FROM jsonb_object_keys(p_definition#>'{eligibility,tags}')) > 5 THEN RETURN false; END IF;
    FOR v_tag IN SELECT key, value FROM jsonb_each(p_definition#>'{eligibility,tags}') LOOP
      IF v_tag.key NOT IN ('source', 'channel', 'campaign', 'plan', 'region') THEN RETURN false; END IF;
      -- experiments-for-humans D1: a predicate is ONE scalar (exact match) or a LIST of 1-20
      -- typed-distinct scalars (one-of). Every element obeys the scalar bounds below, unchanged.
      IF jsonb_typeof(v_tag.value) = 'array' THEN
        IF jsonb_array_length(v_tag.value) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
        -- jsonb equality is typed ("1" <> 1), which is exactly sameScalar's rule in the parser.
        IF (SELECT COUNT(*) FROM jsonb_array_elements(v_tag.value))
           <> (SELECT COUNT(DISTINCT element) FROM jsonb_array_elements(v_tag.value) AS element)
           THEN RETURN false; END IF;
      END IF;
      FOR v_value IN
        SELECT CASE WHEN jsonb_typeof(v_tag.value) = 'array' THEN element ELSE v_tag.value END
        FROM (
          SELECT element FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_tag.value) = 'array' THEN v_tag.value ELSE '[null]'::JSONB END
          ) AS element
        ) elements
      LOOP
        IF jsonb_typeof(v_value) NOT IN ('string', 'number', 'boolean') THEN RETURN false; END IF;
        IF jsonb_typeof(v_value) = 'string'
           AND char_length(v_value #>> '{}') > 64 THEN RETURN false; END IF;
        IF jsonb_typeof(v_value) = 'number'
           AND (
             (v_value #>> '{}')::NUMERIC <> trunc((v_value #>> '{}')::NUMERIC)
             OR abs((v_value #>> '{}')::NUMERIC) > 1000000000000000
           ) THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_definition->'variants') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'variants') NOT BETWEEN 2 AND 10 THEN RETURN false; END IF;
  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_definition->'variants') LOOP
    IF jsonb_typeof(v_variant) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_variant) AS k WHERE k NOT IN ('key', 'weight', 'label')
    ) THEN RETURN false; END IF;
    -- experiments-for-humans D1: an optional human name for the version. The control-character
    -- class is written as explicit ranges (exactly Unicode Cc) rather than [[:cntrl:]], whose answer
    -- for U+0080-U+009F depends on the server's locale; the parser uses /\p{Cc}/u.
    IF v_variant ? 'label' THEN
      IF jsonb_typeof(v_variant->'label') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      v_label := v_variant->>'label';
      IF char_length(v_label) NOT BETWEEN 1 AND 40
         OR v_label ~ '[\x01-\x1F\x7F-\x9F]'
         OR v_label <> btrim(v_label, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
         THEN RETURN false; END IF;
    END IF;
    IF NOT (v_variant ?& ARRAY['key', 'weight'])
       OR jsonb_typeof(v_variant->'key') IS DISTINCT FROM 'string'
       OR (v_variant->>'key') !~ '^[a-z][a-z0-9_-]{0,63}$'
       OR jsonb_typeof(v_variant->'weight') IS DISTINCT FROM 'number'
       OR (v_variant->>'weight') !~ '^[0-9]+$'
       OR (v_variant->>'weight')::NUMERIC NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT value->>'key' FROM jsonb_array_elements(p_definition->'variants')
      GROUP BY value->>'key' HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;
  IF (
    SELECT COUNT(*) FROM (
      SELECT value->>'label' FROM jsonb_array_elements(p_definition->'variants')
      WHERE value ? 'label'
      GROUP BY value->>'label' HAVING COUNT(*) > 1
    ) duplicate_labels
  ) > 0 THEN RETURN false; END IF;
  IF jsonb_typeof(p_definition->'controlVariantKey') IS DISTINCT FROM 'string'
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_definition->'variants') AS variant
       WHERE variant->>'key' = p_definition->>'controlVariantKey'
     ) THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'primaryMetric') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'primaryMetric') AS k
    WHERE k NOT IN ('event', 'direction')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'primaryMetric') ?& ARRAY['event', 'direction'])
     OR jsonb_typeof(p_definition#>'{primaryMetric,event}') IS DISTINCT FROM 'string'
     OR char_length(p_definition#>>'{primaryMetric,event}') NOT BETWEEN 1 AND 128
     OR p_definition#>>'{primaryMetric,event}' <> btrim(
       p_definition#>>'{primaryMetric,event}',
       U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
     )
     OR (p_definition#>>'{primaryMetric,event}') ~ '[[:cntrl:]]'
     OR jsonb_typeof(p_definition#>'{primaryMetric,direction}') IS DISTINCT FROM 'string'
     OR p_definition#>>'{primaryMetric,direction}' NOT IN ('increase', 'decrease') THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'guardrailMetrics') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'guardrailMetrics') > 10 THEN RETURN false; END IF;
  FOR v_metric IN SELECT value FROM jsonb_array_elements(p_definition->'guardrailMetrics') LOOP
    IF jsonb_typeof(v_metric) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_metric) AS k WHERE k NOT IN ('event', 'direction')
    ) THEN RETURN false; END IF;
    IF NOT (v_metric ?& ARRAY['event', 'direction'])
       OR jsonb_typeof(v_metric->'event') IS DISTINCT FROM 'string'
       OR char_length(v_metric->>'event') NOT BETWEEN 1 AND 128
       OR v_metric->>'event' <> btrim(
         v_metric->>'event',
         U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
       )
       OR (v_metric->>'event') ~ '[[:cntrl:]]'
       OR jsonb_typeof(v_metric->'direction') IS DISTINCT FROM 'string'
       OR v_metric->>'direction' NOT IN ('increase', 'decrease') THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT metric_event FROM (
        SELECT p_definition#>>'{primaryMetric,event}' AS metric_event
        UNION ALL
        SELECT value->>'event' FROM jsonb_array_elements(p_definition->'guardrailMetrics')
      ) all_metrics
      GROUP BY metric_event HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'segmentFields') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_definition->'segmentFields') > 5 THEN RETURN false; END IF;
  FOR v_segment IN SELECT value FROM jsonb_array_elements(p_definition->'segmentFields') LOOP
    IF jsonb_typeof(v_segment) IS DISTINCT FROM 'string'
       OR (v_segment #>> '{}') NOT IN ('source', 'channel', 'campaign', 'plan', 'region')
       THEN RETURN false; END IF;
  END LOOP;
  IF (
    SELECT COUNT(*) FROM (
      SELECT value FROM jsonb_array_elements(p_definition->'segmentFields')
      GROUP BY value HAVING COUNT(*) > 1
    ) duplicates
  ) > 0 THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'plannedWindow') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_definition->'plannedWindow') AS k
    WHERE k NOT IN ('startAt', 'endAt')
  ) THEN RETURN false; END IF;
  IF NOT ((p_definition->'plannedWindow') ?& ARRAY['startAt', 'endAt'])
     OR jsonb_typeof(p_definition#>'{plannedWindow,startAt}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_definition#>'{plannedWindow,endAt}') IS DISTINCT FROM 'string'
     OR p_definition#>>'{plannedWindow,startAt}' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR p_definition#>>'{plannedWindow,endAt}' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     THEN RETURN false; END IF;
  v_start := (p_definition#>>'{plannedWindow,startAt}')::TIMESTAMPTZ;
  v_end := (p_definition#>>'{plannedWindow,endAt}')::TIMESTAMPTZ;
  IF v_start >= v_end THEN RETURN false; END IF;

  IF jsonb_typeof(p_definition->'minimumSamplePerVariant') IS DISTINCT FROM 'number'
     OR (p_definition->>'minimumSamplePerVariant') !~ '^[0-9]+$'
     OR (p_definition->>'minimumSamplePerVariant')::NUMERIC NOT BETWEEN 1 AND 1000000
     THEN RETURN false; END IF;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- CREATE OR REPLACE keeps the function's ACL, but the REVOKE is re-stated rather than assumed
-- (LEARNINGS: DROP + CREATE silently restores PUBLIC EXECUTE; a reader should not have to know which
-- of the two this file did).
REVOKE ALL ON FUNCTION private.experiment_definition_is_valid(JSONB)
  FROM PUBLIC, anon, authenticated;
