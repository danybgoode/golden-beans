import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES_PATH = join(__dirname, 'merchant-lifecycle.fixtures.json')

export type MerchantLifecycleFixture = {
  name: string
  expect: { kind: string; reason?: string; merchantId?: string }
  envelope: {
    id?: string
    type?: string
    occurredAt?: string
    data?: {
      tags?: Record<string, unknown>
      subject?: { type?: string; id?: string }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

type FixtureFile = {
  lifecycle: MerchantLifecycleFixture[]
  shaping: MerchantLifecycleFixture[]
}

const parsed = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as FixtureFile

export const lifecycleFixtures = parsed.lifecycle
export const shapingFixtures = parsed.shaping

export function fixturesDigest(): string {
  return createHash('sha256').update(readFileSync(FIXTURES_PATH)).digest('hex')
}
