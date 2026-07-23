import { expect, test } from '@playwright/test'
import { createGrowthEngineClient } from '@golden-beans/sdk'
import { computeExperimentAnalysis } from '@/lib/experiment-analysis'
import {
  buildTiendasFundadorasFixture,
  TIENDAS_FUNDADORAS_CONTRACT,
  TIENDAS_FUNDADORAS_DEFINITION,
} from './_fixtures/tiendas-fundadoras-experiment'

const PII_FIELD = /^(?:name|full_?name|email|phone|telephone|whatsapp|address|contact|contact_?form|form_?data|notes?)$/i
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const PHONE_VALUE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys)
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...objectKeys(nested)])
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(stringValues)
}

test('Tiendas Fundadoras fixtures preserve local assignment and canonical untagged outcomes', () => {
  let networkCalls = 0
  const sdk = createGrowthEngineClient({
    baseUrl: 'https://remote-assignment-must-not-exist.invalid',
    apiKey: 'unused-local-contract-key',
    userId: 'not-the-assignment-unit',
    fetchImpl: async () => {
      networkCalls += 1
      throw new Error('local bucket unexpectedly made a network request')
    },
  })
  const variants = TIENDAS_FUNDADORAS_DEFINITION.variants.map(({ key, weight }) => ({ key, weight }))

  for (const scenario of ['clean', 'skewed'] as const) {
    const fixture = buildTiendasFundadorasFixture(scenario)
    const exposures = fixture.facts.filter((fact) => fact.event === 'experiment_exposed')
    const applicationEvents = fixture.facts.filter((fact) => fact.event !== 'experiment_exposed')

    for (const fact of exposures) {
      const assignment = sdk.bucket(
        TIENDAS_FUNDADORAS_CONTRACT.experimentKey,
        variants,
        {
          definitionVersion: TIENDAS_FUNDADORAS_CONTRACT.definitionVersion,
          assignmentEntity: {
            type: TIENDAS_FUNDADORAS_CONTRACT.assignmentEntityType,
            id: fact.subjectId!,
          },
        },
      )
      expect(assignment).toEqual({ ok: true, variant: fact.tags?.variant })
    }
    expect(applicationEvents.length).toBeGreaterThan(0)
    expect(applicationEvents.every((fact) => fact.featureId === null && fact.tags === null)).toBe(true)
  }

  expect(networkCalls).toBe(0)
  expect(TIENDAS_FUNDADORAS_CONTRACT.runtimeBoundary).toMatchObject({
    gateOwner: 'miyagi',
    assignmentMode: 'local_sdk_bucket',
    remoteAssignmentEndpoint: null,
    goldenBeansMayReadOrMutateMiyagiFlag: false,
  })
})

test('clean allocation clears SRM while deliberate skew raises it and guardrails stay visible', () => {
  const clean = computeExperimentAnalysis(buildTiendasFundadorasFixture('clean'))
  expect(clean.diagnostics.srm).toMatchObject({ status: 'clear', chiSquare: 0, pValue: 1 })
  expect(clean.variants).toEqual([
    expect.objectContaining({ key: 'control', observedSubjects: 10, minimumSampleStatus: 'met' }),
    expect.objectContaining({ key: 'promise_first', observedSubjects: 10, minimumSampleStatus: 'met' }),
  ])
  expect(clean.blockers).not.toContain('srm_detected')
  expect(clean.guardrailMetrics).toEqual([
    expect.objectContaining({
      event: 'founding_application_abandoned',
      direction: 'decrease',
      variants: [
        expect.objectContaining({ key: 'control', exposedSubjects: 10, convertedSubjects: 2 }),
        expect.objectContaining({ key: 'promise_first', exposedSubjects: 10, convertedSubjects: 1 }),
      ],
    }),
  ])

  const skewed = computeExperimentAnalysis(buildTiendasFundadorasFixture('skewed'))
  expect(skewed.diagnostics.srm.status).toBe('detected')
  expect(skewed.diagnostics.srm.pValue).toBeLessThan(0.01)
  expect(skewed.variants).toEqual([
    expect.objectContaining({ key: 'control', observedSubjects: 1, minimumSampleStatus: 'below' }),
    expect.objectContaining({ key: 'promise_first', observedSubjects: 19, minimumSampleStatus: 'met' }),
  ])
  expect(skewed.blockers).toContain('srm_detected')
  expect(skewed.decisionReady).toBe(false)
  expect(skewed.guardrailMetrics[0]).toMatchObject({
    event: 'founding_application_abandoned',
    direction: 'decrease',
  })
})

test('the fixture and analysis result contain no contact/form PII or exposed subject identifiers', () => {
  for (const scenario of ['clean', 'skewed'] as const) {
    const fixture = buildTiendasFundadorasFixture(scenario)
    const result = computeExperimentAnalysis(fixture)
    const resultJson = JSON.stringify(result)

    expect(objectKeys(fixture).filter((key) => PII_FIELD.test(key))).toEqual([])
    for (const value of [...stringValues(fixture), ...stringValues(result)]) {
      expect(value).not.toMatch(EMAIL_VALUE)
      if (!/^tf-app-\d{4}$/.test(value) && !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        expect(value).not.toMatch(PHONE_VALUE)
      }
    }
    for (const subjectId of fixture.facts.map((fact) => fact.subjectId).filter(Boolean)) {
      expect(subjectId).toMatch(/^tf-app-\d{4}$/)
      expect(resultJson).not.toContain(subjectId)
    }
  }
})
