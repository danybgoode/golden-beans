import type { Page } from '@playwright/test'

/**
 * TEMPLATE FILL-IN — the ONE place authed browser flows sign in.
 *
 * `scripts/live-smoke.mjs --flow=<role>` and any authed `*.browser.spec.ts` call `signIn(page, identity)`.
 * Implement it with your auth provider's testing-token / session-bypass mechanism (a dev/test instance
 * only — never production keys; live-smoke refuses keys matching live-smoke.config.json's
 * `auth.forbidKeyPattern`). Until you do, `authConfigured()` is false and authed flows SKIP with a clear
 * reason rather than failing or, worse, passing unauthenticated.
 *
 * The identities are the env vars live-smoke.config.json names per flow (`flows.<role>.identityEnv`);
 * live-smoke forwards them, and `identityFor` reads them here.
 */
export function authConfigured(): boolean {
  return false // TEMPLATE FILL-IN: return true once signIn() below is implemented
}

export function identityFor(flow: string): string | null {
  const envName = process.env[`LIVE_SMOKE_IDENTITY_ENV_${flow.toUpperCase()}`]
  return envName ? (process.env[envName] ?? null) : null
}

export async function signIn(_page: Page, _identity: string): Promise<void> {
  throw new Error('TEMPLATE FILL-IN: implement signIn() in e2e/_helpers/auth.ts with your auth provider')
}
