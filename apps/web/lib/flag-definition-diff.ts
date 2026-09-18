// golden-frijoles-cli · D4 — the bounded version diff now lives in the SDK.
//
// Unchanged in substance: six parts described, everything else sets `unexplained` and the caller
// shows the JSON. It moved because `gf flags diff` must produce the SAME sentences the console
// shows, and a second differ that "currently agrees" is precisely what D4 forbids — parity has to
// be structural. `packages/cli` cannot import from `apps/web`, so the implementation is now
// `packages/sdk/src/flag-definition-diff.ts` and this file re-exports it.
//
// Same shim shape as `lib/flag-definition.ts` and `lib/rollout-percent.ts`.
export { UNEXPLAINED_DIFF_TEXT, describeFlagClause, diffFlagDefinitions } from '@golden-frijoles/sdk'
export type { FlagDefinitionDiff } from '@golden-frijoles/sdk'
