// golden-frijoles-cli · Sprint 1, Story 1.3 — `gf projects ls | create | use`.

import type { Command } from '../command'
import { readCredentials, writeCredentials } from '../credentials'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'

type ProjectsBody = { projects: Array<{ slug: string; role: string }> }

export const projectsLsCommand: Command = {
  path: ['projects', 'ls'],
  summary: 'the projects this credential reaches',
  usage: 'gf projects ls [--json]',
  needsAuth: true,
  flags: [],
  async run(context): Promise<ExitCode> {
    const result = await context.api!.get<ProjectsBody>('api/v1/cli/projects')
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }
    const { projects } = result.body
    context.emit.ok(
      { projects, activeProject: context.auth.activeProject },
      projects.length === 0
        ? 'This account belongs to no project yet. Run `gf projects create`.'
        : table(
            ['PROJECT', 'ROLE', ''],
            projects.map((project) => [
              project.slug,
              project.role,
              project.slug === context.auth.activeProject ? 'active' : '',
            ])
          )
    )
    return EXIT.OK
  },
}

export const projectsCreateCommand: Command = {
  path: ['projects', 'create'],
  summary: 'make sure this account has a project (idempotent)',
  usage: 'gf projects create [--json]',
  needsAuth: true,
  detail: `⚠️ An ENSURE, not a second project.

  The database enforces one self-serve project per account — a partial unique index that
  closes a signup race, not a plan limit. So this creates your project if you somehow have
  none (a failed provision leaves that state reachable) and otherwise reports the one you
  already have, with created: false. It never mints a second.

  It also never returns an ingest key. Use \`gf keys create --type ingest\` for that, where
  the credential gets its own confirmation and its own audit row.`,
  flags: [],
  async run(context): Promise<ExitCode> {
    const result = await context.api!.post<{ created: boolean; slug: string }>('api/v1/cli/projects', {})
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }
    const { created, slug } = result.body
    context.emit.ok(
      { created, slug },
      created ? `Created project ${slug}.` : `This account already has project ${slug}. Nothing changed.`
    )
    return EXIT.OK
  },
}

export const projectsUseCommand: Command = {
  path: ['projects', 'use'],
  summary: 'remember which project the other commands act on',
  usage: 'gf projects use <slug>',
  needsAuth: true,
  detail: `Writes the choice into the saved credentials file. --project on any command
  overrides it for that one run, and GOLDEN_FRIJOLES_PROJECT overrides both — which is
  what CI should set, since CI has no credentials file to write.`,
  flags: [],
  async run(context): Promise<ExitCode> {
    const slug = context.args.positionals[0]
    if (!slug) {
      context.emit.fail('invalid', 'Name a project: `gf projects use <slug>`.')
      return EXIT.USAGE
    }

    // ⚠️ VERIFIED against the server before it is saved. Writing an unchecked slug produces a file
    // that makes every later command fail with that command's error — "no flag `x` in `y`" when the
    // real answer is "`y` is not a project you can see" — which is the class of misdirection
    // `gf doctor` exists to end, so it must not be created here in the first place.
    const result = await context.api!.get<ProjectsBody>('api/v1/cli/projects')
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }
    if (!result.body.projects.some((project) => project.slug === slug)) {
      // Not-a-member and does-not-exist are ONE answer, here as at the server (AGENTS #10).
      context.emit.fail('not_found', `No project \`${slug}\` is available to this account.`)
      return EXIT.NOT_FOUND
    }

    const existing = readCredentials(context.env)
    if (!existing) {
      // Reachable with GOLDEN_FRIJOLES_TOKEN and no saved file — CI. There is nothing to remember
      // into, and inventing a credentials file to hold a preference would write a token to a CI
      // runner's home directory, which is precisely what the env-var path exists to avoid.
      context.emit.fail(
        'invalid',
        'There is no saved credential to record this in. Set GOLDEN_FRIJOLES_PROJECT, or run `gf login` first.'
      )
      return EXIT.USAGE
    }
    writeCredentials({ ...existing, activeProject: slug }, context.env)
    context.emit.ok({ activeProject: slug }, `Now using ${slug}.`)
    return EXIT.OK
  },
}
