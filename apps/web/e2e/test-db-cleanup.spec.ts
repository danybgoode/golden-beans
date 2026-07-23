import { expect, test } from '@playwright/test'
import { requireTestDatabaseUrl } from './helpers/test-db-cleanup'

test.describe('test database cleanup guard', () => {
  test('accepts only local Supabase loopback URLs on the configured database port', () => {
    for (const url of [
      'postgresql://postgres:local-secret@127.0.0.1:54322/postgres',
      'postgres://postgres:local-secret@localhost:54322/postgres',
      'postgresql://postgres:local-secret@[::1]:54322/postgres',
    ]) {
      expect(requireTestDatabaseUrl({ SUPABASE_DB_URL: url })).toBe(url)
    }
  })

  test('rejects remote, wrong-port, non-PostgreSQL and malformed URLs without exposing credentials', () => {
    for (const url of [
      'postgresql://postgres:do-not-print@db.example.test:54322/postgres',
      'postgresql://postgres:do-not-print@127.0.0.1:5432/postgres',
      'https://localhost:54322/postgres',
      'not-a-url',
      '',
    ]) {
      let message = ''
      try {
        requireTestDatabaseUrl({ SUPABASE_DB_URL: url })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).not.toBe('')
      expect(message).not.toContain('do-not-print')
    }
  })
})
