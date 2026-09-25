import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import { createBuilderIo } from '@/lib/experiment-builder-io'
import {
  saveExperimentDraftCommand,
  startExperimentCommand,
  type BuilderDependencies,
} from '@/lib/experiment-builder-command'
import type { ExperimentBuilderAnswers } from '@/lib/experiment-builder-plan'
import { readTenantRecord } from './helpers/authed-fixture'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

// experiments-for-humans · Story 4.1 (epic README D10) — the decision-first page, RENDERED, at the
// three points the readout exists to tell apart: waiting, gathering, ready.
//
// Production's two experiments are both decided, so this seeds its own project on local Supabase and
// makes the signed-in fixture user its owner. The experiment is made through the product's own write
// path (the builder commands the server actions call, gates injected — CI keeps the builder gate off),
// and the traffic is fixture rows carrying exactly the tags the SDK stamps on an exposure.
//
// ⚠️ An `authed` spec, not an `api` one, on purpose: the governed analysis read is `server-only`, so
// an api spec could only assert the pure readout — which `lib/experiment-readout.test.ts` already
// does. What this adds is that the PAGE says it: the answer line, the verdict and its actions.

const FLAG_KEY = 'growth.results_copy'
const SERVED: FlagDefinition = {
  valueType: 'boolean',
  description: 'Results fixture feature',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
}

type Fixture = { projectId: string; slug: string; owner: string }
const created: string[] = []

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function sql<T = unknown>(text: string, values: unknown[] = []): Promise<T[]> {
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    return (await pg.query(text, values)).rows as T[]
  } finally {
    await pg.end()
  }
}

async function project(client: SupabaseClient, owner: string): Promise<Fixture> {
  const slug = `results-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: `h-${crypto.randomUUID()}` })
    .select('id')
    .single()
  if (error || !data) throw new Error(`project fixture: ${error?.message}`)
  created.push(data.id as string)
  await client.from('project_members').insert({ project_id: data.id, user_id: owner, role: 'owner' })
  const { data: version, error: flagError } = await client.rpc('create_flag_definition_version', {
    p_project_id: data.id,
    p_flag_key: FLAG_KEY,
    p_definition: SERVED,
    p_reason: 'fixture',
    p_actor_user_id: owner,
  })
  if (flagError) throw new Error(`flag fixture: ${flagError.message}`)
  const activation = await client.rpc('set_flag_activation', {
    p_project_id: data.id,
    p_environment: 'production',
    p_flag_id: version[0].flag_id,
    p_version_id: version[0].version_id,
    p_expected_snapshot_version: 0,
    p_reason: 'fixture',
    p_actor_user_id: owner,
  })
  if (activation.error) throw new Error(`activation fixture: ${activation.error.message}`)
  // Traffic the catalog can plan from: 2,000 merchants seen, 500 signed up, in the last few hours.
  await sql(
    `insert into events (project_id, user_id, event, context_version, subject_type, subject_id, created_at)
     select $1::uuid, 'u' || n, 'page_viewed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
     from generate_series(1, 2000) n
     union all
     select $1::uuid, 'u' || n, 'signup_completed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
     from generate_series(1, 500) n`,
    [data.id]
  )
  return { projectId: data.id as string, slug, owner }
}

function deps(client: SupabaseClient, fx: Fixture): BuilderDependencies {
  return {
    builderEnabled: () => true,
    servingEnabled: () => true,
    requireOwnership: async () => ({ projectId: fx.projectId, userId: fx.owner }),
    io: createBuilderIo(client),
  }
}

const ANSWERS: ExperimentBuilderAnswers = {
  template: 'copy',
  flagKey: FLAG_KEY,
  why: 'funnel',
  direction: 'increase',
  metric: 'signup_completed',
  guardrails: [],
  breakdowns: [],
  mde: 30,
  who: { mode: 'everyone', conditions: [], allocation: 100 },
  entity: 'merchant',
  versions: ['Current', 'New copy'],
  split: 50,
  weeks: 8,
}

/** A started experiment, and what exposures for it must carry. */
async function started(client: SupabaseClient, fx: Fixture) {
  const saved = await saveExperimentDraftCommand(fx.slug, ANSWERS, null, deps(client, fx))
  if (!saved.ok) throw new Error(`save: ${saved.error}`)
  const start = await startExperimentCommand(fx.slug, saved.experimentKey, deps(client, fx))
  if (!start.ok || !start.serving) throw new Error(`start: ${JSON.stringify(start)}`)
  const [row] = await sql<{ definition: Record<string, unknown>; started_at: string; version: number }>(
    `select definition, started_at, version from experiment_definition_versions
     where project_id = $1 and status = 'running'`,
    [fx.projectId]
  )
  return { key: saved.experimentKey, ...row }
}

/**
 * `perArm` exposures per version, the first `converted[i]` of each converting — every row strictly
 * inside (window start, now), exposures before their own conversion.
 */
async function traffic(
  fx: Fixture,
  experiment: Awaited<ReturnType<typeof started>>,
  perArm: number,
  converted: [number, number]
) {
  const window = experiment.definition.plannedWindow as { startAt: string }
  const eligibility = experiment.definition.eligibility as { tags?: Record<string, string> }
  const tags = { ...(eligibility.tags ?? {}), experiment_definition_version: experiment.version }
  const from = new Date(Math.max(Date.parse(window.startAt), Date.parse(experiment.started_at)))
  await sql(
    `with arms(variant, converted) as (values ('off', $5::int), ('on', $6::int)),
          span as (select $3::timestamptz as t0, now() - interval '50 milliseconds' as t1)
     insert into events (project_id, user_id, event, context_version, subject_type, subject_id, feature_id, tags, created_at)
     select $1::uuid, arms.variant || '-' || n, e.event, 1, 'merchant', arms.variant || '-' || n,
            case when e.event = 'experiment_exposed' then $2 end,
            case when e.event = 'experiment_exposed' then $4::jsonb || jsonb_build_object('variant', arms.variant) else '{}'::jsonb end,
            span.t0 + (span.t1 - span.t0) * ((n::float + e.offset_) / ($7::int + 2))
     from arms, span, generate_series(1, $7::int) n,
          lateral (values ('experiment_exposed', 0.0), ('signup_completed', 0.5)) as e(event, offset_)
     where e.event = 'experiment_exposed' or n <= arms.converted`,
    [
      fx.projectId,
      experiment.key,
      from.toISOString(),
      JSON.stringify(tags),
      converted[0],
      converted[1],
      perArm,
    ]
  )
}

test.describe('the decision-first results page (Story 4.1)', () => {
  let client: SupabaseClient
  let owner: string
  test.beforeAll(() => {
    client = db()
    const tenant = readTenantRecord()
    if (!tenant?.userId) throw new Error('the authed fixture must record its user')
    owner = tenant.userId
  })
  test.afterAll(async () => {
    await cleanupExperimentProjects(created)
  })

  test('waiting → gathering → ready, each said in words, with the roll-out offered only when ready', async ({
    page,
  }) => {
    for (const [point, perArm, converted] of [
      ['waiting', 0, [0, 0]],
      ['gathering', 20, [5, 8]],
      ['ready', 0, [0, 0]],
    ] as const) {
      const fx = await project(client, owner)
      const experiment = await started(client, fx)
      const need = Number(experiment.definition.minimumSamplePerVariant)
      if (point === 'ready')
        await traffic(fx, experiment, need, [Math.round(need * 0.2), Math.round(need * 0.5)])
      else if (perArm > 0) await traffic(fx, experiment, perArm, [converted[0], converted[1]])

      const response = await page.goto(`/app/experiments/${fx.slug}/${experiment.key}?version=1`)
      expect(response?.status(), `${point}: the governed page renders`).toBe(200)
      const answer = page.locator('main .ds-answer')
      const verdict = page.locator('main .ds-x-verdict')
      // The approved block order: tabs, then the lift + verdict row, the KPIs, the two cards.
      await expect(page.locator('main .ds-x-ptabs')).toBeVisible()
      await expect(page.locator('main .ds-x-res-top')).toBeVisible()
      await expect(page.locator('main .ds-x-kpis')).toBeVisible()
      await expect(page.locator('main .ds-x-two')).toBeVisible()
      await expect(page.locator('main textarea')).toHaveCount(0)
      // The rendered look the sprint's gate asks for, at desktop and phone width (read by a person).
      for (const width of [1360, 360]) {
        await page.setViewportSize({ width, height: 900 })
        await page.screenshot({
          path: `test-results/experiment-results/${point}-${width}.png`,
          fullPage: true,
        })
      }
      await page.setViewportSize({ width: 1360, height: 900 })

      if (point === 'waiting') {
        await expect(answer).toContainText('It’s live. Results start tomorrow.')
        await expect(verdict).toContainText('Let it run. Nothing to decide yet.')
        await expect(verdict.getByRole('button', { name: 'Stop experiment' })).toBeVisible()
      } else if (point === 'gathering') {
        await expect(answer).toContainText('of the planned sample, so don’t call it yet.')
        await expect(verdict).toContainText('Keep it running')
        // Stop, then the page must stop saying "live" (fresh reviewer, #172): the next step is the decision.
        await verdict.getByRole('button', { name: 'Stop experiment' }).click()
        await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Stop', exact: true }).click()
        await expect(answer).toContainText('Stopped — nobody new is counted.')
        await expect(verdict).toContainText('Record the decision.')
        await expect(verdict.getByRole('button', { name: 'Record the decision' })).toBeVisible()
        await expect(page.locator('main .ds-page-head')).toContainText('Stopped')
      } else {
        await expect(answer).toContainText('so you can call it.')
        await expect(verdict).toContainText('New copy is winning. Roll it out?')
        await expect(
          verdict.getByRole('button', {
            name:
              process.env.EXPERIMENT_BUILDER_ENABLED === 'true'
                ? 'Roll out New copy to everyone'
                : 'Ship New copy',
          })
        ).toBeVisible()

        // Story 4.2 — decide in chips, then the roll-out as its own write. The modal has no free text.
        // With the builder gate off (CI's default — the roll-out's kill switch) no roll-out is drawn
        // at all: the verdict offers "Ship", and the modal records only (fresh reviewer, #172).
        const builder = process.env.EXPERIMENT_BUILDER_ENABLED === 'true'
        await verdict
          .getByRole('button', { name: builder ? 'Roll out New copy to everyone' : 'Ship New copy' })
          .click()
        const modal = page.locator('dialog.ds-x-decide')
        await expect(modal).toBeVisible()
        await expect(modal.locator('textarea, input')).toHaveCount(0)
        await expect(modal.getByRole('button', { name: 'Ship New copy' })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
        await expect(
          modal.getByRole('button', { name: 'The main number improved and guardrails held' })
        ).toHaveAttribute('aria-pressed', 'true')
        await expect(modal.getByText('Set New copy for everyone in Production')).toHaveCount(builder ? 1 : 0)
        await modal.getByRole('button', { name: builder ? 'Record and roll out' : 'Record decision' }).click()
        const toast = page.locator('.ds-toast')
        const servedDefault = async () =>
          (
            await sql<{ default_variant: string }>(
              `select v.definition->>'defaultVariantKey' as default_variant
               from flag_environment_activations a join flag_definition_versions v on v.id = a.version_id
               where a.project_id = $1 and a.environment = 'production'`,
              [fx.projectId]
            )
          )[0].default_variant
        if (builder) {
          await expect(toast).toContainText('Decision recorded. New copy is on for everyone in Production.')
          expect(await servedDefault()).toBe('on')
          await toast.getByRole('button', { name: 'Undo' }).click()
          await expect(toast).toContainText('Undone.')
          expect(await servedDefault()).toBe('off')
        } else {
          await expect(toast).toContainText('Decision recorded')
          expect(await servedDefault()).toBe('off')
          await expect(page.getByRole('button', { name: /for everyone in Production/ })).toHaveCount(0)
        }
        await expect(page.locator('main .ds-page-head')).toContainText('Decided')
        await expect(answer).toContainText('Decided: ship New copy.')
      }
      if (point !== 'ready') {
        await expect(verdict.getByRole('button', { name: /Roll out/ })).toHaveCount(0)
      }

      // The Plan tab: the sentence and the read-only plan; "Change the plan" is the builder's, which
      // this deployment keeps gated (CI), so the plan is read-only here.
      await page.getByRole('tab', { name: 'Plan' }).click()
      await expect(page.locator('main > .ds-x-big-sentence')).toBeVisible()
      await expect(page.locator('main .ds-x-plan-list')).toContainText('signup completed')
      // "Change the plan" is the builder's: offered exactly when the builder can write.
      await expect(page.getByRole('button', { name: 'Change the plan →' })).toHaveCount(
        process.env.EXPERIMENT_BUILDER_ENABLED === 'true' ? 1 : 0
      )
      await expect(page.locator('main .ds-x-ledger')).toContainText(
        point === 'ready' ? 'Decision: Ship the new version' : 'No decision has been recorded'
      )
    }
  })
})
