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
  // ── the 33rd · approved 2026-09-09 (mockups-as-built, epic D8) ───────────
  //
  // ⚠️ **This state was DRAWN at approval time and not approved, and that gap is what the epic
  // ran into.** Every primary authoring action in the 32 — `+ New journey`, `+ New experiment`,
  // `▸ Run a drill`, `+ New destination`, `+ New key`, `+ New share link` — is a `toast()` saying
  // *"the same wizard shape as New feature"*, and that wizard was in the prototype with no
  // approval line. So the approved design drew six doors and no room behind any of them, while the
  // disclosures the epic deletes were the ONLY implementation of journey creation, experiment
  // creation, scenario launch/stop and delivery replay.
  //
  // Daniel approved it as the 33rd on 2026-09-09 rather than let those capabilities go: every
  // `+ New …` opens THIS shape as a modal over the manager component that already exists.
  //
  // Reached from wherever the previous state left the prototype — the doors are up after
  // `public-talk`, so this closes them first rather than assuming a console screen.
  [
    'wizard-new-feature',
    () => {
      closeDoor();
      leaveHub();
      closeOverlay();
      APP.route = null;
      setSection('ship');
      setRail('features');
      openWizard();
    },
  ],
];

/** Just the ids, in approval order. The half every non-browser consumer needs. */
export const STATE_IDS = APPROVED_STATES.map(([id]) => id);

// ── batch 6 · approved 2026-09-24 07:44 America/Mexico_City (experiments-for-humans, D12) ─────
//
// These run inside `approved-prototype.html`, NOT `console-prototype.html`: a second approved
// artifact with its own globals (`W`, `APP`, `CREATED`, `newDraft`, `openExp`, …). They are a
// separate list rather than extra rows above, because every consumer that loops `APPROVED_STATES`
// evaluates each function inside the console prototype, where none of these names exist — a merged
// list would throw on the first new state, or worse, run a same-named console global.
//
// They supersede `experiment-ready` / `experiment-blocked` (APPROVED.md, batch 6), which stay
// registered until Sprint 4 of that epic rebuilds the route they describe.
export const EXPERIMENT_BUILDER_STATES = [
  [
    'wizard-new-experiment',
    () => {
      W = newDraft('copy');
      APP.view = 'list';
      APP.overlay = 'builder';
      render();
      renderOverlay();
    },
  ],
  [
    'wizard-new-experiment-review',
    () => {
      W.step = 6;
      renderOverlay();
    },
  ],
  [
    // "Still gathering" — the same point the prototype's own #results hash opens on (day 9).
    'experiment-results',
    () => {
      APP.overlay = null;
      renderOverlay();
      CREATED.length = 0;
      CREATED.unshift({ key: expKey(W), w: clone({ ...W, saved: true }), status: 'running' });
      W.saved = true;
      APP.day = 9;
      APP.tab = 'results';
      openExp(CREATED[0].key);
    },
  ],
  [
    'experiment-results-ready',
    () => {
      APP.day = CREATED[0].w.weeks * 7;
      render();
    },
  ],
  [
    'experiment-decided',
    () => {
      CREATED[0].status = 'decided';
      CREATED[0].outcome = 'ship_treatment';
      CREATED[0].reason = DECISION_REASONS[0];
      render();
    },
  ],
];

/** Every approved state, grouped by the prototype file it is evaluated inside. */
export const STATE_SOURCES = [
  ['console-prototype.html', APPROVED_STATES],
  ['approved-prototype.html', EXPERIMENT_BUILDER_STATES],
];

/** Every approved id across both sources, in approval order. */
export const ALL_STATE_IDS = STATE_SOURCES.flatMap(([, states]) => states.map(([id]) => id));
