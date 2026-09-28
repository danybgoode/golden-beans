// prod-smoke.test-fixture.mjs — a REAL check table, used by prod-smoke.test.mjs.
//
// These are the checks the origin project's daily watchdog runs, with its names swapped for neutral
// ones. They are kept whole on purpose: the engine's tests were written against them, and a check table
// with a derived path (`dependsOn`/`pathFrom`), JSON-shape assertions, identity markers and a redirect
// contract exercises every branch of the evaluator. A project's own checks live in
// prod-smoke.checks.mjs (see prod-smoke.checks.example.mjs); this file is test data.

import { JS_MEDIA_TYPES } from './prod-smoke.mjs';

export const BASE = 'https://shop.example.test';

/**
 * Pure: the `items` array from a UCP catalog body, or null when the body is not parseable as one.
 * Separate from firstShopSlug so callers can tell "no items at all" (we cannot pick a shop to
 * check) apart from "items exist but none has a shop" (we observed the defect).
 */
export function parseCatalogItems(body) {
  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return null;
  }
  return Array.isArray(parsed?.items) ? parsed.items : null;
}

/**
 * Pure: pull the first non-empty `shop.slug` out of a UCP catalog response body.
 * Returns null for anything unparseable or empty — the caller decides whether that is a failure
 * or an unavailability, because those are different facts.
 */
export function firstShopSlug(body) {
  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return null;
  }
  const items = parsed?.items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const slug = item?.shop?.slug;
    if (typeof slug === 'string' && slug.length > 0) return slug;
  }
  return null;
}

// The checks, in the order the daily routine reports them. `expect` is declarative so the pure
// evaluator below can be unit-tested without a network: `status` is required; `location` asserts a
// redirect target; `bodyIncludes`/`bodyExcludes` assert page identity.
export const CHECKS = [
  {
    id: 'embed-js',
    name: 'embed.js',
    path: '/embed.js',
    // A 200 alone would pass an HTML error page served where a script belongs — the browser would
    // fail to parse it and every embedded shop would go dark while this check stayed green. Same
    // reasoning as the selector/marketplace markers below: a status proves something answered.
    // An ARRAY of acceptable substrings, because the JS media types are a set, not one string:
    // `text/ecmascript` and `application/ecmascript` are valid and functional, and demanding the
    // literal "javascript" would redden a working loader over a server-side MIME preference.
    //
    // The body markers are the loader's actual API SURFACE — the custom elements a seller's page
    // depends on. Without them a 200 with an empty or truncated body passed as healthy while
    // embedded shops received no usable loader. Custom-element names survive minification because
    // the DOM registers them by string, which is what makes them a durable marker rather than a
    // fragile one.
    expect: {
      status: 200,
      mediaTypeIn: JS_MEDIA_TYPES,
      bodyIncludes: ['customElements', 'acme-buy-button'],
    },
    why: 'The embed loader every seller-site iframe pulls. Dead loader = every embedded shop dark.',
  },
  {
    id: 'ucp-catalog',
    name: 'UCP catalog',
    path: '/api/ucp/catalog?limit=1',
    // `bodyIsJson` because a 200 that ANNOUNCES application/json and then serves something
    // unparseable is an observed broken response, and the catalog check is where that belongs. Left
    // to the dependent embed check it surfaced as "unavailable" — a broken catalog reported as an
    // inability to look at one.
    expect: { status: 200, mediaTypeIsJson: true, bodyIsJson: true },
    why: 'The agent-readable catalog endpoint. Also the source of the embed check\'s shop slug.',
  },
  {
    id: 'ucp-manifest',
    name: 'UCP manifest',
    path: '/api/ucp/manifest',
    // STRUCTURAL, not substring: `{"error":"acme-ucp unavailable"}` contains the
    // identifier while being the opposite of a healthy manifest. Assert the field's VALUE.
    expect: {
      status: 200,
      mediaTypeIsJson: true,
      bodyIsJson: true,
      bodyJsonMatches: { name: 'acme-ucp' },
      // The name alone would pass a manifest stripped of everything an agent actually needs. These
      // ARE the discovery contract this check claims to protect: the capability an agent looks for
      // and the endpoint map it navigates by.
      bodyJsonIncludes: { capabilities: ['catalog_search'] },
      // The declared TYPE matters: `endpoints: "garbage"` is non-empty but carries no endpoint map,
      // and a bare presence check would have passed it.
      bodyJsonRequires: { endpoints: 'object' },
      // A non-empty endpoints object is not the same as a USABLE one: `{garbage:true}` satisfied
      // "non-empty" while carrying no way to reach the catalog. The catalog endpoint and its URL
      // ARE what an agent navigates by, so they are what the check asserts.
      bodyJsonPaths: { 'endpoints.catalog.url': 'string' },
    },
    why: 'The UCP discovery document — how an agent learns the catalog exists.',
  },
  {
    id: 'embed-iframe',
    name: 'embed iframe',
    // Derived, not hardcoded: the slug comes from the catalog's first item, so this check also
    // re-exercises the shop-attribution join. That derivation is load-bearing history — an empty
    // `shop.slug` made this resolve to `/embed/s/` and 308, which is how the orphan defect was
    // caught (catalog-orphan-listing-sweep). A hardcoded slug would not have caught it.
    dependsOn: 'ucp-catalog',
    pathFrom: (catalogBody) => {
      const items = parseCatalogItems(catalogBody);
      // Unparseable JSON can no longer reach here — the catalog check now fails on it, so this
      // branch means parseable JSON with no `items` array at all: an observed schema defect.
      if (items === null) return { failed: 'catalog response has no items array — schema defect' };
      if (items.length === 0) return { unavailable: 'catalog returned no items to embed' };

      const slug = firstShopSlug(catalogBody);
      // A blank slug is an OBSERVED DEFECT, not an inability to observe. We looked and saw the
      // catalog emitting shopless items — the exact orphan-attribution signature that made
      // `/embed/s/` + '' resolve to a slugless path and 308. Reporting it as "unavailable" would
      // be a detection REGRESSION against the watchdog this replaces, which went red on it.
      if (!slug) {
        return { failed: 'every catalog item has a blank shop.slug — the orphan-attribution defect signature' };
      }
      // The slug is also the page-identity marker: it proves THE REQUESTED shop rendered, not a
      // generic 200 page that happens to carry a permissive CSP.
      // `prod_` proves the embed actually RENDERED the shop's listings; the slug alone would pass
      // any generic page that merely echoed it back. The slug came from a catalog item belonging to
      // this shop, so the shop is known to have at least one product to render.
      return { path: `/embed/s/${slug}`, expect: { bodyIncludes: [slug, 'prod_'] } };
    },
    // Framing is the half of this check that makes the iframe actually embeddable — the orphan
    // sweep named its absence alongside the 308 as what a seller would experience.
    //
    // `framesFromAnywhere` parses the directive rather than substring-matching it, because
    // `frame-ancestors 'none'` and `frame-ancestors *.example.com` both CONTAIN the text
    // "frame-ancestors" (and the latter even contains "frame-ancestors *") while forbidding
    // exactly the third-party framing this check exists to prove. A check whose text and whose
    // effect name different things is decoration.
    expect: {
      status: 200,
      mediaTypeIn: ['text/html'],
      framesFromAnywhere: true,
    },
    why: 'A seller embedding their storefront on their own site. 308 here = broken iframe.',
  },
  {
    id: 'market-selector',
    name: 'market selector (/)',
    path: '/',
    // `href="/us"` is the selector's identity: it is the only page that offers the US door. Chosen
    // over a <title> match because copy gets edited and a guard that reddens on a copy tweak trains
    // people to bypass it (AGENTS.md). This marker tracks the market registry instead.
    expect: { status: 200, bodyIncludes: ['href="/us"'] },
    why: 'Post-cutover `/` is the master-brand selector, NOT the marketplace. Status alone cannot tell them apart.',
  },
  {
    id: 'mx-marketplace',
    name: 'MX marketplace (/mx)',
    path: '/mx',
    // `home-hero` is PAGE-SPECIFIC; `href="/mx/l"` was not. Navigation appears on every page, so a
    // wrong-page error shell carrying only a nav bar passed this check — silently green-lighting
    // the exact regression class this watchdog exists to catch. The testid is structural, stable
    // (the Playwright specs depend on it) and independent of both the catalog and the flags.
    //
    // The negative marker still pins it apart from the selector. If a market switcher ever
    // legitimately lands on /mx, THAT is a deliberate review moment, not a silent green.
    expect: {
      status: 200,
      bodyIncludes: ['data-testid="home-hero"'],
      bodyExcludes: ['href="/us"'],
    },
    why: 'The live Mexico marketplace. Lost all smoke coverage at the 07-31 cutover — this restores it.',
  },
  {
    id: 'browse-redirect',
    name: 'browse redirect (/l → /mx/l)',
    path: '/l',
    // The redirect is itself a shipped live contract (market-architecture-foundation D8, the
    // highest-risk edit in that epic) and had no guard anywhere. Asserting it is strictly MORE
    // coverage than the old bare `/l` → 200 check, not less.
    expect: { status: 308, location: '/mx/l' },
    why: 'Old bookmarks, inbound links and the pre-cutover sitemap all still point at /l.',
  },
  {
    id: 'mx-browse',
    name: 'MX browse (/mx/l)',
    path: '/mx/l',
    // A PRODUCT link, not a nav link. `href="/mx/l` appears in the nav of every page, so the old
    // marker would have passed an error shell that merely carried navigation. A browse page whose
    // grid is empty is itself worth alerting on — that is the page's entire purpose.
    expect: { status: 200, bodyIncludes: ['href="/mx/l/prod_'] },
    why: 'The browse page itself — what /l used to serve, and what buyers actually land on.',
  },
];
