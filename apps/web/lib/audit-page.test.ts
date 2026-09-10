import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_PAGE_SIZE, parseAuditPage, paginateAudit } from './audit-page.ts'

const rows = (n: number) => Array.from({ length: n }, (_, index) => index + 1)

test('the page size is the twelve the approved state draws', () => {
  // ⚠️ A literal, deliberately. `ship-activity.png` renders twelve entries, and a number derived
  // from anything in this repo would agree with the repo rather than with the design.
  assert.equal(AUDIT_PAGE_SIZE, 12)
})

test('a full list splits into pages of twelve, newest first, with nothing lost or repeated', () => {
  const all = rows(148) // the production count on 2026-09-09 (epic D13-b)
  const pages = []
  for (let page = 1; page <= 13; page += 1) pages.push(paginateAudit(all, page))

  assert.equal(pages[0].pageCount, 13, '148 rows is 12 full pages and a partial one')
  assert.deepEqual(pages[0].rows, all.slice(0, 12))
  assert.deepEqual(pages[12].rows, all.slice(144), 'the last page holds the remaining four')

  // Nothing lost, nothing repeated — the property a page-by-page walk actually has to have.
  assert.deepEqual(
    pages.flatMap((page) => page.rows),
    all
  )
})

test('the first and last pages offer only the direction that exists', () => {
  const all = rows(30)
  assert.equal(paginateAudit(all, 1).previousPage, null, 'page 1 offers no previous')
  assert.equal(paginateAudit(all, 1).nextPage, 2)
  assert.equal(paginateAudit(all, 3).previousPage, 2)
  assert.equal(paginateAudit(all, 3).nextPage, null, 'the last page offers no next')
})

test('a single page offers neither direction, so no dead control is rendered', () => {
  const one = paginateAudit(rows(5), 1)
  assert.equal(one.pageCount, 1)
  assert.equal(one.previousPage, null)
  assert.equal(one.nextPage, null)
})

test('a page past the end CLAMPS rather than rendering empty', () => {
  // ⚠️ The assertion this module exists for. An empty audit page reads as "nothing happened", which
  // is the one thing an audit must never say by accident.
  const past = paginateAudit(rows(30), 99)
  assert.equal(past.page, 3, 'the page shown is the last one, not the one asked for')
  assert.equal(past.rows.length, 6)
  assert.notEqual(past.rows.length, 0)
})

test('an EMPTY list is one page, not zero — "page 1 of 0" is nonsense', () => {
  const empty = paginateAudit([], 1)
  assert.equal(empty.pageCount, 1)
  assert.equal(empty.page, 1)
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.from, 0, 'showing nothing starts at nothing, not at row 1')
  assert.equal(empty.to, 0)
  assert.equal(empty.total, 0)
})

test('from/to describe the rows actually on screen', () => {
  const second = paginateAudit(rows(148), 2)
  assert.equal(second.from, 13)
  assert.equal(second.to, 24)
  assert.equal(second.total, 148)

  const last = paginateAudit(rows(148), 13)
  assert.equal(last.from, 145)
  assert.equal(last.to, 148, 'the partial last page ends at the real total, not at a multiple of 12')
})

test('an unreadable ?page is the FIRST page, never an error', () => {
  // Every one of these arrives from a URL a person can edit or a link somebody pasted wrong. On a
  // read-only audit they all mean the same thing.
  for (const raw of [undefined, '', 'x', '0', '-3', '1.5', 'NaN', 'Infinity', '1e9x']) {
    assert.equal(parseAuditPage(raw), 1, `${JSON.stringify(raw)} should read as page 1`)
  }
  // A repeated query parameter arrives as an array; the first wins rather than the whole thing
  // being discarded.
  assert.equal(parseAuditPage(['2', '3']), 2)
  assert.equal(parseAuditPage('7'), 7)
})
