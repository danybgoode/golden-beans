import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOP_STAGES, loopStageWriteDecision, parseLoopStage } from './loop-stage.ts'

// portfolio-view S1.3 — the loop-stage write decision (lock C4: the route's 200/403/404 are these three outcomes).

test('owner → ok, member → forbidden, non-member (null) → not_found', () => {
  assert.equal(loopStageWriteDecision({ role: 'owner' }), 'ok')
  assert.equal(loopStageWriteDecision({ role: 'member' }), 'forbidden')
  assert.equal(loopStageWriteDecision(null), 'not_found')
})

test('an unknown or near-miss role fails closed', () => {
  for (const role of ['', 'Owner', 'admin', 'owner ', 'viewer']) {
    assert.equal(loopStageWriteDecision({ role }), 'forbidden', role)
  }
})

test('the three stages parse; anything else is null', () => {
  assert.deepEqual(LOOP_STAGES, ['consider', 'operate', 'exit'])
  for (const stage of LOOP_STAGES) assert.equal(parseLoopStage(stage), stage)
  for (const bad of ['grow', 'Operate', '', ' operate', null, undefined, 3, ['operate']]) {
    assert.equal(parseLoopStage(bad), null, String(bad))
  }
})
