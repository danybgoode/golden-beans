import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectWorkspaceProjects, isInsideViewerWorkspaces } from './workspace-access.ts'

// workspaces S2.1 + S2.2 — the two tenancy decisions, asserted on rows with no database.

const MINE = 'ws-mine'
const THEIRS = 'ws-theirs'
const viewer = new Set([MINE])

test('the seam re-check: a project in one of my workspaces is inside; anything else is not', () => {
  assert.equal(isInsideViewerWorkspaces(MINE, viewer), true)
  assert.equal(isInsideViewerWorkspaces(THEIRS, viewer), false)
})

test('the seam re-check FAILS CLOSED on a missing, empty or non-string workspace id', () => {
  for (const missing of [null, undefined, '', 0, {}]) {
    assert.equal(isInsideViewerWorkspaces(missing, viewer), false, `${JSON.stringify(missing)} must deny`)
  }
  assert.equal(isInsideViewerWorkspaces(MINE, new Set()), false, 'a viewer with no workspace reaches nothing')
})

const projects = [
  { id: 'p-b', slug: 'bravo', workspaceId: MINE },
  { id: 'p-a', slug: 'alpha', workspaceId: MINE },
  { id: 'p-unjoined', slug: 'not-mine', workspaceId: MINE },
  { id: 'p-x', slug: 'theirs', workspaceId: THEIRS },
]
const memberships = [
  { projectId: 'p-a', role: 'owner' },
  { projectId: 'p-b', role: 'member' },
  { projectId: 'p-x', role: 'owner' },
]

test('getWorkspaceProjects’ rule: same workspace ∩ my project memberships, sorted by slug', () => {
  assert.deepEqual(
    intersectWorkspaceProjects({ workspaceId: MINE, viewerWorkspaceIds: viewer, projects, memberships }),
    [
      { id: 'p-a', slug: 'alpha', role: 'owner' },
      { id: 'p-b', slug: 'bravo', role: 'member' },
    ]
  )
})

test('asking for a workspace I am NOT in returns nothing — even holding a project membership inside it', () => {
  // `p-x` is in `memberships`: the state the workspace boundary exists to deny.
  assert.deepEqual(
    intersectWorkspaceProjects({ workspaceId: THEIRS, viewerWorkspaceIds: viewer, projects, memberships }),
    []
  )
})

test('a candidate from ANOTHER workspace never leaks in, even if the query that fetched it lost its filter', () => {
  const rows = intersectWorkspaceProjects({
    workspaceId: MINE,
    viewerWorkspaceIds: new Set([MINE, THEIRS]),
    projects,
    memberships,
  })
  assert.equal(
    rows.some((row) => row.id === 'p-x'),
    false
  )
})
