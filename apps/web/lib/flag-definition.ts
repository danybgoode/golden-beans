// Server-side definition boundary for the flag registry. The public SDK owns the import-safe
// contract so a snapshot that Golden validates is exactly the shape a local consumer evaluates.
// Keep database validation in lockstep with this parser (migration 20260807…).
export {
  FLAG_CONTEXT_FIELDS,
  FLAG_ENVIRONMENTS,
  MAX_FLAG_DEFINITION_BYTES,
  // flags-visual-rule-builder · Sprint 3 (A3/D4). "Preview as a user" answers with the SDK's own
  // evaluator, server-side — so the explanation crosses the same boundary the parser does, and for
  // the same reason: there is one implementation of matching and this is where the app reaches it.
  explainFlagEvaluation,
  parseFlagDefinition,
  validateFlagKey,
} from '@golden-frijoles/sdk'
export type {
  FlagDefinition,
  FlagDefinitionResult,
  FlagEnvironment,
  FlagEvaluationContext,
  FlagEvaluationExplanation,
  FlagRuleExplanation,
  FlagValueType,
} from '@golden-frijoles/sdk'
