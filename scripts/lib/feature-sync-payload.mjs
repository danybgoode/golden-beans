// feature-sync-payload.mjs — pure mapping from a Miyagi-shaped `platform_flags` row + a
// known feature's event-name config into a golden-beans `POST /v1/features/sync` entry.
// Zero imports (Roadmap/LEARNINGS.md: keep pure logic import-free so a generic test
// runner never trips over a framework/runtime-only module) — used by
// scripts/sync-features-from-miyagi.mjs and unit-tested directly in
// feature-sync-payload.test.mjs, no network/DB involved.

/**
 * @param {{ key: string, enabled: boolean }} flagRow - a `platform_flags` row (key + live enabled value)
 * @param {{
 *   featureKey: string,
 *   targetEvent?: string,
 *   adoptedEvent?: string,
 *   retainedEvent?: string,
 *   retentionDays?: number,
 *   description?: string,
 * }} featureConfig - the golden-beans registry key + optional event-name mapping for it
 * @returns {{
 *   key: string, enabled: boolean, targetEvent?: string, adoptedEvent?: string,
 *   retainedEvent?: string, retentionDays?: number, description?: string,
 * }}
 */
export function buildFeatureSyncEntry(flagRow, featureConfig) {
  const entry = { key: featureConfig.featureKey, enabled: flagRow.enabled }
  if (featureConfig.targetEvent) entry.targetEvent = featureConfig.targetEvent
  if (featureConfig.adoptedEvent) entry.adoptedEvent = featureConfig.adoptedEvent
  if (featureConfig.retainedEvent) entry.retainedEvent = featureConfig.retainedEvent
  if (featureConfig.retentionDays) entry.retentionDays = featureConfig.retentionDays
  if (featureConfig.description) entry.description = featureConfig.description
  return entry
}

/**
 * Filters a full `platform_flags` row list down to the ones this repo knows how to map
 * into golden-beans features (the FEATURE_MAP in sync-features-from-miyagi.mjs), and
 * builds the sync entries. A flag with no matching config is silently skipped — the
 * registry only ever holds features golden-beans has been taught the shape of.
 *
 * @param {{ key: string, enabled: boolean }[]} flagRows
 * @param {Record<string, { featureKey: string, targetEvent?: string, adoptedEvent?: string, retainedEvent?: string, retentionDays?: number, description?: string }>} featureMap - keyed by the MIYAGI flag key
 * @returns {ReturnType<typeof buildFeatureSyncEntry>[]}
 */
export function buildFeatureSyncPayload(flagRows, featureMap) {
  const entries = []
  for (const row of flagRows) {
    const config = featureMap[row.key]
    if (!config) continue
    entries.push(buildFeatureSyncEntry(row, config))
  }
  return entries
}
