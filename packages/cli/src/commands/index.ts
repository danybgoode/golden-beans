// golden-frijoles-cli — the command table. `--help` is rendered from it and the dispatcher reads it,
// so a verb cannot exist undocumented and cannot be documented without existing.
//
// ORDER IS THE HELP'S ORDER. It runs roughly in the sequence a new user meets them: sign in, find
// your project, set the project up, then work with flags.

import type { Command } from '../command'
import { loginCommand, logoutCommand, whoamiCommand } from './auth'
import { projectsCreateCommand, projectsLsCommand, projectsUseCommand } from './projects'
import { initCommand } from './init'
import { flagsGetCommand, flagsLsCommand } from './flags-read'
import { doctorCommand } from './doctor'

export const COMMANDS: readonly Command[] = [
  loginCommand,
  logoutCommand,
  whoamiCommand,
  doctorCommand,
  initCommand,
  projectsLsCommand,
  projectsCreateCommand,
  projectsUseCommand,
  flagsLsCommand,
  flagsGetCommand,
]
