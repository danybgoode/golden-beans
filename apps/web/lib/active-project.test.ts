import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveActiveProject } from './active-project.ts'

// A structural stand-in, deliberately. `MemberProject` lives in `lib/membership.ts`, which imports
// React's `cache` — so naming that type here would drag React into a `node --test` run and die
// resolving it. That is also why `resolveActiveProject` is generic over `{ slug }`: the constraint
// is the only part of a project it actually reads.
const project = (slug: string) => ({ id: `id-${slug}`, slug, role: 'owner' })

const mine = [project('miyagisanchez'), project('acme')]

test('no slug means the viewer’s first project', () => {
  assert.equal(resolveActiveProject(mine, undefined)?.slug, 'miyagisanchez')
  assert.equal(resolveActiveProject(mine, null)?.slug, 'miyagisanchez')
  assert.equal(resolveActiveProject(mine, '')?.slug, 'miyagisanchez')
  assert.equal(resolveActiveProject(mine, '   ')?.slug, 'miyagisanchez')
})

test('a slug the viewer IS a member of selects it', () => {
  assert.equal(resolveActiveProject(mine, 'acme')?.slug, 'acme')
})

test('a slug the viewer is NOT a member of can never be selected', () => {
  // The whole tenancy argument for the fallback, asserted rather than asserted-in-a-comment: the
  // parameter chooses among the viewer's OWN projects or it chooses nothing. A foreign slug does not
  // reach a foreign project, it reaches the viewer's default — and the two are indistinguishable
  // from outside, which is also what AGENTS.md asks for ("not yours" and "not there" must look the
  // same to the caller).
  for (const foreign of ['golden-beans', 'miyagi', '../admin', 'MIYAGISANCHEZ', 'acme.']) {
    const resolved = resolveActiveProject(mine, foreign)
    assert.ok(resolved, `${foreign} resolved to nothing`)
    assert.ok(
      mine.some((project) => project.slug === resolved.slug),
      `${foreign} resolved to ${resolved.slug}, which is not one of the viewer's projects`
    )
    assert.equal(resolved.slug, 'miyagisanchez', `${foreign} did not fall back to the default`)
  }
})

test('surrounding whitespace is trimmed, and matching stays exact otherwise', () => {
  // A trimmed `?project=acme%20` resolves to `acme`, which is safe for the same reason the fallback
  // is: it can only ever match one of the viewer's OWN projects. Comparison is otherwise exact —
  // case included — because a slug is an identifier, not a search term, and a case-insensitive match
  // is one migration away from two projects resolving to each other.
  assert.equal(resolveActiveProject(mine, ' acme ')?.slug, 'acme')
  assert.equal(resolveActiveProject(mine, 'ACME')?.slug, 'miyagisanchez')
})

test('a viewer who belongs to nothing gets null, not a fabricated project', () => {
  // `?provision=failed` reaches this. It renders its own empty page — a wall of zeroes for a project
  // that does not exist would be the worst possible first screen.
  assert.equal(resolveActiveProject([], undefined), null)
  assert.equal(resolveActiveProject([], 'anything'), null)
})

test('a viewer with exactly one project always gets it, whatever is asked for', () => {
  const one = [project('solo')]
  assert.equal(resolveActiveProject(one, undefined)?.slug, 'solo')
  assert.equal(resolveActiveProject(one, 'solo')?.slug, 'solo')
  assert.equal(resolveActiveProject(one, 'somebody-elses')?.slug, 'solo')
})
