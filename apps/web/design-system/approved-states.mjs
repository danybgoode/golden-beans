// The 32 APPROVED states, and their ids.
//
// ── Why this is its own module ────────────────────────────────────────────────────────────────
// The ids are a CONTRACT: every story in Sprints 2-6 cites one, `route-manifest.ts` maps a route to
// one, and `console-visual.authed.spec.ts` asserts a built route against the state of the same id.
// Three consumers, so the list cannot live inside `render-reference.mjs` — that file opens a real
// browser at module scope, and importing it just to read a list of strings would launch Chromium.
//
// Adding a state here without an approval line in `APPROVED.md` is the thing Rail 2 forbids, and
// `route-manifest.test.ts` fails when this list and that file's batch table stop agreeing.
//
// The functions run INSIDE the page (`page.evaluate`), so their free identifiers - APP, render,
// openFeature, setSection, ... - are the prototype's own globals, not this module's. They are never
// called in Node, which is why this module is safe to import from a test.

export const APPROVED_STATES = [
  // ── approved 2026-08-27 (console-ia-overhaul) ────────────────────────────
  [
    'ship-features',
    () => {
      closeDoor();
      leaveHub();
      APP.section = 'ship';
      APP.rail = 'features';
      APP.dormantOpen = false;
      APP.view = 'list';
      render();
    },
  ],
  [
    'ship-features-dormant',
    () => {
      APP.dormantOpen = true;
      render();
    },
  ],
  [
    'feature-value',
    () => {
      APP.dormantOpen = false;
      render();
      openFeature('checkout.stripe_enabled', 'value');
    },
  ],
  ['feature-environments', () => openFeature('checkout.stripe_enabled', 'environments')],
  ['feature-funnel', () => openFeature('checkout.stripe_enabled', 'funnel')],
  [
    'setup-connect',
    () => {
      closeOverlay();
      setSection('setup');
      setRail('connect');
    },
  ],
  ['setup-keys', () => setRail('keys')],
  [
    'ship-activity',
    () => {
      setSection('ship');
      setRail('activity');
    },
  ],
  [
    'ship-compare',
    () => {
      setRail('features');
      APP.view = 'compare';
      render();
    },
  ],
  // ── batch 1 · Measure — approved 2026-08-29 ──────────────────────────────
  [
    'measure-north-star',
    () => {
      setSection('measure');
      setRail('overview');
    },
  ],
  ['measure-journeys', () => setRail('journeys')],
  ['measure-journey', () => openJourney('founding_merchant')],
  [
    'measure-scenarios',
    () => {
      closeJourney();
      setRail('scenarios');
    },
  ],
  ['funnel-standalone', () => openFunnelPage()],
  // ── batch 2 · Today, Ship, Setup — approved 2026-08-29 ───────────────────
  [
    'today',
    () => {
      APP.route = null;
      setSection('today');
    },
  ],
  ['tasks-standalone', () => openTasksPage()],
  [
    'ship-experiments',
    () => {
      APP.route = null;
      setSection('ship');
      setRail('experiments');
    },
  ],
  ['experiment-ready', () => openExperiment('checkout_one_page')],
  ['experiment-blocked', () => openExperiment('listing_photo_hints')],
  [
    'setup-destinations',
    () => {
      closeExperiment();
      setSection('setup');
      setRail('destinations');
    },
  ],
  ['setup-shares', () => setRail('shares')],
  // ── batch 3 · the hub — approved 2026-08-29 ──────────────────────────────
  ['hub-roadmap', () => enterHub()],
  ['hub-epic', () => openEpic('console-ia-overhaul')],
  ['hub-horizon', () => setHubTab('horizon')],
  ['hub-report', () => setHubTab('report')],
  // ── batch 4 · the doors — approved 2026-08-29 ────────────────────────────
  [
    'door-login',
    () => {
      leaveHub();
      openDoor('login');
    },
  ],
  [
    'door-signup-closed',
    () => {
      SIGNUP_OPEN = false;
      openDoor('signup');
    },
  ],
  [
    'door-signup-open',
    () => {
      SIGNUP_OPEN = true;
      render();
    },
  ],
  [
    'public-install',
    () => {
      SIGNUP_OPEN = false;
      openDoor('install');
    },
  ],
  ['public-share', () => openDoor('share')],
  ['public-gone', () => openDoor('gone')],
  ['public-talk', () => openDoor('talk')],
];

/** Just the ids, in approval order. The half every non-browser consumer needs. */
export const STATE_IDS = APPROVED_STATES.map(([id]) => id);
