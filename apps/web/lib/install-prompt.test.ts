// golden-frijoles-plugin · Sprint 3, Story 3.3 — a sanity floor on the one string every install
// surface renders. The cross-repo weld (this string matches golden-frijoles/skills' own
// transcription and the repo README/umbrella SKILL.md) is checked on THAT repo, by
// `scripts/check-onboarding-parity.mjs` — a template cannot import a product's web app to read a
// string, and the reverse is equally true. This just guards against the gross local corruption a
// unit test can actually catch: the wrong marketplace/plugin name, a missing installation method,
// or a URL that stopped pointing at github.com/raw.githubusercontent.com.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INSTALL_PROMPT } from './install-prompt.ts'

test('names both installation methods, and exactly one plugin/marketplace pair', () => {
  assert.match(INSTALL_PROMPT, /claude plugin marketplace add golden-frijoles\/skills/)
  assert.match(INSTALL_PROMPT, /claude plugin install golden-frijoles@golden-frijoles/)
  assert.match(INSTALL_PROMPT, /npx skills add golden-frijoles\/skills --skill golden-frijoles/)
})

test('names only github.com / raw.githubusercontent.com URLs — never a goldenfrijoles.com host', () => {
  const urls = INSTALL_PROMPT.match(/https?:\/\/\S+/g) ?? []
  assert.ok(urls.length > 0, 'a prompt with no URLs gives the reader nowhere to verify it from')
  for (const url of urls) {
    assert.match(
      url,
      /^https?:\/\/(raw\.githubusercontent\.com|github\.com)\//,
      `${url} is not github.com or raw.githubusercontent.com — this prompt is a constant precisely ` +
        'because it should never need a site URL'
    )
  }
})

test('the raw URL is the github URL, mirrored', () => {
  const githubUrl = INSTALL_PROMPT.match(/https:\/\/github\.com\/\S+?SKILL\.md/)?.[0]
  const rawUrl = INSTALL_PROMPT.match(/https:\/\/raw\.githubusercontent\.com\/\S+?SKILL\.md/)?.[0]
  assert.ok(githubUrl && rawUrl, 'both a github.com and a raw.githubusercontent.com link are expected')
  assert.equal(
    githubUrl!.replace('github.com', 'HOST').replace('/blob/main/', '/main/'),
    rawUrl!.replace('raw.githubusercontent.com', 'HOST'),
    'the two links should name the identical path, just via github.com/blob vs raw.githubusercontent.com'
  )
})
