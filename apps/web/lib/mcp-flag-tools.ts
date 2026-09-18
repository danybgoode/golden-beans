import 'server-only'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@golden-frijoles/sdk'
import { executeCliFlagWrite } from './cli-flag-write'
import { getFlagRegistryView } from './flag-registry'
import { toCliFlagDetailView, toCliFlagView } from './cli-flag-view'

// golden-frijoles-cli · Sprint 3, Story 3.4 — the MCP flag tools, on the SAME command core.
//
// ── D4 made structural ────────────────────────────────────────────────────────────────────────
// Every tool here calls `executeCliFlagWrite`, which calls the SDK's planners. So does the CLI's
// write route. There is no second implementation of "what does killing a flag mean" for these two
// surfaces to drift apart on — and `mcp-flag-tools.test.ts` asserts that the tool and the CLI verb
// produce the SAME plan for the same input, which is only a meaningful test because there is one
// implementation to compare against itself.
//
// ── The THIRD credential, and why it is the CLI's PAT rather than `agent_write` ───────────────
// The connector's existing write tools (tasks) pair the connector token with an `agent_write` key.
// That shape cannot work here, and the reason is worth stating because it looks like an omission:
//
//   `create_flag_definition_version` and `set_flag_activation` are SECURITY DEFINER functions that
//   require `project_members.role = 'owner'` for the acting USER, and they write that user id into
//   `flag_lifecycle_audit.actor_user_id`. An `agent_write` key is not a person — it resolves to a
//   project, not to a user — so there is no honest actor to record.
//
// The two ways to force it are both worse than this one. Attributing an agent's flag change to
// whichever human happens to own the project makes the audit trail say something false about the
// most consequential records this system keeps; adding an external-actor path to those RPCs is a
// new attribution concept and a migration, mid-sprint, for a surface that already has one.
//
// So a flag write over MCP needs a `gf_pat_…` — the account-scoped CLI token — and the holder must
// OWN the project the connector token resolved to. Three independent conditions, all required:
//
//   1. `CONNECTOR_ENABLED` + a live connector token          (AGENTS rule #3, unchanged)
//   2. `CLI_WRITE_API_ENABLED`                                (epic D8)
//   3. a `gf_pat_…` whose holder owns THAT project            (this module)
//
// AGENTS rule #2 is untouched: this is the credentialed connector path, not `/api/v1/public/*`
// serving a caller-supplied slug. Parity is closed by bringing MCP UP to the CLI, never by
// widening the public surface.

const environmentEnum = z.enum(FLAG_ENVIRONMENTS as unknown as [FlagEnvironment, ...FlagEnvironment[]])

/** The shared shape of every write tool's environment argument. `--all-envs`, expressed as a list. */
const environmentsArgument = z
  .array(environmentEnum)
  .min(1)
  .describe('Environments to change. Pass all three for the --all-envs behaviour.')

const reasonArgument = z
  .string()
  .min(1)
  .max(500)
  .describe('Why this change is being made. It is recorded in the flag audit trail.')

function text(payload: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError }
}

/**
 * Register the flag tools.
 *
 * `writeActor` is `null` when the request carried no usable CLI token, and the WRITE tools are then
 * not registered at all — the same shape the task tools use, and for the same reason its route
 * documents at length: registration IS the gate, so there is no code path on which a tool exists
 * without having passed it, and an attacker holding only a connector token cannot tell whether a
 * write surface exists or whether a guessed credential was closer.
 *
 * The READ tools register regardless. They answer a question a connector token already authorizes,
 * and withholding them would make the connector worse at the thing it is for.
 */
export function registerFlagTools(
  server: McpServer,
  projectId: string,
  projectSlug: string,
  writeActor: { userId: string } | null
): void {
  server.registerTool(
    'list_flags',
    {
      description:
        'Read every feature flag in this project and what each environment actually serves. `state` says whether a version is being served; `serving` says what it resolves to — they are different facts.',
      inputSchema: {},
    },
    async () => {
      try {
        const registry = await getFlagRegistryView(projectId)
        return text({
          ok: true,
          project: projectSlug,
          flags: registry.flags.map(toCliFlagView),
          environments: registry.environments.map((row) => ({
            environment: row.environment,
            snapshotVersion: row.snapshotVersion,
          })),
        })
      } catch {
        return text({ ok: false, error: 'Could not read this project’s flags right now.' }, true)
      }
    }
  )

  server.registerTool(
    'get_flag',
    {
      description: 'Read one flag: its definition, every version, and who changed what.',
      inputSchema: { key: z.string().describe('The flag key, e.g. checkout.demo_enabled') },
    },
    async ({ key }) => {
      try {
        const registry = await getFlagRegistryView(projectId)
        const flag = registry.flags.find((candidate) => candidate.key === key)
        if (!flag) return text({ ok: false, error: `No flag \`${key}\` in this project.` }, true)
        return text({ ok: true, project: projectSlug, flag: toCliFlagDetailView(flag, registry.audit) })
      } catch {
        return text({ ok: false, error: 'Could not read this project’s flags right now.' }, true)
      }
    }
  )

  if (!writeActor) return

  const actorUserId = writeActor.userId

  server.registerTool(
    'create_flag',
    {
      description:
        'Create a feature flag with a polarity, active in the environments you name. `kill_switch` is born serving TRUE (it is on until you kill it); `enablement` is born serving FALSE (you open it later). Both are ACTIVATED — a flag that is not activated is absent from the snapshot and your app falls back to its own literal.',
      inputSchema: {
        key: z.string().describe('The flag key, e.g. checkout.demo_enabled'),
        polarity: z.enum(['kill-switch', 'enablement']),
        description: z.string().max(500).default(''),
        environments: environmentsArgument,
        reason: reasonArgument,
      },
    },
    async ({ key, polarity, description, environments, reason }) =>
      text(
        await executeCliFlagWrite({
          projectId,
          actorUserId,
          flagKey: key,
          environments,
          reason,
          command: { command: 'create', polarity, description },
        })
      )
  )

  server.registerTool(
    'set_flag',
    {
      description:
        'Change which variant a flag serves by default. Targeting rules are carried across untouched — use kill_flag when clearing them is what you mean.',
      inputSchema: {
        key: z.string(),
        variantKey: z.string().describe('The variant to serve. Flags created here have "on" and "off".'),
        environments: environmentsArgument,
        reason: reasonArgument,
      },
    },
    async ({ key, variantKey, environments, reason }) =>
      text(
        await executeCliFlagWrite({
          projectId,
          actorUserId,
          flagKey: key,
          environments,
          reason,
          command: { command: 'set', variantKey },
        })
      )
  )

  server.registerTool(
    'rollout_flag',
    {
      description:
        'Serve a flag to a percentage of matching contexts. REPLACES the rule list with one unconditional rollout rule. A percent outside 0-100 is rejected, never clamped.',
      inputSchema: {
        key: z.string(),
        percent: z.number().describe('0 to 100. Rejected, not clamped, if outside that range.'),
        variantKey: z.string().optional().describe('Which variant to roll out. Defaults to "on".'),
        environments: environmentsArgument,
        reason: reasonArgument,
      },
    },
    async ({ key, percent, variantKey, environments, reason }) =>
      text(
        await executeCliFlagWrite({
          projectId,
          actorUserId,
          flagKey: key,
          environments,
          reason,
          command: { command: 'rollout', percent, variantKey },
        })
      )
  )

  server.registerTool(
    'kill_flag',
    {
      description:
        'The incident verb. Sets the default to the variant whose value is false AND CLEARS EVERY RULE — without the second part a flag reads as off while a rollout still serves true to a slice. Refuses a non-boolean flag rather than guessing an off.',
      inputSchema: {
        key: z.string(),
        environments: environmentsArgument,
        reason: reasonArgument,
      },
    },
    async ({ key, environments, reason }) =>
      text(
        await executeCliFlagWrite({
          projectId,
          actorUserId,
          flagKey: key,
          environments,
          reason,
          command: { command: 'kill' },
        })
      )
  )
}
