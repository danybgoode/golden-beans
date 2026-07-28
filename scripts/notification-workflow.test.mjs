import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflow = readFileSync(
  join(import.meta.dirname, '..', '.github', 'workflows', 'notify-telegram.yml'),
  'utf8'
);

test('deploy facts are resolved once before both channel steps', () => {
  const resolveAt = workflow.indexOf('- name: Resolve production deploy details');
  const telegramAt = workflow.indexOf('- name: Send Telegram deploy-finish notification');
  const slackAt = workflow.indexOf('- name: Send Slack deploy-finish notification');

  assert.ok(resolveAt >= 0 && resolveAt < telegramAt && telegramAt < slackAt);
  assert.equal((workflow.match(/HEADER=\$\(gh api/g) || []).length, 1, 'one commit-message lookup only');
  for (const key of ['DEPLOY_HEADER', 'DEPLOY_STATUS_LABEL', 'DEPLOY_URL_RESOLVED']) {
    assert.ok(workflow.includes(`echo "${key}=$`), `${key} must cross via $GITHUB_ENV`);
    assert.ok(
      workflow.slice(telegramAt).includes(`"$${key}"`) && workflow.slice(slackAt).includes(`"$${key}"`),
      `${key} must feed both delivery steps`
    );
  }
});

test('a first-channel failure does not suppress Slack delivery', () => {
  const pushSlack = workflow.slice(workflow.indexOf('- name: Send Slack push notification'));
  const deploySlack = workflow.slice(workflow.indexOf('- name: Send Slack deploy-finish notification'));
  assert.match(pushSlack, /^\s+if: always\(\)/m);
  assert.match(deploySlack, /^\s+if: always\(\)/m);
});
