// The programmatic surface. Small on purpose: this package is a BINARY, and everything exported
// here is something the repo's own tests or a future MCP bridge needs to reach.
export { run, type RunOptions } from './run'
export { COMMANDS } from './commands'
export { EXIT, EXIT_CODE_TABLE, exitForServerCode, type ExitCode } from './exit-codes'
export { parseArgs, type ParsedArgs } from './args'
export { renderCommandHelp, renderRootHelp } from './help'
export { VERSION } from './version'
export {
  DEFAULT_API_URL,
  CLI_TOKEN_FORMAT,
  credentialsPath,
  normalizeApiUrl,
  readCredentials,
  resolveAuth,
  writeCredentials,
  type Credentials,
} from './credentials'
