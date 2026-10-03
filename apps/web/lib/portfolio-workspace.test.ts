import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultPortfolioWorkspaceId,
  opensOnPortfolio,
  portfolioHrefFor,
  resolvePortfolioWorkspace,
} from './portfolio-workspace.ts'

// portfolio-view S2.1 + S2.2 — the workspace choice (D12) and the front-door rule (D5, C2), with no session.

const A = { id: '11111111-1111-4111-8111-111111111111', name: "Daniel's products" }
const B = { id: '22222222-2222-4222-8222-222222222222', name: "miyagi's products" }
const C = { id: '33333333-3333-4333-8333-333333333333', name: 'Another' }
const p = (workspace: { id: string; name: string }) => ({ workspace })

test('2.2: bare /app opens on the portfolio only with 2+ products in ONE workspace', () => {
  assert.equal(opensOnPortfolio([p(A)], {}), false)
  assert.equal(opensOnPortfolio([p(A), p(B)], {}), false, 'two products in two workspaces is not a portfolio')
  assert.equal(opensOnPortfolio([p(A), p(A)], {}), true)
  assert.equal(opensOnPortfolio([], {}), false)
})

test('2.2 / C2: ?project= (the switcher’s Today) and ?provision= never redirect', () => {
  const two = [p(A), p(A)]
  assert.equal(opensOnPortfolio(two, { project: 'miyagisanchez' }), false)
  assert.equal(opensOnPortfolio(two, { provision: 'failed' }), false)
  // An empty or blank value is a bare /app.
  assert.equal(opensOnPortfolio(two, { project: '', provision: '  ' }), true)
})

test('D12: the default workspace holds most of the viewer’s projects; ties go to name', () => {
  assert.equal(defaultPortfolioWorkspaceId([p(B), p(A), p(A)]), A.id)
  assert.equal(defaultPortfolioWorkspaceId([p(B), p(B), p(A)]), B.id)
  assert.equal(defaultPortfolioWorkspaceId([p(B), p(C)]), C.id, "'Another' sorts before \"miyagi's\"")
  assert.equal(defaultPortfolioWorkspaceId([]), null)
})

test('D12: ?workspace= picks among the viewer’s OWN workspaces; anything else is null (→ 404)', () => {
  const mine = [A, B]
  const projects = [p(A), p(A), p(B)]
  assert.equal(resolvePortfolioWorkspace(mine, projects, B.id), B)
  assert.equal(resolvePortfolioWorkspace(mine, projects, C.id), null, 'a real workspace that is not theirs')
  assert.equal(resolvePortfolioWorkspace(mine, projects, 'not-a-uuid'), null)
  assert.equal(resolvePortfolioWorkspace(mine, projects, undefined), A)
  assert.equal(resolvePortfolioWorkspace(mine, projects, '  '), A)
  assert.equal(resolvePortfolioWorkspace([], [], undefined), null)
})

test('the href carries the workspace id', () => {
  assert.equal(portfolioHrefFor(A.id), `/app/portfolio?workspace=${A.id}`)
})
