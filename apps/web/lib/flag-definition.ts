// Server-side definition boundary for the flag registry. The public SDK owns the import-safe
// contract so a snapshot that Golden validates is exactly the shape a local consumer evaluates.
// Keep database validation in lockstep with this parser (migration 20260807…).
export {
  FLAG_CONTEXT_FIELDS,
  FLAG_ENVIRONMENTS,
  MAX_FLAG_DEFINITION_BYTES,
  parseFlagDefinition,
  validateFlagKey,
} from '@golden-beans/sdk'
export type { FlagDefinition, FlagDefinitionResult, FlagEnvironment, FlagValueType } from '@golden-beans/sdk'
