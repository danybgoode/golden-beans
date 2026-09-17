// golden-frijoles-cli · D4 — the percent↔basis-points seam now lives in the SDK.
//
// The arithmetic did not change and neither did its rule: it exists exactly ONCE, and every display
// and every write goes through it. What changed is WHERE once is. `packages/cli` cannot import from
// `apps/web`, and D4 requires the CLI and the console to agree about a rollout by construction
// rather than by review — so the implementation moved to `packages/sdk/src/rollout-percent.ts` and
// this file re-exports it.
//
// This is the same shape `lib/flag-definition.ts` already uses for the parser, and for the same
// reason stated there: the public SDK owns the import-safe contract so what one side validates is
// exactly what the other side evaluates.
//
// Keeping the shim (rather than rewriting ~8 call sites) is deliberate: `server-only` modules and
// client components both import this path today, and a re-export is the change with no behaviour in
// it at all.
export {
  basisPointsToPercent,
  formatRolloutPercent,
  percentToBasisPoints,
  rolloutBarPercent,
} from '@golden-frijoles/sdk'
