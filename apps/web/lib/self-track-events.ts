// The event vocabulary of the self-tracking funnels, as PURE DATA.
//
// ── Why this is its own file ──────────────────────────────────────────────────────────────────
// `lib/self-track.ts` starts with `import 'server-only'`, which is correct — it holds a
// service-key-bearing send path that must never reach a client bundle. It also means nothing that
// imports it can be loaded by a Playwright spec or a unit test: the runner throws
// `Cannot find module 'server-only'` before a single assertion runs.
//
// Story 4.1's spec has to read `feature_id` out of the database and compare it against the SAME
// constant the app writes — comparing against a re-typed string literal would be two lists that
// must agree, in a spec whose entire subject is a mapping that was silently wrong in production for
// months. So the vocabulary lives here, with zero imports, and `self-track.ts` consumes it.
//
// This is the LEARNINGS rule stated for constants rather than for functions: a pure value that a
// test needs cannot live in a file that imports a runtime-only module.

// The funnel's two events: entry (targetEvent) and conversion (adoptedEvent). Exported so the
// beacon route, the waitlist route, and the seed script's registry entry all name them from one
// place — no stringly-typed drift between what we fire and what the Grower signal is defined on.
export const LANDING_VISITED_EVENT = 'landing_visited'
export const WAITLIST_JOINED_EVENT = 'waitlist_joined'

// multi-tenant-activation · Sprint 2/3 — the ACTIVATION funnel, the second funnel this tenant
// measures (epic README: "Success includes a dogfooded signup→activated funnel rendered by the
// engine itself"). Three stages, fired from three different places in the flow:
//   signup_started       — a signup submission passed the gate + guards (public signup route)
//   account_confirmed    — the email round-trip completed and a tenant was provisioned (callback)
//   first_event_ingested — that new tenant's very first event landed (the ingest route)
export const SIGNUP_STARTED_EVENT = 'signup_started'
export const ACCOUNT_CONFIRMED_EVENT = 'account_confirmed'
export const FIRST_EVENT_INGESTED_EVENT = 'first_event_ingested'

// pod-report · Sprint 3, Story 3.2 — the hub/report surfaces measured BY THE ENGINE ITSELF ("we
// sell what we use"). Two events, deliberately with two different notions of "user":
//   report_viewed — a person opened the internal Pod Report. Fired only when the visitor cookie is
//                   already present, never with a freshly invented id: TARS counts DISTINCT users
//                   (lib/tars.ts), so minting a random id per view would turn a page-view counter
//                   into a fake audience-size number.
//   share_viewed  — a SHARE LINK was opened. The "user" here is the share row id, so `targeted`
//                   reads as "distinct links opened", which is the honest unit for a bearer URL
//                   that may be forwarded to a room full of people from one email. Stated here
//                   because a reader of the funnel would otherwise assume "people".
export const REPORT_VIEWED_EVENT = 'report_viewed'
export const SHARE_VIEWED_EVENT = 'share_viewed'

// methodology-experience · Sprint 4, Story 4.1 — the methodology reader becomes evidence.
//   methodology_visited        — the index was opened
//   methodology_chapter_opened — any chapter was opened
//
// TWO events and not seven: a per-chapter event name would make the funnel's "adopted" count mean
// "opened chapter 3 specifically", which is not the question anyone has. Which chapter it was rides
// as a PROPERTY, so the funnel stays answerable ("did readers get past the index?") while the
// detail survives for anyone who wants it.
export const METHODOLOGY_VISITED_EVENT = 'methodology_visited'
export const METHODOLOGY_CHAPTER_OPENED_EVENT = 'methodology_chapter_opened'

export type SelfTrackEvent =
  | typeof LANDING_VISITED_EVENT
  | typeof WAITLIST_JOINED_EVENT
  | typeof SIGNUP_STARTED_EVENT
  | typeof ACCOUNT_CONFIRMED_EVENT
  | typeof FIRST_EVENT_INGESTED_EVENT
  | typeof REPORT_VIEWED_EVENT
  | typeof SHARE_VIEWED_EVENT
  | typeof METHODOLOGY_VISITED_EVENT
  | typeof METHODOLOGY_CHAPTER_OPENED_EVENT

// The TARS feature each funnel event belongs to. Registered on the self tenant by
// scripts/seed-self-project.mjs.
export const WAITLIST_SIGNAL_KEY = 'waitlist_conversion'
export const ACTIVATION_SIGNAL_KEY = 'activation'
/** pod-report S3.2 — registered on the self tenant by scripts/seed-self-project.mjs. */
export const HUB_ENGAGEMENT_SIGNAL_KEY = 'hub_engagement'
/** methodology-experience S4.1 — registered on the self tenant by scripts/seed-self-project.mjs. */
export const METHODOLOGY_SIGNAL_KEY = 'methodology_reading'

// ⚠️ THIS MAPPING IS LOAD-BEARING, AND ITS ABSENCE WAS A LIVE PRODUCTION BUG.
//
// lib/tars-query.ts reads a funnel with `.eq('feature_id', featureKey)` — so an event with a NULL
// feature_id belongs to NO funnel and is invisible to every dashboard, forever. Until this map
// existed, trackSelfEvent() fired every event untagged: checked against production 2026-07-20, all
// four `landing_visited` rows on the `golden-beans` tenant had `feature_id = NULL`, which means the
// landing dogfood funnel commercial-shell Sprint 3 shipped has been rendering a permanent zero
// since it launched. Nothing errored; the events were ingested perfectly and simply counted toward
// nothing (cross-review, Codex 2026-07-20 — raised against the NEW activation funnel, which would
// have shipped with the identical defect).
//
// This is the growth-engine-v1 S4 "realistic input" lesson recurring in a third place: a query
// that silently requires a tag the caller had no reason to set produces an honest-looking zero
// rather than an error, and zeros do not page anyone.
export const EVENT_FEATURE: Record<SelfTrackEvent, string> = {
  [LANDING_VISITED_EVENT]: WAITLIST_SIGNAL_KEY,
  [WAITLIST_JOINED_EVENT]: WAITLIST_SIGNAL_KEY,
  [SIGNUP_STARTED_EVENT]: ACTIVATION_SIGNAL_KEY,
  [ACCOUNT_CONFIRMED_EVENT]: ACTIVATION_SIGNAL_KEY,
  [FIRST_EVENT_INGESTED_EVENT]: ACTIVATION_SIGNAL_KEY,
  // Every event MUST appear here. An event missing from this map ingests perfectly and counts
  // toward nothing, forever — the live production bug documented above.
  //
  // This is not left to discipline: the `Record<SelfTrackEvent, string>` annotation on this const
  // makes a missing row a BUILD error, so adding an event to the union without a row here cannot
  // reach production. (A separate `satisfies`-style assertion was drafted here and deleted — it
  // restated what the annotation already enforces, which is a guard that cannot fail.)
  [REPORT_VIEWED_EVENT]: HUB_ENGAGEMENT_SIGNAL_KEY,
  [SHARE_VIEWED_EVENT]: HUB_ENGAGEMENT_SIGNAL_KEY,
  [METHODOLOGY_VISITED_EVENT]: METHODOLOGY_SIGNAL_KEY,
  [METHODOLOGY_CHAPTER_OPENED_EVENT]: METHODOLOGY_SIGNAL_KEY,
}
