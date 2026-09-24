import { expect, test } from '@playwright/test'
import { Client as PgClient } from 'pg'
import { computeExperimentAnalysis, type ExperimentAnalysisFact } from '@/lib/experiment-analysis'
import { parseExperimentDefinition, type ExperimentDefinition } from '@/lib/experiment-definition'
import { requireTestDatabaseUrl } from './helpers/test-db-cleanup'

// experiments-for-humans · Story 1.2 (epic README D1) — the widened contract, held to ONE domain.
//
// Every fixture below goes to BOTH judges: `parseExperimentDefinition` and the database function
// `private.experiment_definition_is_valid`, which backs the CHECK on stored versions and on decision
// snapshots. The assertion is not "the parser accepts X" and "the DB accepts X" separately — it is
// that they AGREE, fixture by fixture, and that agreement is the expected answer. A parser wider than
// the DB turns a green form into a 500; a DB wider than the parser stores rows the app then renders
// as something it never validated.

const LEGACY: ExperimentDefinition = {
  hypothesis: 'A clearer founding-store promise increases completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: {
    description: 'Consented founding-store applicants in Mexico.',
    tags: { region: 'mx', plan: 'founding', campaign: 42 },
  },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'new-copy', weight: 3 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_abandoned', direction: 'decrease' }],
  segmentFields: ['source', 'channel', 'region'],
  plannedWindow: { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' },
  minimumSamplePerVariant: 100,
}

function withVariants(variants: unknown[]): unknown {
  return { ...LEGACY, variants }
}
function withTags(tags: unknown): unknown {
  return { ...LEGACY, eligibility: { description: 'Test population.', tags } }
}

const forty = 'N'.repeat(40)
const twentyValues = Array.from({ length: 20 }, (_, index) => `v${index}`)

// [name, definition, expected validity]
const FIXTURES: Array<[string, unknown, boolean]> = [
  ['legacy: no labels, scalar tags', LEGACY, true],
  [
    'label on every version',
    withVariants([
      { key: 'control', weight: 1, label: 'Current' },
      { key: 'new-copy', weight: 3, label: 'New copy' },
    ]),
    true,
  ],
  [
    'label on one version only',
    withVariants([
      { key: 'control', weight: 1 },
      { key: 'new-copy', weight: 3, label: 'New copy' },
    ]),
    true,
  ],
  [
    'label of exactly 40 code points (astral)',
    withVariants([
      { key: 'control', weight: 1, label: '𝐍'.repeat(40) },
      { key: 'new-copy', weight: 3 },
    ]),
    true,
  ],
  [
    'label of 40 characters',
    withVariants([
      { key: 'control', weight: 1, label: forty },
      { key: 'new-copy', weight: 3 },
    ]),
    true,
  ],
  [
    'label of 41 characters',
    withVariants([
      { key: 'control', weight: 1, label: `${forty}N` },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'empty label',
    withVariants([
      { key: 'control', weight: 1, label: '' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'blank label',
    withVariants([
      { key: 'control', weight: 1, label: '   ' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'leading space',
    withVariants([
      { key: 'control', weight: 1, label: ' Current' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'trailing no-break space',
    withVariants([
      { key: 'control', weight: 1, label: 'Current ' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'inner space is fine',
    withVariants([
      { key: 'control', weight: 1, label: 'Current copy' },
      { key: 'new-copy', weight: 3 },
    ]),
    true,
  ],
  [
    'U+007F in a label',
    withVariants([
      { key: 'control', weight: 1, label: 'Cur\u007frent' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'U+0085 (NEL, a C1 control) in a label',
    withVariants([
      { key: 'control', weight: 1, label: 'Cur\u0085rent' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'U+0009 in a label',
    withVariants([
      { key: 'control', weight: 1, label: 'Cur\trent' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'U+00A0 inside a label is not a control',
    withVariants([
      { key: 'control', weight: 1, label: 'Cur rent' },
      { key: 'new-copy', weight: 3 },
    ]),
    true,
  ],
  [
    'label that is a number',
    withVariants([
      { key: 'control', weight: 1, label: 7 },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  [
    'duplicate labels',
    withVariants([
      { key: 'control', weight: 1, label: 'Same' },
      { key: 'new-copy', weight: 3, label: 'Same' },
    ]),
    false,
  ],
  [
    'labels differing only in case are distinct',
    withVariants([
      { key: 'control', weight: 1, label: 'Same' },
      { key: 'new-copy', weight: 3, label: 'same' },
    ]),
    true,
  ],
  [
    'an unknown variant key is still refused',
    withVariants([
      { key: 'control', weight: 1, name: 'Current' },
      { key: 'new-copy', weight: 3 },
    ]),
    false,
  ],
  ['one-of list of two', withTags({ region: ['MX', 'CO'] }), true],
  ['one-of list of one', withTags({ region: ['MX'] }), true],
  ['list of exactly 20', withTags({ region: twentyValues }), true],
  ['list of 21', withTags({ region: [...twentyValues, 'v20'] }), false],
  ['empty list', withTags({ region: [] }), false],
  ['typed-distinct "1" and 1', withTags({ plan: ['1', 1] }), true],
  ['duplicate 1 and 1', withTags({ plan: [1, 1] }), false],
  ['duplicate strings', withTags({ plan: ['pro', 'pro'] }), false],
  ['mixed booleans', withTags({ plan: [true, false] }), true],
  ['nested list', withTags({ region: [['MX']] }), false],
  ['object in a list', withTags({ region: [{ code: 'MX' }] }), false],
  ['null in a list', withTags({ region: ['MX', null] }), false],
  ['a 65-character string in a list', withTags({ region: ['MX', 'x'.repeat(65)] }), false],
  ['a 64-character string in a list', withTags({ region: ['MX', 'x'.repeat(64)] }), true],
  ['a fraction in a list', withTags({ plan: [1, 1.5] }), false],
  ['an integer past the bound in a list', withTags({ plan: [1, 1_000_000_000_000_001] }), false],
  ['scalar and list predicates together', withTags({ region: ['MX', 'CO'], plan: 'pro' }), true],
  ['a list on a non-allow-listed field', withTags({ country: ['MX'] }), false],
]

test.describe('experiment definition widening (D1) — parser and database agree', () => {
  let db: PgClient
  test.beforeAll(async () => {
    db = new PgClient({ connectionString: requireTestDatabaseUrl() })
    await db.connect()
  })
  test.afterAll(async () => {
    await db.end()
  })

  for (const [name, definition, expected] of FIXTURES) {
    test(`${expected ? 'accepts' : 'rejects'}: ${name}`, async () => {
      const parsed = parseExperimentDefinition(definition)
      const { rows } = await db.query<{ valid: boolean }>(
        'select private.experiment_definition_is_valid($1::jsonb) as valid',
        [JSON.stringify(definition)]
      )
      expect({ parser: parsed.ok, database: rows[0].valid }).toEqual({ parser: expected, database: expected })
    })
  }

  // ⚠️ A SWEEP, not a sample (fresh reviewer, PR #167: the 37 fixtures above would not notice
  // U+3000 or U+FEFF dropped from the DB's whitespace set). Every BMP code point except the
  // surrogates and NUL, at a label's EDGE and in its MIDDLE, judged by both sides in one query each.
  // Two whitespace sets, two control-character spellings and two length measures have to agree on
  // ~130,000 inputs, so a drift in either file is a named code point, not a hunch.
  for (const position of ['edge', 'inner'] as const) {
    test(`every BMP code point at a label's ${position}: parser and database agree`, async () => {
      const labels: string[] = []
      for (let code = 1; code <= 0xffff; code += 1) {
        if (code >= 0xd800 && code <= 0xdfff) continue
        const char = String.fromCharCode(code)
        labels.push(position === 'edge' ? `${char}Current` : `Cur${char}rent`)
      }
      const base = withVariants([
        { key: 'control', weight: 1, label: 'placeholder' },
        { key: 'new-copy', weight: 3 },
      ])
      const { rows } = await db.query<{ valid: boolean }>(
        `select private.experiment_definition_is_valid(
           jsonb_set($1::jsonb, '{variants,0,label}', to_jsonb(label))
         ) as valid
         from unnest($2::text[]) with ordinality as l(label, n) order by n`,
        [JSON.stringify(base), labels]
      )
      const disagreements = labels.flatMap((label, index) => {
        const parser = parseExperimentDefinition({
          ...(base as ExperimentDefinition),
          variants: [
            { key: 'control', weight: 1, label },
            { key: 'new-copy', weight: 3 },
          ],
        }).ok
        return parser === rows[index].valid
          ? []
          : [
              `U+${label
                .codePointAt(position === 'edge' ? 0 : 3)!
                .toString(16)
                .toUpperCase()
                .padStart(4, '0')}`,
            ]
      })
      expect(disagreements).toEqual([])
    })
  }

  test('a legacy definition round-trips byte-identical through the parser and a jsonb cast', async () => {
    const parsed = parseExperimentDefinition(LEGACY)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(JSON.stringify(parsed.definition)).toBe(JSON.stringify(LEGACY))
    const { rows } = await db.query<{ back: unknown }>('select $1::jsonb as back', [
      JSON.stringify(parsed.definition),
    ])
    expect(rows[0].back).toEqual(LEGACY)
  })

  test('the parser keeps labels and lists exactly as given (no normalisation to hide a change)', () => {
    const input = withTags({ region: ['MX', 'CO'] }) as ExperimentDefinition
    const labelled = {
      ...input,
      variants: [
        { key: 'control', weight: 1, label: 'Current' },
        { key: 'new-copy', weight: 3 },
      ],
    }
    const parsed = parseExperimentDefinition(labelled)
    expect(parsed.ok && parsed.definition).toEqual(labelled)
  })

  test('the widened function is still not executable by anon or authenticated', async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'private.experiment_definition_is_valid(jsonb)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'private.experiment_definition_is_valid(jsonb)', 'EXECUTE') as authenticated`
    )
    expect(rows[0]).toEqual({ anon: false, authenticated: false })
  })
})

// ── tagsMatch through its only caller ─────────────────────────────────────────────────────────
// tagsMatch is private to the analysis module, so it is exercised through computeExperimentAnalysis
// with inputs whose result DIFFERS between the old scalar-only rule and the one-of rule.

const at = (second: number) =>
  `${new Date(Date.UTC(2026, 6, 1, 0, 0, second)).toISOString().slice(0, 19)}.000Z`

function oneOfDefinition(tags: ExperimentDefinition['eligibility']['tags']): ExperimentDefinition {
  return {
    ...LEGACY,
    eligibility: { description: 'Mexico or Colombia', tags },
    variants: [
      { key: 'control', weight: 1 },
      { key: 'treatment', weight: 1 },
    ],
    controlVariantKey: 'control',
    plannedWindow: { startAt: at(1), endAt: at(50) },
    minimumSamplePerVariant: 1,
  }
}

function exposure(subjectId: string, tags: Record<string, unknown>): ExperimentAnalysisFact {
  return {
    id: `exposure-${subjectId}`,
    event: 'experiment_exposed',
    featureId: 'one-of',
    tags: { variant: 'control', experiment_definition_version: 1, ...tags },
    subjectType: 'merchant',
    subjectId,
    occurredAt: at(2),
    createdAt: at(2),
  }
}

function eligibilityOutcome(
  tags: ExperimentDefinition['eligibility']['tags'],
  exposureTags: Record<string, unknown>
) {
  const result = computeExperimentAnalysis({
    experimentKey: 'one-of',
    definitionVersion: 1,
    definition: oneOfDefinition(tags),
    lifecycle: { status: 'running', startedAt: at(1), endedAt: null },
    asOf: at(60),
    facts: [exposure('m1', exposureTags)],
  })
  return {
    valid: result.diagnostics.validExposureSubjects,
    mismatched: result.diagnostics.integrity.find((row) => row.code === 'eligibility_mismatch')?.count ?? 0,
  }
}

test.describe('tagsMatch: a list is one-of (D1)', () => {
  test('a value in the list matches', () => {
    expect(eligibilityOutcome({ region: ['MX', 'CO'] }, { region: 'CO' })).toEqual({
      valid: 1,
      mismatched: 0,
    })
  })
  test('a value outside the list does not', () => {
    expect(eligibilityOutcome({ region: ['MX', 'CO'] }, { region: 'US' })).toEqual({
      valid: 0,
      mismatched: 1,
    })
  })
  test('a missing tag matches neither a list nor a scalar', () => {
    expect(eligibilityOutcome({ region: ['MX', 'CO'] }, {})).toEqual({ valid: 0, mismatched: 1 })
    expect(eligibilityOutcome({ region: 'MX' }, {})).toEqual({ valid: 0, mismatched: 1 })
  })
  test('the wrong type does not match: "1" is not 1', () => {
    expect(eligibilityOutcome({ plan: [1, 2] }, { plan: '1' })).toEqual({ valid: 0, mismatched: 1 })
    expect(eligibilityOutcome({ plan: [1, 2] }, { plan: 1 })).toEqual({ valid: 1, mismatched: 0 })
  })
  test('a scalar predicate is unchanged', () => {
    expect(eligibilityOutcome({ region: 'MX' }, { region: 'MX' })).toEqual({ valid: 1, mismatched: 0 })
    expect(eligibilityOutcome({ region: 'MX' }, { region: 'CO' })).toEqual({ valid: 0, mismatched: 1 })
  })
})
