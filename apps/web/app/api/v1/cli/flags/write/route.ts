import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  FLAG_ENVIRONMENTS,
  isFlagEnvironment,
  validateFlagKey,
  type FlagEnvironment,
  type FlagRule,
  type FlagValueType,
  type FlagVariant,
} from '@golden-frijoles/sdk'
import { cliError, cliOk, requireCliOwner } from '@/lib/cli-auth'
import { executeCliFlagWrite, type CliWriteCommand } from '@/lib/cli-flag-write'

// golden-frijoles-cli · Sprint 2 — the ONE write route. Every flag mutation the CLI makes.
//
// ── Why one route with a `command` discriminator and not six ──────────────────────────────────
// Every verb does the same three things — plan, write a version, activate per environment — and
// differs only in the planner it calls. Six routes would be six copies of the gate, the auth, the
// D2 loop and the audit, and the copy is the one that gets forgotten when a rule changes. The
// shapes still cannot be confused: `parseCommand` below is a closed discriminated union, and an
// unknown `command` is a 400 rather than a default.
//
// ── OWNER, and the database re-checks it anyway ───────────────────────────────────────────────
// `requireCliOwner` asks the same question `requireProjectOwnership` asks of a browser session. The
// SECURITY DEFINER RPCs underneath ALSO require ownership — `create_flag_definition_version` and
// `set_flag_activation` each raise 42501 otherwise — so a mistake in this layer is refused by the
// database rather than served. That is not redundancy for its own sake: it is why the "owner gate
// stops reading the real role" mutation check was refused twice over.
//
// ── Nothing here decides anything about flags ─────────────────────────────────────────────────
// This file parses a request and hands it to `executeCliFlagWrite`, which hands the decision to the
// SDK's planners. Grep it for a variant lookup, a polarity branch or a rollout calculation: there
// is none, and that absence IS D4.

export const runtime = 'nodejs'

const MAX_REASON = 500

function parseEnvironments(value: unknown, allEnvs: unknown): FlagEnvironment[] | null {
  if (allEnvs === true) return [...FLAG_ENVIRONMENTS]
  if (!Array.isArray(value) || value.length === 0) return null
  const named = value.filter((entry): entry is string => typeof entry === 'string')
  // Length equality, not `.every` alone: a body carrying `['production', 42]` would otherwise pass
  // a filter-then-check and silently act on one environment when two were asked for.
  if (named.length !== value.length || !named.every(isFlagEnvironment)) return null
  return named as FlagEnvironment[]
}

function parseVariants(value: unknown): FlagVariant[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const variants: FlagVariant[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null
    const record = entry as Record<string, unknown>
    // `'value' in record`, not a truthiness test: `false` and `0` are legitimate variant values and
    // a truthiness check would reject exactly the ones a boolean or numeric flag needs most.
    if (typeof record.key !== 'string' || !('value' in record)) return null
    variants.push({ key: record.key, value: record.value as FlagVariant['value'] })
  }
  return variants
}

/**
 * The request body → a closed command.
 *
 * Shape only. Every SEMANTIC question — is this a valid rule list, does the default variant exist,
 * is 150 a percent — belongs to the SDK's parser and planners, and asking it twice in two places is
 * how the two answers drift. What this does is refuse a body that is not one of the six shapes, so
 * `executeCliFlagWrite` never has to widen a type it was handed.
 */
function parseCommand(input: Record<string, unknown>): CliWriteCommand | null {
  const description = typeof input.description === 'string' ? input.description : ''
  switch (input.command) {
    case 'create': {
      if (input.polarity === 'kill-switch' || input.polarity === 'enablement') {
        // A boolean flag: polarity decides the default variant AND the activation (D3). There is no
        // field here for "what should it serve", which is what makes the wrong combination
        // unrepresentable rather than merely discouraged.
        return { command: 'create', polarity: input.polarity, description }
      }
      const valueType = input.valueType
      if (valueType !== 'string' && valueType !== 'number' && valueType !== 'json') return null
      const variants = parseVariants(input.variants)
      if (!variants || typeof input.defaultVariantKey !== 'string') return null
      return {
        command: 'create',
        valueType: valueType as Exclude<FlagValueType, 'boolean'>,
        description,
        variants,
        defaultVariantKey: input.defaultVariantKey,
      }
    }
    case 'set':
      return typeof input.variantKey === 'string' ? { command: 'set', variantKey: input.variantKey } : null
    case 'rollout': {
      if (typeof input.percent !== 'number') return null
      const variantKey = typeof input.variantKey === 'string' ? input.variantKey : undefined
      return { command: 'rollout', percent: input.percent, variantKey }
    }
    case 'rules':
      // NOT validated here. `parseFlagDefinition` inside the planner owns what a rule is, and a
      // second rule grammar in this file would be a second thing to keep in step with the parser.
      return Array.isArray(input.rules) ? { command: 'rules', rules: input.rules as FlagRule[] } : null
    case 'kill':
      return { command: 'kill' }
    default:
      // An unknown command is a 400, never a default (CODE-QUALITY #7). Picking a verb on a caller's
      // behalf would apply the wrong change and exit 0.
      return null
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return cliError('invalid', 'Invalid request body.')
  }
  const input = (body ?? {}) as Record<string, unknown>

  const context = await requireCliOwner(req, typeof input.project === 'string' ? input.project : null)
  if (context instanceof NextResponse) return context

  const flagKey = input.key
  if (typeof flagKey !== 'string' || !validateFlagKey(flagKey))
    return cliError('invalid', `\`${String(flagKey)}\` is not a valid flag key.`)

  const environments = parseEnvironments(input.environments, input.allEnvs)
  if (!environments) return cliError('invalid', 'Name at least one environment, or pass --all-envs.')

  // A REASON is required, never defaulted. Every audit row this produces carries it, and the RPC
  // rejects a blank one — so defaulting to '' would surface as an opaque 500 instead of the caller
  // being told what is missing.
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length < 1 || reason.length > MAX_REASON)
    return cliError('invalid', `A reason of 1–${MAX_REASON} characters is required (--reason).`)

  const command = parseCommand(input)
  if (!command) return cliError('invalid', 'Unrecognised or incomplete flag command.')

  const result = await executeCliFlagWrite({
    projectId: context.projectId,
    actorUserId: context.userId,
    flagKey,
    environments,
    reason,
    command,
  })

  if (!result.ok) {
    if (result.status === 404) return cliError('not_found', result.error)
    if (result.status === 409) return cliError('conflict', result.error)
    if (result.status === 400) return cliError('invalid', result.error, { issues: result.issues })
    return cliError('server_error', result.error)
  }

  // ⚠️ **200 even when `outcome === 'partial'`, and the CLI reads the exit code out of the body.**
  // A partial is not an HTTP error: the definition version WAS created and some environments DID
  // change, so a 4xx would tell a caller nothing happened when something did — and a caller who
  // retried on that basis would create a second version. D2's contract IS the per-environment
  // report, so the report is the response.
  const { ok: _ignored, ...payload } = result
  return cliOk(payload)
}
