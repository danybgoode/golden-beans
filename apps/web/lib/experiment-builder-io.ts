import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import { readEventCatalog } from './event-catalog-read'
import type { ExperimentDefinition } from './experiment-definition'
import type { ExperimentBuilderAnswers, ServedFeature } from './experiment-builder-plan'
import type { EventCatalog } from './event-catalog'

// experiments-for-humans · Stories 3.2 / 3.3 — the builder's reads and writes, with the Supabase
// client INJECTED so the specs drive the real RPCs (a Playwright spec cannot import `server-only`).
// Product code reaches this only through `builder-actions.ts`, which hands it the service client.
//
// Every query is `project_id`-scoped with an id the caller resolved from the signed-in owner
// (CODE-QUALITY #10). Flags are read ONE key at a time: the registry view's `.in(all flag ids)`
// overflows the URL at ~200 flags (epic README, follow-ups), and the builder never needs them all.

export type PlanningContext = {
  catalog: EventCatalog
  served: ServedFeature
  takenExperimentKeys: string[]
  takenFlagKeys: string[]
}

export type StoredDraft = {
  experimentId: string
  versionId: string
  version: number
  status: 'draft' | 'running' | 'stopped' | 'decided' | 'invalid'
  definition: ExperimentDefinition
  answers: ExperimentBuilderAnswers | null
  flagKey: string | null
  flagId: string | null
  flagVersionId: string | null
}

export type SavedDraft = {
  experimentId: string
  versionId: string
  version: number
  flagId: string
  flagVersionId: string
  created: boolean
}

export type BuilderIo = ReturnType<typeof createBuilderIo>

export function createBuilderIo(client: SupabaseClient) {
  async function servedFeature(projectId: string, flagKey: string): Promise<ServedFeature> {
    const { data: registry, error } = await client
      .from('flag_registries')
      .select('id,key')
      .eq('project_id', projectId)
      .eq('key', flagKey)
      .maybeSingle()
    if (error) throw new Error('could not read the feature')
    if (!registry) return null
    const { data: active } = await client
      .from('flag_environment_activations')
      .select('version_id')
      .eq('project_id', projectId)
      .eq('flag_id', registry.id)
      .eq('environment', 'production')
      .maybeSingle()
    const query = client
      .from('flag_definition_versions')
      .select('id,definition,version')
      .eq('project_id', projectId)
      .eq('flag_id', registry.id)
    // What Production SERVES when it serves anything; otherwise the newest version, flagged inactive
    // so check 1 fails honestly instead of the planner guessing.
    const { data: version, error: versionError } = active?.version_id
      ? await query.eq('id', active.version_id).maybeSingle()
      : await query.order('version', { ascending: false }).limit(1).maybeSingle()
    if (versionError) throw new Error('could not read the feature')
    if (!version) return null
    return {
      flagKey,
      definition: version.definition as FlagDefinition,
      activeInProduction: Boolean(active?.version_id),
    }
  }

  return {
    async loadPlanningContext(projectId: string, flagKey: string | null): Promise<PlanningContext> {
      const [catalog, served, experiments, flags] = await Promise.all([
        readEventCatalog(client, projectId),
        flagKey ? servedFeature(projectId, flagKey) : Promise.resolve(null),
        client.from('experiment_registries').select('key').eq('project_id', projectId),
        client.from('flag_registries').select('key').eq('project_id', projectId),
      ])
      if (experiments.error || flags.error) throw new Error('could not read the project')
      return {
        catalog,
        served,
        takenExperimentKeys: (experiments.data ?? []).map((row) => row.key as string),
        takenFlagKeys: (flags.data ?? []).map((row) => row.key as string),
      }
    },

    /** The LATEST version of an experiment, with its binding and the answers that made it (if any). */
    async loadDraft(projectId: string, experimentKey: string): Promise<StoredDraft | null> {
      const { data: registry, error } = await client
        .from('experiment_registries')
        .select('id')
        .eq('project_id', projectId)
        .eq('key', experimentKey)
        .maybeSingle()
      if (error) throw new Error('could not read the experiment')
      if (!registry) return null
      const { data: version, error: versionError } = await client
        .from('experiment_definition_versions')
        .select('id,version,status,definition')
        .eq('project_id', projectId)
        .eq('experiment_id', registry.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (versionError) throw new Error('could not read the experiment')
      if (!version) return null
      const [binding, answers] = await Promise.all([
        client
          .from('experiment_flag_version_bindings')
          .select('flag_id,flag_version_id')
          .eq('project_id', projectId)
          .eq('experiment_version_id', version.id)
          .maybeSingle(),
        client
          .from('experiment_builder_answers')
          .select('answers')
          .eq('project_id', projectId)
          .eq('version_id', version.id)
          .maybeSingle(),
      ])
      if (binding.error || answers.error) throw new Error('could not read the experiment')
      let flagKey: string | null = null
      if (binding.data) {
        const { data: flag } = await client
          .from('flag_registries')
          .select('key')
          .eq('project_id', projectId)
          .eq('id', binding.data.flag_id)
          .maybeSingle()
        flagKey = (flag?.key as string | undefined) ?? null
      }
      return {
        experimentId: registry.id as string,
        versionId: version.id as string,
        version: version.version as number,
        status: version.status as StoredDraft['status'],
        definition: version.definition as ExperimentDefinition,
        answers: (answers.data?.answers as ExperimentBuilderAnswers | undefined) ?? null,
        flagKey,
        flagId: (binding.data?.flag_id as string | undefined) ?? null,
        flagVersionId: (binding.data?.flag_version_id as string | undefined) ?? null,
      }
    },

    async saveDraft(input: {
      projectId: string
      experimentKey: string
      definition: ExperimentDefinition
      flagKey: string
      flagDefinition: FlagDefinition
      answers: ExperimentBuilderAnswers
      actorUserId: string
    }): Promise<{ ok: true; saved: SavedDraft } | { ok: false; error: string }> {
      const { data, error } = await client.rpc('save_experiment_draft', {
        p_project_id: input.projectId,
        p_experiment_key: input.experimentKey,
        p_definition: input.definition,
        p_flag_key: input.flagKey,
        p_flag_definition: input.flagDefinition,
        p_answers: input.answers,
        p_actor_user_id: input.actorUserId,
      })
      const row = data?.[0]
      if (error || !row) {
        console.error('[experiment-builder] save failed:', error)
        return { ok: false, error: 'The draft could not be saved.' }
      }
      return {
        ok: true,
        saved: {
          experimentId: row.experiment_id,
          versionId: row.version_id,
          version: row.version,
          flagId: row.flag_id,
          flagVersionId: row.flag_version_id,
          created: row.created === true,
        },
      }
    },

    async transitionToRunning(
      projectId: string,
      experimentId: string,
      versionId: string,
      actorUserId: string
    ) {
      const { data, error } = await client.rpc('transition_experiment_version', {
        p_project_id: projectId,
        p_experiment_id: experimentId,
        p_version_id: versionId,
        p_target_status: 'running',
        p_actor_user_id: actorUserId,
      })
      const row = data?.[0]
      return !error && row?.status === 'running'
    },

    /**
     * Activate a flag version in PRODUCTION. The snapshot revision is read immediately before, and one
     * conflict (someone else activated something in between) is retried with a fresh revision — a
     * second conflict is reported, never looped on.
     */
    async activateInProduction(input: {
      projectId: string
      flagId: string
      flagVersionId: string
      actorUserId: string
      reason: string
    }): Promise<boolean> {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: state } = await client
          .from('flag_environment_states')
          .select('snapshot_version')
          .eq('project_id', input.projectId)
          .eq('environment', 'production')
          .maybeSingle()
        const { data, error } = await client.rpc('set_flag_activation', {
          p_project_id: input.projectId,
          p_environment: 'production',
          p_flag_id: input.flagId,
          p_version_id: input.flagVersionId,
          p_expected_snapshot_version: Number(state?.snapshot_version ?? 0),
          p_reason: input.reason,
          p_actor_user_id: input.actorUserId,
        })
        if (!error && data?.[0]) return true
        if (error?.code !== 'P0001') {
          console.error('[experiment-builder] activation failed:', error)
          return false
        }
      }
      return false
    },

    /** Is this flag version the one Production serves right now? */
    async servingInProduction(projectId: string, flagId: string, flagVersionId: string): Promise<boolean> {
      const { data } = await client
        .from('flag_environment_activations')
        .select('version_id')
        .eq('project_id', projectId)
        .eq('flag_id', flagId)
        .eq('environment', 'production')
        .maybeSingle()
      return data?.version_id === flagVersionId
    },

    /** What Production serves for one flag, by id — the version row and its definition. */
    async productionVersion(
      projectId: string,
      flagId: string
    ): Promise<{ versionId: string; definition: FlagDefinition; flagKey: string } | null> {
      const [{ data: active }, { data: registry }] = await Promise.all([
        client
          .from('flag_environment_activations')
          .select('version_id')
          .eq('project_id', projectId)
          .eq('flag_id', flagId)
          .eq('environment', 'production')
          .maybeSingle(),
        client
          .from('flag_registries')
          .select('key')
          .eq('project_id', projectId)
          .eq('id', flagId)
          .maybeSingle(),
      ])
      if (!active?.version_id || !registry) return null
      const { data: version } = await client
        .from('flag_definition_versions')
        .select('id,definition')
        .eq('project_id', projectId)
        .eq('flag_id', flagId)
        .eq('id', active.version_id)
        .maybeSingle()
      return version
        ? {
            versionId: version.id as string,
            definition: version.definition as FlagDefinition,
            flagKey: registry.key as string,
          }
        : null
    },

    /** A new, NOT activated flag version through the product's own RPC. */
    async createFlagVersion(input: {
      projectId: string
      flagKey: string
      definition: FlagDefinition
      reason: string
      actorUserId: string
    }) {
      const { data, error } = await client.rpc('create_flag_definition_version', {
        p_project_id: input.projectId,
        p_flag_key: input.flagKey,
        p_definition: input.definition,
        p_reason: input.reason,
        p_actor_user_id: input.actorUserId,
      })
      const row = data?.[0]
      if (error || !row) {
        console.error('[experiment-builder] flag version failed:', error)
        return null
      }
      return { flagId: row.flag_id as string, versionId: row.version_id as string }
    },

    /** Does this version belong to this flag, in this project? (The undo's only authority.) */
    async flagVersionBelongs(projectId: string, flagId: string, versionId: string): Promise<boolean> {
      const { data } = await client
        .from('flag_definition_versions')
        .select('id')
        .eq('project_id', projectId)
        .eq('flag_id', flagId)
        .eq('id', versionId)
        .maybeSingle()
      return Boolean(data)
    },

    /**
     * Everything the builder dialog needs, read once on the server (Story 3.1). Flag versions are read
     * in pages — PostgREST answers at most 1,000 rows a request — and reduced to the version each
     * feature SERVES in Production (or its newest, marked inactive).
     */
    async loadBuilderPage(projectId: string): Promise<BuilderPageData> {
      const [catalog, registries, activations, experiments] = await Promise.all([
        readEventCatalog(client, projectId),
        client.from('flag_registries').select('id,key').eq('project_id', projectId).order('key'),
        client
          .from('flag_environment_activations')
          .select('flag_id,version_id')
          .eq('project_id', projectId)
          .eq('environment', 'production'),
        client.from('experiment_registries').select('id,key').eq('project_id', projectId),
      ])
      if (registries.error || activations.error || experiments.error)
        throw new Error('could not read the project')
      const versions: Array<{ id: string; flag_id: string; version: number; definition: FlagDefinition }> = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from('flag_definition_versions')
          .select('id,flag_id,version,definition')
          .eq('project_id', projectId)
          .order('version', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (error) throw new Error('could not read the features')
        versions.push(...((data ?? []) as typeof versions))
        if ((data ?? []).length < 1000) break
      }
      const activeByFlag = new Map(
        (activations.data ?? []).map((row) => [row.flag_id as string, row.version_id as string | null])
      )
      const features: BuilderFeature[] = (registries.data ?? []).flatMap((registry) => {
        const own = versions.filter((version) => version.flag_id === registry.id)
        const activeId = activeByFlag.get(registry.id as string) ?? null
        const served = (activeId ? own.find((version) => version.id === activeId) : undefined) ?? own[0]
        if (!served) return []
        return [
          {
            flagKey: registry.key as string,
            definition: served.definition,
            description: served.definition.description,
            valueType: served.definition.valueType,
            variantKeys: served.definition.variants.map((variant) => variant.key),
            defaultVariantKey: served.definition.defaultVariantKey,
            activeInProduction: activeId !== null,
            evaluations24h:
              catalog.flagEvaluations.find((row) => row.flagKey === registry.key)?.evaluations ?? 0,
            runningExperiment:
              typeof served.definition.metadata?.experiment_key === 'string'
                ? String(served.definition.metadata.experiment_key)
                : null,
          },
        ]
      })
      // Drafts the builder made, newest version per key, so "Continue" reopens them at Review.
      const drafts: BuilderDraft[] = []
      for (const experiment of experiments.data ?? []) {
        const draft = await this.loadDraft(projectId, experiment.key as string)
        if (draft && draft.status === 'draft' && draft.answers) {
          drafts.push({
            experimentKey: experiment.key as string,
            version: draft.version,
            answers: draft.answers,
            flagKey: draft.flagKey,
          })
        }
      }
      return {
        catalog,
        features,
        drafts,
        takenExperimentKeys: (experiments.data ?? []).map((row) => row.key as string),
        takenFlagKeys: (registries.data ?? []).map((row) => row.key as string),
      }
    },
  }
}

export type BuilderFeature = {
  flagKey: string
  /** The definition Production serves (or the newest) — the planner builds the flag version from it. */
  definition: FlagDefinition
  description: string
  valueType: FlagDefinition['valueType']
  variantKeys: string[]
  defaultVariantKey: string
  activeInProduction: boolean
  evaluations24h: number
  /** The experiment the served version names, if any (check 1 fails on a different one). */
  runningExperiment: string | null
}

export type BuilderDraft = {
  experimentKey: string
  version: number
  answers: ExperimentBuilderAnswers
  flagKey: string | null
}

export type BuilderPageData = {
  catalog: EventCatalog
  features: BuilderFeature[]
  drafts: BuilderDraft[]
  takenExperimentKeys: string[]
  takenFlagKeys: string[]
}
