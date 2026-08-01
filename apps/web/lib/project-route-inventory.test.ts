import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  getProjectSurfaceLinks,
  PROJECT_ROUTE_INVENTORY,
  type ProjectSurfaceGates,
} from './project-route-inventory.ts'

const allGatesOpen: ProjectSurfaceGates = {
  'experiment-governance': true,
  'flag-serving': true,
  'journey-projections': true,
  signals: true,
}

test('the inventory classifies every direct project route exactly once', () => {
  const appDirectory = fileURLToPath(new URL('../app/app/', import.meta.url))
  const routeSegments = readdirSync(appDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(`${appDirectory}/${entry.name}/[projectSlug]/page.tsx`))
    .map((entry) => entry.name)
    .sort()
  const classified = PROJECT_ROUTE_INVENTORY.filter((surface) => surface.topLevelProjectRoute)
    .map((surface) => surface.routeSegment)
    .sort()

  assert.deepEqual(classified, routeSegments)
  assert.equal(new Set(classified).size, classified.length)
})

test('members see every live member surface but never owner-only or flow-only routes', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'member',
    featureHint: 'your-feature-key',
    gates: allGatesOpen,
  })

  assert.deepEqual(
    links.map(({ routeSegment }) => routeSegment),
    ['funnel', 'impact', 'journeys', 'experiments', 'flags', 'tasks', 'scenarios']
  )
  assert.deepEqual(
    links.find((link) => link.routeSegment === 'flags'),
    {
      routeSegment: 'flags',
      label: 'Flags',
      status: 'gated',
      href: '/app/flags/project-one',
      description: 'read-only',
    }
  )
})

test('owner-only links stay owner-only while Flags and Tasks follow their independent gates', () => {
  const gates = { ...allGatesOpen, 'flag-serving': false, signals: false }
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    featureHint: 'your-feature-key',
    gates,
  })

  assert.deepEqual(
    links.map(({ routeSegment }) => routeSegment),
    [
      'funnel',
      'impact',
      'journeys',
      'experiments',
      'scenarios',
      'keys',
      'destinations',
      'shares',
      'agent-keys',
    ]
  )
  assert.equal(
    links.some((link) => link.routeSegment === 'onboarding'),
    false
  )
})
