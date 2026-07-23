import { Client } from 'pg'

const LOCAL_SUPABASE_DB_PORT = '54322'
const LOCAL_SUPABASE_API_PORT = '54321'
const LOCAL_SUPABASE_DB_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function requireTestDatabaseUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  const url = environment.SUPABASE_DB_URL
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL must be set for database-backed specs (export DB_URL from `supabase status -o env`)',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('SUPABASE_DB_URL must be a valid local Supabase PostgreSQL URL')
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !LOCAL_SUPABASE_DB_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.port !== LOCAL_SUPABASE_DB_PORT ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    // node-postgres honors connection-string options such as `?host=...` and `?port=...`
    // after parsing the URI. Reject every option/fragment so an apparently local authority
    // cannot override the actual migration-owner destination.
    // Never echo the supplied connection string: it normally contains the database password.
    throw new Error(
      `SUPABASE_DB_URL must target local Supabase on loopback port ${LOCAL_SUPABASE_DB_PORT} without connection options`,
    )
  }

  return url
}

export function requireLocalSupabaseApiUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  const url = environment.SUPABASE_URL
  if (!url) {
    throw new Error('SUPABASE_URL must be set for database-backed specs')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('SUPABASE_URL must be a valid local Supabase API URL')
  }

  if (
    parsed.protocol !== 'http:' ||
    !LOCAL_SUPABASE_DB_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.port !== LOCAL_SUPABASE_API_PORT ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      `SUPABASE_URL must target the local Supabase API on loopback port ${LOCAL_SUPABASE_API_PORT}`,
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

/**
 * Project cleanup cascades through operational experiment rows while durable lifecycle evidence
 * deliberately survives. Remove the retained evidence only after proving the parent delete works.
 */
export async function cleanupExperimentProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return
  const client = new Client({ connectionString: requireTestDatabaseUrl() })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM public.projects WHERE id = ANY($1::uuid[])', [projectIds])
    await client.query(
      'DELETE FROM public.experiment_lifecycle_audit WHERE project_id = ANY($1::uuid[])',
      [projectIds],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}
