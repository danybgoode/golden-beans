// think-skills S3 (D6) — `gf north-star set <file>`: the North Star workshop's metric reaches the engine.
//
// ── A thin shell over one route ───────────────────────────────────────────────────────────────────────────────────
// The `north-star` coach leaves `Roadmap/00-strategy/north-star.md`, whose `## Sync payload` section holds exactly one
// ```json block. This command reads that block and nothing else, and sends it to `/api/v1/cli/north-star`. The SERVER
// validates it (`northStarSyncSchema`) and its `issues` are printed verbatim on a 400, the same rule `flags-write.ts`
// follows: one judge of what a valid North Star is, and it lives on the server.
//
// ── Dry run by default ────────────────────────────────────────────────────────────────────────────────────────────
// Without `--yes` it makes ONE request, a GET of the project's current North Star, prints what a sync would do, and
// sends nothing. A sync never replaces or deletes (think-skills C2): a new metric key is ADDED beside any existing
// metric, and an input key that already exists MOVES to this metric. Both effects are named before anything is sent,
// because neither can be undone by syncing again.
//
// ── An unfilled template is refused here ──────────────────────────────────────────────────────────────────────────
// The template's `<metric_key>` placeholders satisfy the schema (any non-empty string does), so the server would store
// them. A value still shaped `<…>` is a file the coach never finished, not a North Star; `--yes` refuses it with
// nothing sent. That is a check on the TEMPLATE, not a second copy of the schema.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { boolFlag } from '../args'
import type { Command, CommandContext } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'
import { missingProject, resolveProject } from './flags-read'

type SyncInput = { key?: unknown; name?: unknown; valueSource?: unknown; sourceEvent?: unknown }
type SyncPayload = { metric?: { key?: unknown; name?: unknown; description?: unknown }; inputs?: unknown }

type CurrentInput = { key: string; name: string; valueSource: string; sourceEvent: string | null }
type CurrentMetric = { key: string; name: string; description: string | null; inputs: CurrentInput[] }

const SECTION = '## Sync payload'

/** The one ```json block under `## Sync payload`. Throws a sentence a person can act on. */
export function readSyncBlock(markdown: string): unknown {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line.trim() === SECTION)
  if (start === -1) throw new Error(`no "${SECTION}" section — is this the file the north-star coach wrote?`)
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
  const fences = [...body.matchAll(/^```json\n([\s\S]*?)\n```$/gm)]
  if (fences.length !== 1) {
    throw new Error(`expected exactly one \`\`\`json block under "${SECTION}", found ${fences.length}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fences[0][1])
  } catch (err) {
    throw new Error(`the json block does not parse: ${err instanceof Error ? err.message : String(err)}`)
  }
  // An object, or it is not a North Star at all: `null` or a list would otherwise reach the planner as a stack trace.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('the json block must be an object with `metric` and `inputs`')
  }
  return parsed
}

/** Every string value still shaped like a template placeholder, as a path: `metric.key`, `inputs[1].sourceEvent`. */
export function unfilledPaths(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return /^<.*>$/.test(value.trim()) ? [path || '(value)'] : []
  if (Array.isArray(value)) return value.flatMap((item, i) => unfilledPaths(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => unfilledPaths(item, path ? `${path}.${key}` : key))
  }
  return []
}

export type InputChange = { key: string; name: string; change: string }
export type SyncPlan = {
  metric: { key: string; name: string; change: 'new' | 'updated' | 'unchanged' }
  otherMetrics: string[]
  inputs: InputChange[]
}

/**
 * What a sync of `proposed` would do to `current`, in the route's own terms (upsert on key, never delete).
 * Presentation only: whether the payload is VALID is the server's question, answered on `--yes`.
 */
export function planSync(current: CurrentMetric[], proposed: SyncPayload): SyncPlan {
  const metricKey = String(proposed.metric?.key ?? '')
  const metricName = String(proposed.metric?.name ?? '')
  const existing = current.find((m) => m.key === metricKey)
  const description = proposed.metric?.description ?? null
  const metricChange = !existing
    ? 'new'
    : existing.name !== metricName || (existing.description ?? null) !== description
      ? 'updated'
      : 'unchanged'

  const owner = new Map<string, { metric: string; input: CurrentInput }>()
  for (const metric of current)
    for (const input of metric.inputs) owner.set(input.key, { metric: metric.key, input })

  const inputs = (Array.isArray(proposed.inputs) ? (proposed.inputs as SyncInput[]) : []).map((input) => {
    const key = String(input?.key ?? '')
    const name = String(input?.name ?? '')
    const found = owner.get(key)
    let change: string
    if (!found) change = 'new'
    else if (found.input.valueSource !== input?.valueSource) {
      // The route refuses this (an existing input's value source never changes), so say so before sending.
      change = `refused: value source is ${found.input.valueSource}`
    } else if (found.metric !== metricKey) change = `moved from ${found.metric}`
    else if (
      found.input.name !== name ||
      (found.input.sourceEvent ?? undefined) !== (input?.sourceEvent ?? undefined)
    )
      change = 'updated'
    else change = 'unchanged'
    return { key, name, change }
  })

  return {
    metric: { key: metricKey, name: metricName, change: metricChange },
    otherMetrics: current.filter((m) => m.key !== metricKey).map((m) => m.key),
    inputs,
  }
}

function describePlan(project: string, plan: SyncPlan, unfilled: string[]): string {
  const lines = [
    `North Star for ${project}:`,
    '',
    `  metric  ${plan.metric.key}  "${plan.metric.name}"  ${plan.metric.change}`,
  ]
  if (plan.otherMetrics.length > 0) {
    lines.push(
      `  This project already has ${plan.otherMetrics.length === 1 ? 'another North Star' : `${plan.otherMetrics.length} other North Stars`}: ${plan.otherMetrics.join(', ')}.`,
      '  A sync ADDS this one beside it. It never replaces or deletes. To revise one, reuse its key.'
    )
  }
  lines.push(
    '',
    table(
      ['INPUT', 'NAME', 'CHANGE'],
      plan.inputs.map((input) => [input.key, input.name, input.change])
    )
  )
  if (unfilled.length > 0) {
    lines.push('', `Not filled in yet (still a template placeholder): ${unfilled.join(', ')}.`)
  }
  return lines.join('\n')
}

/** Zod's flattened `issues`, as lines. Anything else is shown as JSON rather than guessed at. */
function issueLines(issues: unknown): string[] {
  if (!issues || typeof issues !== 'object') return []
  const { formErrors, fieldErrors } = issues as { formErrors?: unknown; fieldErrors?: unknown }
  if (!Array.isArray(formErrors) && (!fieldErrors || typeof fieldErrors !== 'object')) {
    return [`  ${JSON.stringify(issues)}`]
  }
  const out = (Array.isArray(formErrors) ? formErrors : []).map((message) => `  - ${String(message)}`)
  for (const [field, messages] of Object.entries((fieldErrors ?? {}) as Record<string, unknown>)) {
    for (const message of Array.isArray(messages) ? messages : [messages])
      out.push(`  - ${field}: ${String(message)}`)
  }
  return out
}

/** The dry run's last sentence. It never invites a `--yes` that is certain to be refused. */
function nextStep(plan: SyncPlan, unfilled: string[]): string {
  if (unfilled.length > 0) return 'Fill in the placeholders first: --yes refuses a file that still has them.'
  const refused = plan.inputs.filter((input) => input.change.startsWith('refused'))
  if (refused.length > 0) {
    return `--yes would be refused: an existing input's value source never changes (${refused.map((i) => i.key).join(', ')}). Use a new key, or keep its value source.`
  }
  return 'Run again with --yes to send it.'
}

async function readCurrent(context: CommandContext, project: string): Promise<CurrentMetric[] | ExitCode> {
  const response = await context.api!.get<{ metrics: CurrentMetric[] }>('/api/v1/cli/north-star', { project })
  if (response.kind === 'network') {
    context.emit.fail('network', response.message)
    return EXIT.SERVER
  }
  if (response.kind === 'error') {
    context.emit.fail(response.code, response.message)
    return exitForServerCode(response.code)
  }
  return Array.isArray(response.body.metrics) ? response.body.metrics : []
}

export const northStarSetCommand: Command = {
  path: ['north-star', 'set'],
  summary: "send a North Star workshop's metric and inputs to the project",
  usage: 'gf north-star set <file> [--yes] [--project <slug>]',
  needsAuth: true,
  detail: `Reads the one \`\`\`json block under "## Sync payload" in <file> — the
  Roadmap/00-strategy/north-star.md the north-star coach writes.

  Without --yes it is a DRY RUN: it reads the project's current North Star, prints what a sync
  would do, and sends nothing. With --yes it sends the block once and prints the result.

  ⚠️ A sync never replaces or deletes. A new metric key is ADDED beside an existing North Star,
  and an input key that already exists MOVES to this metric. To revise a North Star, reuse its key.
  Owner-only to send; any member can dry-run.`,
  flags: [
    { name: 'yes', describe: 'send it (without this, nothing is sent)' },
    { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
  ],
  async run(context): Promise<ExitCode> {
    const file = context.args.positionals[0]
    if (!file) {
      context.emit.fail(
        'invalid',
        'Usage: `gf north-star set <file>` — e.g. Roadmap/00-strategy/north-star.md.'
      )
      return EXIT.USAGE
    }
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    let payload: unknown
    try {
      payload = readSyncBlock(readFileSync(resolve(context.cwd, file), 'utf8'))
    } catch (err) {
      context.emit.fail(
        'invalid',
        `${file}: ${err instanceof Error ? err.message : String(err)}. Nothing was sent.`
      )
      return EXIT.USAGE
    }
    const unfilled = unfilledPaths(payload)
    const send = boolFlag(context.args, 'yes')

    // Refused BEFORE any request: a template the coach never finished is not something to read the project for, let
    // alone write.
    if (send && unfilled.length > 0) {
      context.emit.fail(
        'invalid',
        `${file} still has template placeholders (${unfilled.join(', ')}). Fill them in, then run this again. Nothing was sent.`,
        { unfilled }
      )
      return EXIT.USAGE
    }

    const current = await readCurrent(context, project)
    if (typeof current === 'number') return current
    const plan = planSync(current, payload as SyncPayload)

    if (!send) {
      context.emit.ok(
        { dryRun: true, project, ...plan, unfilled },
        `${describePlan(project, plan, unfilled)}\n\nDry run: nothing was sent. ${nextStep(plan, unfilled)}`
      )
      return EXIT.OK
    }

    const response = await context.api!.post<{ project: string; metric: string; inputsSynced: number }>(
      '/api/v1/cli/north-star',
      { project, sync: payload }
    )
    if (response.kind === 'network') {
      context.emit.fail(
        'network',
        `${response.message} It may or may not have been applied — run the dry run to see.`
      )
      return EXIT.SERVER
    }
    if (response.kind === 'error') {
      const issues = response.body.issues
      if (context.emit.json)
        context.emit.fail(response.code, response.message, issues ? { issues } : undefined)
      else context.emit.fail(response.code, [response.message, ...issueLines(issues)].join('\n'))
      return exitForServerCode(response.code)
    }

    context.emit.ok(
      { project, metric: response.body.metric, inputsSynced: response.body.inputsSynced, plan },
      `${describePlan(project, plan, [])}\n\nok · North Star ${response.body.metric} synced to ${project} · ${response.body.inputsSynced} input${response.body.inputsSynced === 1 ? '' : 's'}.`
    )
    return EXIT.OK
  },
}
