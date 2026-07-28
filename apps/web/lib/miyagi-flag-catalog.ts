import { parseFlagDefinition, type FlagDefinition } from './flag-definition'

export type MiyagiFlagCriticality = 'low' | 'medium' | 'high'
export type MiyagiFlagEnforcement = 'frontend' | 'backend' | 'both'
export type MiyagiPlatformFlagRow = {
  key: string
  enabled: boolean
  polarity: 'enablement' | 'killswitch'
  description: string | null
  updatedAt?: string
}

export type MiyagiFlagCatalogEntry = {
  key: string
  compileDefault: boolean
  criticality: MiyagiFlagCriticality
  enforcement: MiyagiFlagEnforcement
}

const BACKEND_KEYS = new Set([
  'checkout.stripe_enabled',
  'checkout.rental_pricing_enabled',
  'shipping.envia_enabled',
  'shipping.correos_enabled',
  'shipping.arranged_only_enabled',
  'ml.sync_enabled',
  'ml.orders_enabled',
  'ml.sync_paywall_enabled',
  'ops.profit_enabled',
  'ml.publish_enabled',
  'catalog.inventory_channels_enabled',
  'catalog.bulk_enabled',
])

const HIGH_CRITICALITY = new Set([
  'checkout.stripe_enabled',
  'checkout.rental_pricing_enabled',
  'shipping.envia_enabled',
  'shipping.correos_enabled',
  'shipping.arranged_only_enabled',
  'ml.sync_enabled',
  'ml.orders_enabled',
  'ml.publish_enabled',
  'catalog.inventory_channels_enabled',
  'catalog.bulk_enabled',
])

const MEDIUM_CRITICALITY = new Set([
  'domain.paywall_enabled',
  'subdomain.paywall_enabled',
  'promoter.transfer_enabled',
  'ops.profit_enabled',
  'mcp.apply_price.enabled',
  'mcp.delete_listing.enabled',
  'mcp.support_config.enabled',
  'mcp.checkout_config.enabled',
  'partners.mcp_enabled',
  'promoter.private_preview_enabled',
  'promoter.preview_verified_approval_enabled',
  'promoter.activation_crm_enabled',
  'promoter.partner_portfolio_enabled',
])

// Code-derived from Miyagi's two typed DEFAULT_FLAGS maps. Keep this list explicit:
// a newly added Miyagi flag must make import validation fail until it is classified.
const COMPILE_DEFAULTS: Record<string, boolean> = {
  'checkout.stripe_enabled': true,
  'checkout.rental_pricing_enabled': false,
  'domain.paywall_enabled': false,
  pdp_redesign: true,
  'events.quantity_enabled': false,
  'shipping.envia_enabled': false,
  'shipping.correos_enabled': false,
  'shipping.arranged_only_enabled': false,
  'promoter.enabled': false,
  'ml.connect_enabled': false,
  'ml.import_enabled': false,
  'ml.publish_enabled': false,
  'ml.sync_enabled': false,
  'ml.sync_paywall_enabled': false,
  'ml.orders_enabled': false,
  'subdomain.paywall_enabled': false,
  'seller_agent.connector_url_enabled': false,
  'promoter.transfer_enabled': false,
  'configurator.enabled': true,
  'ops.profit_enabled': false,
  'launchpad.enabled': false,
  'notifications.buyer_moneypath_enabled': true,
  'content.overrides_enabled': true,
  'catalog.inventory_channels_enabled': false,
  'catalog.bulk_enabled': false,
  'migrations.connector_enabled': false,
  'seller.shell_on_sell_enabled': true,
  'onboarding.three_doors_enabled': false,
  'growth.telemetry_enabled': false,
  'mcp.configure_options.enabled': false,
  'mcp.delete_listing.enabled': false,
  'mcp.apply_price.enabled': false,
  'mcp.support_config.enabled': false,
  'mcp.checkout_config.enabled': false,
  'partners.mcp_enabled': false,
  'promoter.private_preview_enabled': false,
  'promoter.preview_verified_approval_enabled': false,
  'promoter.activation_crm_enabled': false,
  'growth.founding_merchants_enabled': false,
  'promoter.partner_portfolio_enabled': false,
}

export const MIYAGI_FLAG_CATALOG: readonly MiyagiFlagCatalogEntry[] = Object.entries(COMPILE_DEFAULTS)
  .map<MiyagiFlagCatalogEntry>(([key, compileDefault]) => ({
    key,
    compileDefault,
    criticality: HIGH_CRITICALITY.has(key) ? 'high' : MEDIUM_CRITICALITY.has(key) ? 'medium' : 'low',
    enforcement: BACKEND_KEYS.has(key) ? 'both' : 'frontend',
  }))
  .sort((left, right) => left.key.localeCompare(right.key))

const CATALOG_BY_KEY = new Map(MIYAGI_FLAG_CATALOG.map((entry) => [entry.key, entry]))
const MAX_FLAG_DESCRIPTION_CHARACTERS = 500

export type MiyagiFlagImportEntry = {
  key: string
  definition: FlagDefinition
  effectiveValue: boolean
  source: 'platform_flags' | 'compile_default'
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The database and SDK both cap operational descriptions at 500 Unicode characters. Keep a
 * live-source editorial expansion from making an otherwise safe catalog import all-or-nothing. */
function boundedDescription(description: string | null, key: string): string {
  const normalized = description?.trim() || `Miyagi platform flag: ${key}.`
  const characters = Array.from(normalized)
  if (characters.length <= MAX_FLAG_DESCRIPTION_CHARACTERS) return normalized
  return `${characters
    .slice(0, MAX_FLAG_DESCRIPTION_CHARACTERS - 1)
    .join('')
    .trimEnd()}…`
}

/**
 * Converts a complete Miyagi platform_flags export into Golden definitions.
 * Unknown/duplicate/malformed inputs are failures, never a silent partial import.
 */
export function buildMiyagiFlagImport(
  input: unknown
): { ok: true; entries: MiyagiFlagImportEntry[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(input)) return { ok: false, errors: ['platform flag export must be an array'] }
  const errors: string[] = []
  const rows = new Map<string, MiyagiPlatformFlagRow>()
  for (const value of input) {
    if (!isRow(value) || typeof value.key !== 'string' || typeof value.enabled !== 'boolean') {
      errors.push('platform flag rows require a string key and boolean enabled value')
      continue
    }
    if (rows.has(value.key)) {
      errors.push(`duplicate platform flag row: ${value.key}`)
      continue
    }
    if (!CATALOG_BY_KEY.has(value.key)) {
      errors.push(`unknown Miyagi platform flag: ${value.key}`)
      continue
    }
    if (value.polarity !== 'enablement' && value.polarity !== 'killswitch') {
      errors.push(`invalid polarity for ${value.key}`)
      continue
    }
    rows.set(value.key, {
      key: value.key,
      enabled: value.enabled,
      polarity: value.polarity,
      description: typeof value.description === 'string' ? value.description : null,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    })
  }
  for (const entry of MIYAGI_FLAG_CATALOG) {
    if (!rows.has(entry.key)) errors.push(`missing Miyagi platform flag: ${entry.key}`)
  }
  if (errors.length > 0) return { ok: false, errors }

  const entries: MiyagiFlagImportEntry[] = MIYAGI_FLAG_CATALOG.map((catalog) => {
    const row = rows.get(catalog.key)!
    const description = boundedDescription(row.description, catalog.key)
    const definition: FlagDefinition = {
      valueType: 'boolean',
      description,
      defaultVariantKey: row.enabled ? 'on' : 'off',
      variants: [
        { key: 'off', value: false },
        { key: 'on', value: true },
      ],
      rules: [],
      metadata: {
        source: 'miyagi',
        polarity: row.polarity,
        criticality: catalog.criticality,
        enforcement: catalog.enforcement,
      },
    }
    const parsed = parseFlagDefinition(definition)
    if (!parsed.ok) throw new Error(`internal Miyagi catalog definition invalid: ${catalog.key}`)
    return {
      key: catalog.key,
      definition: parsed.definition,
      effectiveValue: row.enabled,
      source: 'platform_flags',
    }
  })
  return { ok: true, entries }
}
