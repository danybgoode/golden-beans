import { expect, test } from '@playwright/test'
import {
  buildMiyagiFlagImport,
  MIYAGI_FLAG_CATALOG,
  type MiyagiPlatformFlagRow,
} from '@/lib/miyagi-flag-catalog'

function rows(): MiyagiPlatformFlagRow[] {
  return MIYAGI_FLAG_CATALOG.map((entry) => ({
    key: entry.key,
    enabled: entry.compileDefault,
    polarity: entry.key.endsWith('_enabled') ? 'enablement' : 'killswitch',
    description: `Miyagi ${entry.key}`,
  }))
}

test('Miyagi catalog contains the complete 40-key inventory with exactly 12 backend enforcement keys', () => {
  expect(MIYAGI_FLAG_CATALOG).toHaveLength(40)
  expect(MIYAGI_FLAG_CATALOG.filter((entry) => entry.enforcement === 'both')).toHaveLength(12)
  expect(new Set(MIYAGI_FLAG_CATALOG.map((entry) => entry.key)).size).toBe(40)
})

test('Miyagi import is complete, typed, and preserves current effective values', () => {
  const result = buildMiyagiFlagImport(rows())
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.entries).toHaveLength(40)
  expect(
    result.entries.every(
      (entry) => entry.definition.defaultVariantKey === (entry.effectiveValue ? 'on' : 'off')
    )
  ).toBe(true)
  expect(result.entries.every((entry) => entry.definition.valueType === 'boolean')).toBe(true)
})

test('Miyagi import rejects an incomplete, duplicate, or unknown source export', () => {
  expect(buildMiyagiFlagImport(rows().slice(1)).ok).toBe(false)
  expect(buildMiyagiFlagImport([...rows(), rows()[0]]).ok).toBe(false)
  expect(
    buildMiyagiFlagImport([
      ...rows(),
      { key: 'unknown.flag', enabled: true, polarity: 'enablement', description: 'x' },
    ]).ok
  ).toBe(false)
})

test('Miyagi import gives a deterministic description to a legacy null source row', () => {
  const input = rows()
  const telemetry = input.find((row) => row.key === 'growth.telemetry_enabled')!
  telemetry.description = null
  const result = buildMiyagiFlagImport(input)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.entries.find((entry) => entry.key === telemetry.key)?.definition.description).toBe(
    'Miyagi platform flag: growth.telemetry_enabled.'
  )
})

test('Miyagi import bounds an overlong live description to the shared SDK and database limit', () => {
  const input = rows()
  const portfolio = input.find((row) => row.key === 'promoter.partner_portfolio_enabled')!
  portfolio.description = `${'x'.repeat(499)}🇲🇽 extra`
  const result = buildMiyagiFlagImport(input)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const description = result.entries.find((entry) => entry.key === portfolio.key)?.definition.description
  expect(Array.from(description ?? '')).toHaveLength(500)
  expect(description?.endsWith('…')).toBe(true)
})
