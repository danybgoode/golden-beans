// Fast unit layer for the rail's shaping rules. The QUERY (tenancy, ordering, the allow-list as a
// SQL filter) is asserted against a real database in e2e/agent-activity.spec.ts — a fake client
// here would only prove that the fake agrees with itself.
//
// What is worth pinning in this layer is the part a mocked database could never catch: the
// attribution rule, and the fact that every allow-listed action has a sentence.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_ACTIVITY_ACTIONS,
  deriveActor,
  describeAgentActivity,
  type AgentActivityAction,
} from './agent-activity-read.ts'

test('D3 — attribution reads metadata.via, not an actor string', () => {
  assert.equal(deriveActor({ via: 'connector' }), 'agent')

  // The attack this rule exists to prevent: a tenant naming a human "claude-code" and moving what
  // the rail says about who is doing the work. `via` is a fact about the credential and code path;
  // `actor` is caller-supplied free text.
  assert.equal(deriveActor({ actor: 'claude-code' }), 'human')
  assert.equal(deriveActor({ actor: 'claude-bot', claimedBy: 'claude' }), 'human')

  // Anything that is not exactly the connector is human, including an absent or malformed `via`.
  // Understating the agent is the safe direction; crediting an agent with a person's action is not.
  assert.equal(deriveActor({}), 'human')
  assert.equal(deriveActor({ via: 'CONNECTOR' }), 'human')
  assert.equal(deriveActor({ via: true }), 'human')
})

test('every allow-listed action renders a sentence, with and without its metadata', () => {
  for (const action of AGENT_ACTIVITY_ACTIONS) {
    const withMetadata = describeAgentActivity(action, {
      label: 'ci',
      name: 'ci',
      slug: 'ci',
      lens: 'team',
      keyId: '11111111-2222-3333-4444-555555555555',
      shareId: '11111111-2222-3333-4444-555555555555',
      destinationId: '11111111-2222-3333-4444-555555555555',
      deliveryId: '11111111-2222-3333-4444-555555555555',
      taskId: '11111111-2222-3333-4444-555555555555',
      toStatus: 'resolved',
      disposition: 'delivered',
    })
    assert.ok(withMetadata.length > 0, `${action} rendered an empty line`)

    // The honest-degradation case. An audit row whose metadata is missing a key must still produce
    // a true sentence — never the string "undefined" in front of a customer.
    const bare = describeAgentActivity(action, {})
    assert.ok(bare.length > 0, `${action} rendered an empty line with no metadata`)
    assert.ok(!bare.includes('undefined'), `${action} leaked "undefined" into its line`)
    assert.ok(!bare.includes('null'), `${action} leaked "null" into its line`)
  }
})

test('a UUID target is shortened rather than printed whole', () => {
  const line = describeAgentActivity('api_key_revoked', {
    keyId: 'abcdef01-2222-3333-4444-555555555555',
  })
  assert.ok(line.includes('abcdef01'))
  assert.ok(!line.includes('abcdef01-2222'))
})

test('D2 — the allow-list is a closed set, and signup/emit-failure stay out of it', () => {
  const actions = new Set<string>(AGENT_ACTIVITY_ACTIONS)

  // `signup_requested` carries no project_id (it is emitted before a project exists), so it could
  // never be scoped to a tenant's rail. `task_event_emit_failed` is not something an actor did.
  assert.equal(actions.has('signup_requested'), false)
  assert.equal(actions.has('task_event_emit_failed'), false)

  // No duplicates: a repeated entry would render the same row twice under `.in()`-based filtering
  // being widened later, and is the kind of thing an eye slides over in a 19-line literal.
  assert.equal(actions.size, AGENT_ACTIVITY_ACTIONS.length)
})

test('the describers map is total — a new action cannot be added without a sentence', () => {
  // This is the compile-time contract made observable at runtime. `describeAgentActivity` keys its
  // map by `Record<AgentActivityAction, …>`, so adding a member to AGENT_ACTIVITY_ACTIONS without a
  // describer is a type error; this catches the case where someone widens the type with a cast.
  const unknownAction = 'definitely_not_an_action' as AgentActivityAction
  assert.throws(() => describeAgentActivity(unknownAction, {}))
})
