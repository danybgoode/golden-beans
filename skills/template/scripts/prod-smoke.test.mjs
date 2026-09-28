// prod-smoke.test.mjs — unit coverage for the daily production watchdog's pure half.
//
// Everything here runs offline: `evaluateCheck`, `resolvePath`, `summarize`, `formatReport` and
// `firstShopSlug` take plain data, so the whole file runs in milliseconds with no network and no
// live production dependency. That seam is the point — the decisions are testable, the fetch is not.
//
// Per AGENTS.md ("a guard that rejects correct output is worse than one that misses a rare fault —
// always allow the negation of what you ban"), every assertion below is covered in BOTH directions:
// the violating case is flagged AND the correct case is left alone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCheck as evaluateWith,
  framesAllowedFromAnywhere,
  formatReport,
  normalizeLocation as normalizeWith,
  parseMediaType,
  describeShapeProblem,
  isJsonMediaType,
  readJsonPath,
  resolvePath,
  runChecks as runWith,
  summarize,
  wantsBody,
  loadChecks,
} from './prod-smoke.mjs';
import {
  BASE as DEFAULT_BASE,
  CHECKS,
  firstShopSlug,
  parseCatalogItems,
} from './prod-smoke.test-fixture.mjs';

// The engine takes its base and checks explicitly; these bind it to the fixture so every origin test
// below reads exactly as it was written.
const evaluateCheck = (c, o, base = DEFAULT_BASE) => evaluateWith(c, o, base);
const normalizeLocation = (l, base = DEFAULT_BASE) => normalizeWith(l, base);
const runChecks = (base, deps = {}) => runWith(base, { checks: CHECKS, ...deps });

const check = (id) => CHECKS.find((c) => c.id === id);

// ---- evaluateCheck: status ----

test('evaluateCheck: a matching status passes', () => {
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: 'customElements.define("acme-buy-button", X)',
    headers: { 'content-type': 'text/javascript; charset=utf-8' },
  });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: a mismatched status fails and names both sides', () => {
  const r = evaluateCheck(check('embed-js'), { status: 503, body: '' });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /expected HTTP 200, got 503/);
});

// ---- evaluateCheck: the redirect contract (the 2026-08-05 regression) ----

test('evaluateCheck: /l → 308 to /mx/l passes — the shipped contract', () => {
  const r = evaluateCheck(check('browse-redirect'), { status: 308, location: '/mx/l', body: '' });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: a 308 to the WRONG target fails even though the status matches', () => {
  const r = evaluateCheck(check('browse-redirect'), { status: 308, location: '/us/l', body: '' });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /expected redirect to "\/mx\/l", got "\/us\/l"/);
});

test('evaluateCheck: a 308 with no Location header fails, and says so specifically', () => {
  const r = evaluateCheck(check('browse-redirect'), { status: 308, location: null, body: '' });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /no Location header/);
});

test('evaluateCheck: /l serving 200 directly fails — the redirect is the contract', () => {
  // The negation of the bug: if someone "fixed" the smoke by making /l serve the page again, that
  // is a different architecture than the one that shipped, and it should be loud.
  const r = evaluateCheck(check('browse-redirect'), { status: 200, location: null, body: '' });
  assert.equal(r.status, 'fail');
});

// ---- evaluateCheck: absolute vs relative redirect targets (codex review, PR #118) ----

test('normalizeLocation: a same-origin absolute target reduces to its path', () => {
  assert.equal(normalizeLocation('https://shop.example.test/mx/l'), '/mx/l');
});

test('normalizeLocation: a relative target is already normal, and passes through untouched', () => {
  assert.equal(normalizeLocation('/mx/l'), '/mx/l');
});

test('normalizeLocation: a CROSS-origin target is NOT normalized — that is a real difference', () => {
  // Sending buyers to another origin must never compare equal to a local path.
  assert.equal(normalizeLocation('https://evil.example/mx/l'), 'https://evil.example/mx/l');
});

test('normalizeLocation: a malformed Location is returned as-is rather than throwing', () => {
  assert.equal(normalizeLocation('http://[not a url'), 'http://[not a url');
});

test('normalizeLocation: same-origin is judged against the BASE BEING CHECKED, not prod', () => {
  // agy review, PR #118: hardcoding DEFAULT_BASE made --base=<staging> treat every absolute
  // redirect as cross-origin and fail a correct run — a false red on the one flag whose entire
  // purpose is pointing this script somewhere other than production.
  const staging = 'https://staging.shop.example.test';
  assert.equal(normalizeLocation(`${staging}/mx/l`, staging), '/mx/l');
  // ...and prod is now the foreign origin when staging is the target.
  assert.equal(
    normalizeLocation('https://shop.example.test/mx/l', staging),
    'https://shop.example.test/mx/l'
  );
});

test('evaluateCheck: an absolute redirect passes against a non-prod base', () => {
  const staging = 'https://staging.shop.example.test';
  const r = evaluateCheck(
    check('browse-redirect'),
    { status: 308, location: `${staging}/mx/l`, body: '', headers: {} },
    staging
  );
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: base defaults to prod when the caller omits it', () => {
  // Every other spec in this file relies on that default, so it is worth asserting directly.
  const r = evaluateCheck(check('browse-redirect'), {
    status: 308,
    location: 'https://shop.example.test/mx/l',
    body: '',
    headers: {},
  });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: /l redirecting to the ABSOLUTE same-origin target still passes', () => {
  // HTTP permits either form and a CDN can switch between them without any behaviour change.
  // Reddening here would reject correct output — the guard failure AGENTS.md calls the worse one.
  const r = evaluateCheck(check('browse-redirect'), {
    status: 308,
    location: 'https://shop.example.test/mx/l',
    body: '',
    headers: {},
  });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: a cross-origin redirect fails even though the path matches', () => {
  const r = evaluateCheck(check('browse-redirect'), {
    status: 308,
    location: 'https://evil.example/mx/l',
    body: '',
    headers: {},
  });
  assert.equal(r.status, 'fail');
});

// ---- evaluateCheck: headers (codex review, PR #118) ----

test('evaluateCheck: embed.js served as HTML fails despite a 200', () => {
  // An HTML error page where a script belongs parses to nothing and takes every embedded shop dark.
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: '<!doctype html><title>500</title>',
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /media type is "text\/html", expected one of/);
});

test('evaluateCheck: embed.js served as javascript passes, and the match is case-insensitive', () => {
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: 'customElements.define("acme-buy-button", X)',
    headers: { 'content-type': 'TEXT/JavaScript; charset=utf-8' },
  });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: an expectation spelled Content-Type still matches the stored lowercase key', () => {
  // agy review, PR #118. `observe` lowercases response header names, so a check spelling one in
  // title case would look up a key that is never there and report a header the response DID carry
  // as missing — a false failure invented by the lookup, not the response.
  const mixedCase = {
    ...check('embed-js'),
    expect: { status: 200, headerIncludes: { 'Content-Type': 'javascript' } },
  };
  const r = evaluateCheck(mixedCase, {
    status: 200,
    body: 'customElements.define("acme-buy-button", X)',
    headers: { 'content-type': 'text/javascript' },
  });
  assert.equal(r.status, 'pass');
});

test('runChecks: a base with a trailing slash does not build doubled path segments', () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return {
      status: 599,
      headers: { get: () => null, [Symbol.iterator]: function* () {} },
      text: async () => '',
    };
  };
  return runChecks(`${DEFAULT_BASE}/`, { fetchImpl }).then(() => {
    assert.ok(seen.length > 0, 'no requests were made');
    for (const url of seen) assert.doesNotMatch(url, /[^:]\/\//, `doubled slash in ${url}`);
  });
});

test('evaluateCheck: a missing content-type on a JSON endpoint fails', () => {
  const r = evaluateCheck(check('ucp-catalog'), { status: 200, body: '{}', headers: {} });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /media type could not be checked/);
});

test('evaluateCheck: application/jsonp and text/notjson are NOT JSON', () => {
  // codex: substring matching on "json" passed both. The parsed type does not.
  for (const ct of ['application/jsonp', 'text/notjson']) {
    const r = evaluateCheck(check('ucp-catalog'), {
      status: 200,
      body: '{}',
      headers: { 'content-type': ct },
    });
    assert.equal(r.status, 'fail', `${ct} must not pass`);
    assert.match(r.detail, /not a JSON media type/);
  }
});

test('evaluateCheck: application/json and a +json suffix type both pass', () => {
  // `application/*+json` is legal and common — rejecting it would redden correct output.
  for (const ct of ['application/json', 'application/ld+json', 'text/json']) {
    const r = evaluateCheck(check('ucp-catalog'), {
      status: 200,
      body: '{"items":[]}',
      headers: { 'content-type': `${ct}; charset=utf-8` },
    });
    assert.equal(r.status, 'pass', `${ct} should pass`);
  }
});

test('isJsonMediaType: the boundary cases, in both directions', () => {
  assert.equal(isJsonMediaType('application/json'), true);
  assert.equal(isJsonMediaType('application/ld+json'), true);
  assert.equal(isJsonMediaType('text/json'), true);
  assert.equal(isJsonMediaType('application/jsonp'), false);
  assert.equal(isJsonMediaType('text/notjson'), false);
  assert.equal(isJsonMediaType(null), false);
  // A suffix alone is not a media type — the type/subtype shape is checked first.
  assert.equal(isJsonMediaType('garbage+json'), false);
  assert.equal(isJsonMediaType('/json'), false);
  assert.equal(isJsonMediaType('application/'), false);
});

// ---- describeShapeProblem (codex, final round) ----

test('describeShapeProblem: a non-empty STRING does not satisfy an object requirement', () => {
  // `endpoints: "garbage"` is present and non-empty, and a bare presence check passed it.
  assert.match(describeShapeProblem('garbage', 'object'), /is string, expected an object/);
  assert.match(describeShapeProblem([1], 'object'), /is an array, expected an object/);
});

test('describeShapeProblem: missing, empty, and valid are three different answers', () => {
  assert.match(describeShapeProblem(undefined, 'object'), /is missing/);
  assert.match(describeShapeProblem({}, 'object'), /is an empty object/);
  assert.equal(describeShapeProblem({ catalog: {} }, 'object'), null);
});

test('describeShapeProblem: array and string kinds behave the same way', () => {
  assert.match(describeShapeProblem('x', 'array'), /expected an array/);
  assert.match(describeShapeProblem([], 'array'), /is an empty array/);
  assert.equal(describeShapeProblem(['a'], 'array'), null);
  assert.match(describeShapeProblem('', 'string'), /is empty/);
  assert.equal(describeShapeProblem('a', 'string'), null);
});

test('evaluateCheck: embed.js with no content-type at all fails on the media type', () => {
  const r = evaluateCheck(check('embed-js'), { status: 200, body: '', headers: {} });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /media type could not be checked/);
});

test('evaluateCheck: text/htmlx is not HTML — the embed iframe rejects it', () => {
  const r = evaluateCheck(check('embed-iframe'), {
    status: 200,
    body: 'prueba prod_01ABC',
    headers: { 'content-type': 'text/htmlx', 'content-security-policy': 'frame-ancestors *' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /media type is "text\/htmlx"/);
});

test('evaluateCheck: the embed iframe needs frame-ancestors, not merely a 200', () => {
  // A page that renders for us and refuses to frame for the seller is not a working embed.
  const r = evaluateCheck(check('embed-iframe'), {
    status: 200,
    body: '<html></html>',
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /content-security-policy/);
});

test('evaluateCheck: the embed iframe with frame-ancestors passes', () => {
  const r = evaluateCheck(check('embed-iframe'), {
    status: 200,
    body: '<html></html>',
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': 'frame-ancestors *' },
  });
  assert.equal(r.status, 'pass');
});

// ---- evaluateCheck: page identity (the silent-erosion class) ----

test('evaluateCheck: the selector needs its US door, not merely a 200', () => {
  const marketplaceHtml = '<a href="/mx/l">Ver todo</a>';
  const r = evaluateCheck(check('market-selector'), { status: 200, body: marketplaceHtml });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /missing the marker "href=\\"\/us\\""/);
});

test('evaluateCheck: the real selector body passes', () => {
  const selectorHtml = '<a href="/mx">MX</a><a href="/us">US</a><a href="/mx/l">Ver</a>';
  const r = evaluateCheck(check('market-selector'), { status: 200, body: selectorHtml });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: /mx serving the selector fails on the excluded marker', () => {
  // This is the exact erosion that went unnoticed for five days: both pages answer 200, so only an
  // identity marker can tell them apart.
  const selectorHtml = '<a href="/mx">MX</a><a href="/us">US</a><a href="/mx/l">Ver</a>';
  const r = evaluateCheck(check('mx-marketplace'), { status: 200, body: selectorHtml });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /unexpectedly contains "href=\\"\/us\\""/);
});

test('evaluateCheck: the real marketplace body passes', () => {
  const marketplaceHtml = '<section data-testid="home-hero">…</section><a href="/mx/l">Ver todo</a>';
  const r = evaluateCheck(check('mx-marketplace'), { status: 200, body: marketplaceHtml });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: a nav-only error shell does NOT pass the marketplace check', () => {
  // codex, BLOCKING: `href="/mx/l"` is navigation and appears on every page, so an error shell
  // carrying just a nav bar silently passed — green-lighting the exact wrong-page regression this
  // watchdog exists to catch. The marker is now page-specific.
  const shell = '<nav><a href="/mx/l">Explorar</a></nav><main>Error</main>';
  const r = evaluateCheck(check('mx-marketplace'), { status: 200, body: shell });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /home-hero/);
});

test('evaluateCheck: a nav-only error shell does NOT pass the browse check', () => {
  const shell = '<nav><a href="/mx/l">Explorar</a></nav><main>Error</main>';
  const r = evaluateCheck(check('mx-browse'), { status: 200, body: shell });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /prod_/);
});

test('evaluateCheck: a browse page with a real product grid passes', () => {
  const browse = '<nav><a href="/mx/l">Explorar</a></nav><a href="/mx/l/prod_01ABC">Item</a>';
  const r = evaluateCheck(check('mx-browse'), { status: 200, body: browse });
  assert.equal(r.status, 'pass');
});

// ---- structural JSON + media-type sets (codex, final round) ----

test('evaluateCheck: an error object QUOTING the manifest name does not pass', () => {
  // `{"error":"acme-ucp unavailable"}` contains the identifier while being the opposite of
  // a healthy manifest. Substring matching could not tell them apart.
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({ error: 'acme-ucp unavailable' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /JSON field "name" is undefined, expected "acme-ucp"/);
});

test('evaluateCheck: the real manifest, with its discovery contract intact, passes', () => {
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({
      name: 'acme-ucp',
      capabilities: ['catalog_search', 'listing_detail'],
      endpoints: { catalog: { url: 'https://shop.example.test/api/ucp/catalog' } },
    }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: a name-only manifest FAILS — the discovery contract is the point', () => {
  // codex: `{"name":"acme-ucp"}` passed while carrying nothing an agent can actually use.
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({ name: 'acme-ucp' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /"capabilities" is not an array/);
  assert.match(r.detail, /"endpoints" is missing/);
});

test('evaluateCheck: a manifest missing the core capability FAILS', () => {
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({ name: 'acme-ucp', capabilities: ['escrow'], endpoints: { x: 1 } }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /does not include "catalog_search"/);
});

test('evaluateCheck: a STRING endpoints field fails the object requirement', () => {
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({ name: 'acme-ucp', capabilities: ['catalog_search'], endpoints: 'garbage' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /"endpoints" is string, expected an object/);
});

test('evaluateCheck: an EMPTY endpoints object counts as missing, not present', () => {
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({ name: 'acme-ucp', capabilities: ['catalog_search'], endpoints: {} }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /"endpoints" is an empty object/);
});

// ---- bodyJsonPaths (codex, final round) ----

test('evaluateCheck: an endpoints map with no CATALOG endpoint fails', () => {
  // `{garbage:true}` satisfied "non-empty object" while carrying no way to reach the catalog.
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({
      name: 'acme-ucp',
      capabilities: ['catalog_search'],
      endpoints: { garbage: true },
    }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /JSON path "endpoints\.catalog\.url" is missing/);
});

test('evaluateCheck: a catalog endpoint present but with no usable url fails', () => {
  const r = evaluateCheck(check('ucp-manifest'), {
    status: 200,
    body: JSON.stringify({
      name: 'acme-ucp',
      capabilities: ['catalog_search'],
      endpoints: { catalog: { method: 'GET' } },
    }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /"endpoints\.catalog\.url" is missing/);
});

test('readJsonPath: walks a dotted path and stops safely at any absent segment', () => {
  const doc = { endpoints: { catalog: { url: 'https://x' } } };
  assert.equal(readJsonPath(doc, 'endpoints.catalog.url'), 'https://x');
  assert.equal(readJsonPath(doc, 'endpoints.missing.url'), undefined);
  assert.equal(readJsonPath(doc, 'nope.deep.deeper'), undefined);
  assert.equal(readJsonPath(null, 'a.b'), undefined);
});

// ---- parseMediaType + the allow-list (codex, round 11) ----

test('parseMediaType: strips parameters and lowercases', () => {
  assert.equal(parseMediaType('TEXT/JavaScript; charset=utf-8'), 'text/javascript');
  assert.equal(parseMediaType('application/json'), 'application/json');
  assert.equal(parseMediaType(undefined), null);
});

test('evaluateCheck: text/notjavascript is rejected by the allow-list', () => {
  // Substring matching accepted it. The parsed type does not.
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: 'customElements.define("acme-buy-button", X)',
    headers: { 'content-type': 'text/notjavascript' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /media type is "text\/notjavascript"/);
});

test('evaluateCheck: embed.js served as text/ecmascript is accepted', () => {
  // A guard that rejects correct output is the worse failure — ecmascript media types are valid and
  // functional, and a server-side MIME preference must not redden a working loader.
  for (const ct of [
    'text/javascript',
    'application/javascript',
    'text/ecmascript',
    'application/ecmascript',
  ]) {
    const body = 'customElements.define("acme-buy-button", X)';
    const r = evaluateCheck(check('embed-js'), { status: 200, body, headers: { 'content-type': ct } });
    assert.equal(r.status, 'pass', `${ct} should be accepted`);
  }
});

test('evaluateCheck: several broken expectations are reported together, not just the first', () => {
  const r = evaluateCheck(check('mx-marketplace'), { status: 500, body: '<a href="/us">US</a>' });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /expected HTTP 200/);
  assert.match(r.detail, /missing the marker/);
  assert.match(r.detail, /unexpectedly contains/);
});

// ---- evaluateCheck: unavailable is its own state ----

test('evaluateCheck: a transport error is UNAVAILABLE, never a failure', () => {
  const r = evaluateCheck(check('embed-js'), { error: 'getaddrinfo ENOTFOUND' });
  assert.equal(r.status, 'unavailable');
  assert.match(r.detail, /could not reach it/);
});

// ---- a stalled body must not erase an observed status (codex final round) ----

test('evaluateCheck: an observed 500 stays a FAILURE even when the body could not be read', () => {
  // Previously observe() discarded the status when res.text() threw, so a concrete production
  // fault was routed down the unavailability path and the 500 was lost entirely.
  const r = evaluateCheck(check('ucp-catalog'), {
    status: 500,
    headers: { 'content-type': 'application/json' },
    body: null,
    bodyError: 'terminated',
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /expected HTTP 200, got 500/);
});

test('evaluateCheck: a 200 whose body stalled is UNAVAILABLE, not a pass', () => {
  // Nothing was observed false — but the identity assertions were never evaluated, and "I could not
  // check, so it must be fine" is the exact collapse this script exists to prevent.
  const r = evaluateCheck(check('ucp-catalog'), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: null,
    bodyError: 'terminated',
  });
  assert.equal(r.status, 'unavailable');
  assert.match(r.detail, /body could not be read/);
});

test('evaluateCheck: a stalled body on a check with NO body expectations still passes', () => {
  // A synthetic check, deliberately: every real check now reads its body, and reddening a check
  // that was in fact fully satisfied would be the other failure mode.
  const headerOnly = { id: 'synthetic', name: 'synthetic', expect: { status: 200 } };
  const r = evaluateCheck(headerOnly, { status: 200, headers: {}, body: null, bodyError: 'terminated' });
  assert.equal(r.status, 'pass');
});

test('evaluateCheck: an EMPTY embed.js body fails despite a 200 and the right media type', () => {
  // codex, BLOCKING: with no body expectation, a truncated or empty loader passed as healthy while
  // embedded shops received nothing usable.
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: '',
    headers: { 'content-type': 'text/javascript' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /missing the marker/);
});

test('evaluateCheck: some OTHER valid script served at /embed.js does not pass', () => {
  // `customElements` alone would accept any script that happens to use the API. The element name is
  // what makes it OUR loader, and it survives minification because the DOM registers it by string.
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    body: 'customElements.define("some-other-widget", X)',
    headers: { 'content-type': 'text/javascript' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /acme-buy-button/);
});

test('evaluateCheck: a STALLED embed.js body is unavailable, not a pass', () => {
  const r = evaluateCheck(check('embed-js'), {
    status: 200,
    headers: { 'content-type': 'text/javascript' },
    body: null,
    bodyError: 'terminated',
  });
  assert.equal(r.status, 'unavailable');
});

test('wantsBody: true only when an expectation actually reads the body', () => {
  assert.equal(wantsBody({ status: 200 }), false);
  assert.equal(wantsBody({ status: 200, headerIncludes: { 'content-type': 'x' } }), false);
  assert.equal(wantsBody({ status: 200, bodyIsJson: true }), true);
  assert.equal(wantsBody({ status: 200, bodyIncludes: ['x'] }), true);
  assert.equal(wantsBody({ status: 200, bodyExcludes: ['x'] }), true);
  assert.equal(wantsBody({ status: 200, bodyIncludes: [] }), false);
  // bodyJsonMatches reads the body too — omitting it here would let a manifest whose body stalled
  // report PASS, since nothing would have flagged the structural assertion as unevaluated.
  assert.equal(wantsBody({ status: 200, bodyJsonMatches: { name: 'x' } }), true);
  assert.equal(wantsBody({ status: 200, bodyJsonIncludes: { capabilities: ['x'] } }), true);
  assert.equal(wantsBody({ status: 200, bodyJsonRequires: { endpoints: 'object' } }), true);
  assert.equal(wantsBody({ status: 200, bodyJsonPaths: { 'a.b': 'string' } }), true);
});

// ---- firstShopSlug ----

test('firstShopSlug: returns the first non-empty slug', () => {
  const body = JSON.stringify({ items: [{ shop: { slug: 'andrea-shops' } }] });
  assert.equal(firstShopSlug(body), 'andrea-shops');
});

test('firstShopSlug: skips the empty-slug fallback rather than embedding a slugless path', () => {
  // `lib/ucp/schema.ts` deliberately emits '' when it cannot resolve a shop. Concatenating that
  // into `/embed/s/` is what produced the 308 the orphan sweep chased.
  const body = JSON.stringify({ items: [{ shop: { slug: '' } }, { shop: { slug: 'real-shop' } }] });
  assert.equal(firstShopSlug(body), 'real-shop');
});

test('firstShopSlug: returns null for an empty catalog, malformed JSON, or a missing items array', () => {
  assert.equal(firstShopSlug(JSON.stringify({ items: [] })), null);
  assert.equal(firstShopSlug('not json at all'), null);
  assert.equal(firstShopSlug(JSON.stringify({ total: 0 })), null);
});

// ---- resolvePath: dependency handling ----

test('resolvePath: an independent check just uses its own path', () => {
  assert.deepEqual(resolvePath(check('embed-js'), []), { path: '/embed.js' });
});

test('resolvePath: the embed check derives its path AND its identity marker from the catalog', () => {
  const prior = [
    { id: 'ucp-catalog', status: 'pass', body: JSON.stringify({ items: [{ shop: { slug: 'prueba' } }] }) },
  ];
  assert.deepEqual(resolvePath(check('embed-iframe'), prior), {
    path: '/embed/s/prueba',
    expect: { bodyIncludes: ['prueba', 'prod_'] },
  });
});

test('resolvePath: a dependent check is UNAVAILABLE when its dependency did not pass', () => {
  // Three states, never two: we did not learn that the iframe is broken, we never learned which
  // iframe to look at. Reporting a failure here would be a confident falsehood.
  const prior = [{ id: 'ucp-catalog', status: 'fail', detail: 'expected HTTP 200, got 500' }];
  const r = resolvePath(check('embed-iframe'), prior);
  assert.match(r.unavailable, /dependency "ucp-catalog" was fail/);
});

test('resolvePath: an EMPTY catalog is unavailable — nothing to pick a shop from', () => {
  const prior = [{ id: 'ucp-catalog', status: 'pass', body: JSON.stringify({ items: [] }) }];
  const r = resolvePath(check('embed-iframe'), prior);
  assert.match(r.unavailable, /no items to embed/);
});

test('resolvePath: items with BLANK slugs are a FAILURE, not an unavailability', () => {
  // codex re-review, PR #118. This is the orphan-attribution defect signature — the watchdog this
  // replaces went RED on it, and that is how the defect was originally caught. Classifying it as
  // "could not observe" would be a detection regression dressed up as caution.
  const prior = [
    {
      id: 'ucp-catalog',
      status: 'pass',
      body: JSON.stringify({ items: [{ shop: { slug: '' } }, { shop: {} }] }),
    },
  ];
  const r = resolvePath(check('embed-iframe'), prior);
  assert.equal(r.unavailable, undefined);
  assert.match(r.failed, /blank shop\.slug/);
});

test('resolvePath: a parseable catalog with NO items array is a schema FAILURE', () => {
  // codex round 4: unparseable JSON can no longer reach here (the catalog check fails on it), so
  // this branch means valid JSON of the wrong shape — observed, therefore a failure.
  const prior = [{ id: 'ucp-catalog', status: 'pass', body: JSON.stringify({ total: 0 }) }];
  const r = resolvePath(check('embed-iframe'), prior);
  assert.equal(r.unavailable, undefined);
  assert.match(r.failed, /no items array/);
});

// ---- bodyIsJson (codex round 4) ----

test('evaluateCheck: a 200 announcing JSON that serves garbage FAILS', () => {
  // Previously the catalog "passed" on status+content-type and the embed check went unavailable —
  // a broken catalog reported as an inability to look at one.
  const r = evaluateCheck(check('ucp-catalog'), {
    status: 200,
    body: 'not-json',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /not parseable JSON/);
});

test('evaluateCheck: real catalog JSON passes', () => {
  const r = evaluateCheck(check('ucp-catalog'), {
    status: 200,
    body: JSON.stringify({ items: [], total: 0 }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 'pass');
});

// ---- protocol-relative redirects (codex round 4) ----

test('normalizeLocation: a PROTOCOL-RELATIVE target resolves to the same path', () => {
  // `//shop.example.test/mx/l` is a legal URI reference that every browser resolves to the required
  // target. Comparing it as a literal string failed a correct redirect.
  assert.equal(normalizeLocation('//shop.example.test/mx/l'), '/mx/l');
});

test('normalizeLocation: a protocol-relative CROSS-origin target is still foreign', () => {
  assert.equal(normalizeLocation('//evil.example/mx/l'), '//evil.example/mx/l');
});

test('normalizeLocation: a missing Location stays missing, never a resolved "/null" path', () => {
  // `new URL(null, base)` resolves happily to /null — the empty guard is what stops a missing
  // header becoming a plausible-looking one.
  assert.equal(normalizeLocation(null), null);
  assert.equal(normalizeLocation(undefined), undefined);
  assert.equal(normalizeLocation(''), '');
});

test('evaluateCheck: /l redirecting protocol-relative to /mx/l passes', () => {
  const r = evaluateCheck(check('browse-redirect'), {
    status: 308,
    location: '//shop.example.test/mx/l',
    body: '',
    headers: {},
  });
  assert.equal(r.status, 'pass');
});

// ---- framesAllowedFromAnywhere (codex re-review, PR #118) ----

test('framesAllowedFromAnywhere: a bare * permits third-party framing', () => {
  assert.equal(framesAllowedFromAnywhere('frame-ancestors *'), true);
  assert.equal(framesAllowedFromAnywhere("frame-ancestors 'self' *"), true);
  assert.equal(framesAllowedFromAnywhere('default-src none; frame-ancestors *; script-src x'), true);
});

test("framesAllowedFromAnywhere: 'none' and 'self' do NOT, despite containing the directive name", () => {
  // The substring trap this function exists to close: both of these contain "frame-ancestors".
  assert.equal(framesAllowedFromAnywhere("frame-ancestors 'none'"), false);
  assert.equal(framesAllowedFromAnywhere("frame-ancestors 'self'"), false);
});

test('framesAllowedFromAnywhere: a wildcard SUBDOMAIN does not count as anywhere', () => {
  // `frame-ancestors *.example.com` even contains the literal text "frame-ancestors *".
  assert.equal(framesAllowedFromAnywhere('frame-ancestors *.example.com'), false);
});

test('framesAllowedFromAnywhere: EVERY comma-separated policy must permit framing', () => {
  // codex round 5. A header can carry several policies merged with commas and a browser enforces
  // all of them, so a permissive first policy does not make the page framable.
  assert.equal(
    framesAllowedFromAnywhere("frame-ancestors *; default-src 'self', frame-ancestors 'none'"),
    false
  );
  assert.equal(framesAllowedFromAnywhere("frame-ancestors 'none', frame-ancestors *"), false);
  // ...and the all-permissive multi-policy case is still allowed through.
  assert.equal(framesAllowedFromAnywhere("frame-ancestors *, default-src 'self'"), true);
  assert.equal(framesAllowedFromAnywhere('frame-ancestors *, frame-ancestors *'), true);
});

test('framesAllowedFromAnywhere: a missing header or missing directive is false, never assumed', () => {
  assert.equal(framesAllowedFromAnywhere(undefined), false);
  assert.equal(framesAllowedFromAnywhere(''), false);
  assert.equal(framesAllowedFromAnywhere('default-src *'), false);
});

test('evaluateCheck: the embed iframe fails on a restrictive frame-ancestors despite a 200', () => {
  const r = evaluateCheck(check('embed-iframe'), {
    status: 200,
    body: 'prueba',
    headers: { 'content-type': 'text/html', 'content-security-policy': "frame-ancestors 'none'" },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /does not permit third-party framing/);
});

test('evaluateCheck: a generic 200 page with a permissive CSP still fails the identity marker', () => {
  // The derived marker is what stops any old error page passing this check.
  const derived = {
    ...check('embed-iframe'),
    expect: { ...check('embed-iframe').expect, bodyIncludes: ['prueba'] },
  };
  const r = evaluateCheck(derived, {
    status: 200,
    body: '<!doctype html><title>Error</title>',
    headers: { 'content-type': 'text/html', 'content-security-policy': 'frame-ancestors *' },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /missing the marker "prueba"/);
});

test('evaluateCheck: the real embed page — right shop, framable — passes', () => {
  const derived = {
    ...check('embed-iframe'),
    expect: { ...check('embed-iframe').expect, bodyIncludes: ['prueba'] },
  };
  const r = evaluateCheck(derived, {
    status: 200,
    body: '<html>…/embed/s/prueba… <a href="/mx/l/prod_01ABC">x</a></html>',
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': 'frame-ancestors *' },
  });
  assert.equal(r.status, 'pass');
});

// ---- parseCatalogItems ----

test('parseCatalogItems: distinguishes an empty array from an unparseable body', () => {
  assert.deepEqual(parseCatalogItems(JSON.stringify({ items: [] })), []);
  assert.equal(parseCatalogItems('not json'), null);
  assert.equal(parseCatalogItems(JSON.stringify({ total: 0 })), null);
});

// ---- summarize: the three-valued exit code ----

test('summarize: all passing is the only green', () => {
  const s = summarize([{ status: 'pass' }, { status: 'pass' }]);
  assert.deepEqual([s.passed, s.failed, s.unavailable, s.exitCode], [2, 0, 0, 0]);
});

test('summarize: any failure exits 1', () => {
  const s = summarize([{ status: 'pass' }, { status: 'fail' }]);
  assert.equal(s.exitCode, 1);
});

test('summarize: unavailable-only exits 2 — a run that could not look is NOT green', () => {
  // AGENTS.md rule 5: a script that exits green having run nothing reads as a passing gate.
  const s = summarize([{ status: 'pass' }, { status: 'unavailable' }]);
  assert.equal(s.exitCode, 2);
});

test('summarize: a failure outranks an unavailability', () => {
  const s = summarize([{ status: 'fail' }, { status: 'unavailable' }]);
  assert.equal(s.exitCode, 1);
});

// ---- formatReport ----

test('formatReport: names every failing check in the output', () => {
  const results = [
    { id: 'a', name: 'embed.js', status: 'pass', detail: 'HTTP 200' },
    { id: 'b', name: 'browse redirect (/l → /mx/l)', status: 'fail', detail: 'expected HTTP 308, got 200' },
  ];
  const out = formatReport(results, summarize(results), DEFAULT_BASE);
  assert.match(out, /browse redirect/);
  assert.match(out, /expected HTTP 308, got 200/);
  assert.match(out, /FAILED/);
});

test('formatReport: an unavailable run says explicitly that it is not evidence of health', () => {
  const results = [
    { id: 'a', name: 'embed.js', status: 'unavailable', detail: 'could not reach it: timeout' },
  ];
  const out = formatReport(results, summarize(results), DEFAULT_BASE);
  assert.match(out, /not evidence that the thing is healthy/);
});

test('formatReport: an all-unavailable run reads UNAVAILABLE, never FAILED', () => {
  // Reporting "FAILED" when nothing was observed false would announce a production outage on the
  // strength of our own sandbox losing the network.
  const results = [
    { id: 'a', name: 'embed.js', status: 'unavailable', detail: 'could not reach it: timeout' },
  ];
  const out = formatReport(results, summarize(results), DEFAULT_BASE);
  assert.match(out, /UNAVAILABLE —/);
  assert.doesNotMatch(out, /FAILED/);
});

test('formatReport: a MIXED pass/unavailable run never claims nothing was observed working', () => {
  // codex review, PR #118: with 7 passes and 1 unavailable the report said "Nothing was observed
  // working either" directly beneath "7/8 passed" — a literal falsehood, and the routine copies
  // this line into the alert. The report must match what actually happened.
  const results = [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      name: `check ${i}`,
      status: 'pass',
      detail: 'HTTP 200',
    })),
    { id: 'u', name: 'UCP catalog', status: 'unavailable', detail: 'could not reach it: timeout' },
  ];
  const out = formatReport(results, summarize(results), DEFAULT_BASE);
  assert.match(out, /UNAVAILABLE —/);
  assert.doesNotMatch(out, /nothing was observed working either/i);
  assert.match(out, /What was checked looked healthy/);
  assert.match(out, /1 check\(s\) could not be observed at all/);
});

test('formatReport: a run with real failures still reads FAILED even alongside unavailables', () => {
  const results = [
    { id: 'a', name: 'embed.js', status: 'fail', detail: 'expected HTTP 200, got 503' },
    { id: 'b', name: 'UCP catalog', status: 'unavailable', detail: 'could not reach it: timeout' },
  ];
  const out = formatReport(results, summarize(results), DEFAULT_BASE);
  assert.match(out, /FAILED —/);
});

// ---- runChecks: the WIRING, not just the decisions ----
//
// Every test above exercises a pure function directly. That leaves the wiring untested, and a
// correct pure function reached by wrong plumbing still ships the bug (LEARNINGS: pure fn correct +
// behaviour wrong ⇒ suspect the wiring). These drive the real runChecks with an injected fetch.

/** A fetch stub: routes by URL substring, returns { status, headers, body }. */
function stubFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = routes[key] ?? { status: 404, headers: {}, body: '' };
    return {
      status: r.status,
      headers: {
        get: (n) => r.headers?.[n.toLowerCase()] ?? null,
        [Symbol.iterator]: function* () {
          for (const [k, v] of Object.entries(r.headers ?? {})) yield [k, v];
        },
      },
      text: async () => r.body ?? '',
    };
  };
}

const OK_JSON = (body) => ({ status: 200, headers: { 'content-type': 'application/json' }, body });

test('runChecks: a blank-slug catalog makes the embed check FAIL, not go unavailable', () => {
  // The wiring for resolvePath's `failed` branch. Mutating that branch away reddened NOTHING before
  // this test existed — the propagation was pure guesswork.
  const fetchImpl = stubFetch({
    '/api/ucp/catalog': OK_JSON(JSON.stringify({ items: [{ shop: { slug: '' } }] })),
  });
  return runChecks(DEFAULT_BASE, { fetchImpl }).then((results) => {
    const embed = results.find((r) => r.id === 'embed-iframe');
    assert.equal(embed.status, 'fail');
    assert.match(embed.detail, /blank shop\.slug/);
  });
});

test('runChecks: the derived identity marker actually reaches the comparison', () => {
  // Proves the `resolved.expect` merge in runChecks is wired, not merely computed in resolvePath.
  const fetchImpl = stubFetch({
    '/api/ucp/catalog': OK_JSON(JSON.stringify({ items: [{ shop: { slug: 'tienda-x' } }] })),
    '/embed/s/tienda-x': {
      status: 200,
      headers: { 'content-type': 'text/html', 'content-security-policy': 'frame-ancestors *' },
      body: '<html>a totally different shop</html>',
    },
  });
  return runChecks(DEFAULT_BASE, { fetchImpl }).then((results) => {
    const embed = results.find((r) => r.id === 'embed-iframe');
    assert.equal(embed.status, 'fail');
    assert.match(embed.detail, /missing the marker "tienda-x"/);
  });
});

test('runChecks: a dependency failure degrades only the dependent check, not the whole run', () => {
  // Degrade per check: one dead endpoint must never hide the state of the others.
  const fetchImpl = stubFetch({
    '/api/ucp/catalog': { status: 500, headers: {}, body: '' },
    '/embed.js': {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
      body: 'customElements.define("acme-buy-button", X)',
    },
  });
  return runChecks(DEFAULT_BASE, { fetchImpl }).then((results) => {
    assert.equal(results.find((r) => r.id === 'ucp-catalog').status, 'fail');
    assert.equal(results.find((r) => r.id === 'embed-iframe').status, 'unavailable');
    assert.equal(results.find((r) => r.id === 'embed-js').status, 'pass');
    assert.equal(results.length, CHECKS.length, 'every check must report, even after an early failure');
  });
});

// ---- the table itself ----

test('CHECKS: every check declares an expected status and a why', () => {
  for (const c of CHECKS) {
    assert.ok(c.id, 'check needs an id');
    assert.ok(c.name, `${c.id} needs a name`);
    assert.ok(
      c.why,
      `${c.id} needs a why — the reason a check exists is what stops it being deleted as noise`
    );
    assert.equal(typeof c.expect?.status, 'number', `${c.id} needs an expected status`);
    assert.ok(c.path || c.pathFrom, `${c.id} needs either a path or a pathFrom`);
  }
});

test('CHECKS: no check media-types via substring — the population guard', () => {
  // This gap recurred THREE times in review: content-type was converted to a parsed media-type
  // comparison on embed-js, then the catalog and manifest, then the embed iframe — each time
  // leaving siblings behind on the substring mechanism, where `text/htmlx` and `application/jsonp`
  // pass. Guard the population mechanically instead of finding one more door each round.
  for (const c of CHECKS) {
    const keys = Object.keys(c.expect.headerIncludes ?? {}).map((k) => k.toLowerCase());
    assert.ok(
      !keys.includes('content-type'),
      `${c.id} matches content-type by SUBSTRING — use mediaTypeIn or mediaTypeIsJson instead`
    );
  }
});

test('CHECKS: ids are unique, so resolvePath can never match the wrong dependency', () => {
  const ids = CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('CHECKS: every dependsOn names a check declared EARLIER in the table', () => {
  // The runner walks the table in order, so a forward reference would silently resolve to
  // "dependency did not run" and degrade a real check into a permanent unavailable.
  const seen = new Set();
  for (const c of CHECKS) {
    if (c.dependsOn) {
      assert.ok(
        seen.has(c.dependsOn),
        `${c.id} depends on "${c.dependsOn}", which is not declared before it`
      );
    }
    seen.add(c.id);
  }
});

test('CHECKS: the marketplace and selector checks cannot both be satisfied by one page', () => {
  // The guard against re-eroding: if a future edit ever makes these two checks pass on identical
  // HTML, they have stopped distinguishing the pages and the 07-31 blind spot is back.
  const selector = check('market-selector');
  const marketplace = check('mx-marketplace');
  const overlap = (selector.expect.bodyIncludes ?? []).filter((m) =>
    (marketplace.expect.bodyExcludes ?? []).includes(m)
  );
  assert.ok(overlap.length > 0, 'the selector must require a marker the marketplace forbids');
});

// ── The checks are the project's (S3.1) ───────────────────────────────────────────────────────────

test('runChecks refuses to run with no checks — nothing checked is never a pass', async () => {
  await assert.rejects(runWith('https://shop.example.test', {}), /no checks given/);
  await assert.rejects(runWith('https://shop.example.test', { checks: [] }), /no checks given/);
});

test("the project's checks module (else the shipped example) is a valid, runnable table", async () => {
  // In a configured project this pins the REAL checks the daily routine runs; in the template, the example.
  const { existsSync } = await import('node:fs');
  const own = new URL('./prod-smoke.checks.mjs', import.meta.url);
  const ex = await import(existsSync(own) ? own.href : './prod-smoke.checks.example.mjs');
  assert.ok(Array.isArray(ex.CHECKS) && ex.CHECKS.length > 0);
  for (const c of ex.CHECKS) {
    assert.ok(
      c.id && c.name && (c.path || c.dependsOn) && c.expect && typeof c.expect.status === 'number',
      c.id
    );
    assert.ok(c.why, `${c.id} must say why it exists`);
  }
  // Identity, not just status: at least one check must assert what answered (the origin's lesson).
  assert.ok(
    ex.CHECKS.some((c) => c.expect.bodyIncludes || c.expect.bodyJsonMatches),
    'no identity marker anywhere'
  );
});

// ---- loadChecks: every way the checks module can fail is state 2, never 1 ----

test('loadChecks: an absent checks file is could-not-look, naming the example to copy', async () => {
  const r = await loadChecks('/nope/prod-smoke.checks.mjs', { exists: () => false });
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
  assert.match(r.error, /prod-smoke\.checks\.example\.mjs/);
});

test('loadChecks: a checks file that fails to import (syntax error) is could-not-look, not a red check', async () => {
  const r = await loadChecks('x.mjs', {
    exists: () => true,
    importer: async () => {
      throw new SyntaxError('Unexpected token');
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /failed to load \(Unexpected token\)/);
});

test('loadChecks: no CHECKS export, or an empty one, is could-not-look — never a green run over nothing', async () => {
  for (const mod of [
    { BASE: 'https://x.test' },
    { BASE: 'https://x.test', CHECKS: [] },
    { CHECKS: 'nope' },
  ]) {
    const r = await loadChecks('x.mjs', { exists: () => true, importer: async () => mod });
    assert.equal(r.ok, false, JSON.stringify(mod));
    assert.match(r.error, /exports no CHECKS/);
  }
});

test('loadChecks: a well-formed module returns its BASE and CHECKS', async () => {
  const r = await loadChecks('x.mjs', {
    exists: () => true,
    importer: async () => ({ BASE: DEFAULT_BASE, CHECKS }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.BASE, DEFAULT_BASE);
  assert.equal(r.CHECKS, CHECKS);
});
