import { expect, test } from '@playwright/test'
import { requireLocalSupabaseApiUrl, requireTestDatabaseUrl } from './helpers/test-db-cleanup'

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
      'postgresql://postgres:do-not-print@127.0.0.1:54322/postgres?host=db.example.test',
      'postgresql://postgres:do-not-print@127.0.0.1:54322/postgres?port=5432',
      'postgresql://postgres:do-not-print@127.0.0.1:54322/postgres?service=remote',
      'postgresql://postgres:do-not-print@127.0.0.1:54322/postgres#host=db.example.test',
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

  test('also refuses a mixed environment whose service-role API target is not local Supabase', () => {
    for (const url of [
      'http://127.0.0.1:54321',
      'http://localhost:54321/',
      'http://[::1]:54321',
    ]) {
      expect(requireLocalSupabaseApiUrl({ SUPABASE_URL: url })).toBe(url)
    }

    for (const url of [
      'https://project.supabase.co',
      'http://127.0.0.1:8000',
      'http://127.0.0.1:54321/?host=project.supabase.co',
      'http://user:do-not-print@127.0.0.1:54321/',
      'not-a-url',
      '',
    ]) {
      let message = ''
      try {
        requireLocalSupabaseApiUrl({ SUPABASE_URL: url })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).not.toBe('')
      expect(message).not.toContain('do-not-print')
    }
  })
})
