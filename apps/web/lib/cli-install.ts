// golden-frijoles-cli · Sprint 3, Story 3.5 — the CLI's install instructions, named ONCE.
//
// ── Why these strings live in a module and not in the JSX ─────────────────────────────────────
// Story 3.5's acceptance is that `/install` and `gf init`'s printed next-steps say the SAME thing:
// "the install page and the CLI's printed next-steps are one surface" (the shaping's words). Two
// hand-written copies of `npx @golden-frijoles/cli init` agree right up until one of them is edited.
//
// ── Why this is not an import from `packages/cli` ─────────────────────────────────────────────
// D4 is explicit that `apps/web` must not depend on the CLI package — the dependency goes the other
// way, and both meet in the SDK. So the weld is a TEST rather than an import: `cli-install.test.ts`
// reads `packages/cli/package.json` off disk and asserts that the package name and the `bin` name
// in these strings are the ones actually published. A rename there turns this red without either
// side importing the other.

/** The published package. Asserted against `packages/cli/package.json`'s `name`. */
export const CLI_PACKAGE = '@golden-frijoles/cli'

/** The binary. Asserted against the single key of `packages/cli/package.json`'s `bin`. */
export const CLI_BIN = 'gf'

/**
 * The one-line path: no install, no global, nothing on `PATH`.
 *
 * `npx` first because the whole promise is "a machine that has never seen it" — and because a
 * reader who wants the global install will find it one line below, whereas a reader who only wants
 * to try it will not go looking for the shorter form.
 */
export const CLI_NPX_INIT = `npx ${CLI_PACKAGE} init`
export const CLI_NPX_LOGIN = `npx ${CLI_PACKAGE} login`
export const CLI_GLOBAL_INSTALL = `npm i -g ${CLI_PACKAGE}`

/**
 * The kill-switch story, as the three commands that complete it.
 *
 * This is the epic's own acceptance sentence made concrete — "a product owner hands a fresh agent
 * one line and the agent completes an entire kill-switch story end to end, including creating the
 * flag in every environment, with no browser and no human click." Showing it on the public page is
 * the difference between claiming that and demonstrating it.
 */
export const CLI_KILL_SWITCH_STORY = [
  `${CLI_BIN} flags create checkout.demo_enabled --kill-switch --all-envs`,
  `${CLI_BIN} flags rollout checkout.demo_enabled --env production --percent 25`,
  `${CLI_BIN} flags kill checkout.demo_enabled --env production`,
] as const
