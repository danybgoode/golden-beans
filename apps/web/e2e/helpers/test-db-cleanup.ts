import { Client } from 'pg'

export function requireTestDatabaseUrl(): string {
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL must be set for database-backed specs (export DB_URL from `supabase status -o env`)',
    )
  }
  return url
}

/**
 * Test-only fixture cleanup through the local migration-owner connection. The application
 * service_role intentionally cannot delete projects or append-only journey audit evidence.
 */
export async function cleanupJourneyProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return
  const client = new Client({ connectionString: requireTestDatabaseUrl() })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'DELETE FROM public.journey_definition_audit WHERE project_id = ANY($1::uuid[])',
      [projectIds],
    )
    await client.query('DELETE FROM public.projects WHERE id = ANY($1::uuid[])', [projectIds])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}
