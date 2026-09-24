// golden-frijoles-plugin · Sprint 3, Story 3.3 — the ONE install prompt, named once.
//
// ── Why this is a module and not three hand-typed copy blocks ─────────────────────────────────
// S3.3's acceptance is that the closing CTA, `/install` and the signed-in onboarding page all hand
// the reader the SAME prompt, character for character. Three hand-written copies of "run `claude
// plugin install golden-frijoles@golden-frijoles`" agree right up until one of them is edited, and
// the one that drifts is always the one nobody re-reads.
//
// ── Why this is a CONSTANT and not a function of `getSiteUrl()` ───────────────────────────────
// Every other prompt in `lib/landing-prompts.ts` takes `siteUrl` as an argument, because AGENTS.md
// rule #5 requires every absolute URL in this app to be built by `getSiteUrl()` rather than a
// wrong-environment literal. This prompt is the deliberate exception: it names only
// `github.com` / `raw.githubusercontent.com` URLs — the plugin's OWN repo, which is the same repo
// on every environment this app ever runs in — and no `goldenfrijoles.com` URL at all. There is no
// per-environment value to resolve, so a plain string constant is the honest shape, not a shortcut
// around the rule.
//
// ── Where this is the SOURCE ────────────────────────────────────────────────────────────────────
// This is the canonical text. `golden-frijoles/skills` (the plugin/kit repo)
// `template/scripts/lib/golden-onboarding.mjs` TRANSCRIBES it, naming this file as the source — the
// same discipline that module already uses for `cli-install.ts`. Its own
// `scripts/check-onboarding-parity.mjs` asserts the transcription, the repo README and the umbrella
// `golden-frijoles` SKILL.md all carry this string verbatim; a one-word drift fails it there.
//
// Text: the audit's §3.1 prompt
// (`Roadmap/00-ideas/audits/golden-frijoles-unification-2026-09-23.md`), verbatim — its soft-wrapped
// blockquote lines joined into the one paragraph it renders as.

export const INSTALL_PROMPT =
  "Install the golden-frijoles plugin. If you're in Claude Code, run `claude plugin marketplace add " +
  "golden-frijoles/skills`, then `claude plugin install golden-frijoles@golden-frijoles`. If you're in " +
  "another agent, run `npx skills add golden-frijoles/skills --skill '*'` and select your " +
  'agent. Use one installation method. You can read the skill directly at ' +
  'https://github.com/golden-frijoles/skills/blob/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md ' +
  '(raw: https://raw.githubusercontent.com/golden-frijoles/skills/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md). ' +
  'Then use the golden-frijoles skill when working on this project, and start with its setup.'
