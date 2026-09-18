import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_PREFIX,
  buildReportLink,
  contentSuffix,
  dailyStorySlug,
  dateStamp,
  liveObjectPath,
  objectPathForSlug,
  pmoMonthlySlug,
  pmoSheetSlug,
  pmoWeeklySlug,
  publishLiveArtifact,
  registryUrl,
  resolveBucket,
  sanitizeSlugPart,
  shouldFallbackToUrlHash,
  slugForArtifact,
  uploadReportPayload,
  uploadViaGcloud,
  uploadViaRest,
  upgradeArtifactLinks,
} from './report-registry.mjs';

// The project's registry — in a real project these come from reporting.config.json → artifacts.registry.
const RESOLVER_BASE_URL = 'https://viewer.example.test';
const BUCKET = 'example-reports';
const REGISTRY = { baseUrl: RESOLVER_BASE_URL, bucket: BUCKET };

// ---- pure: dates + content suffix ----------------------------------------------------------------

test('dateStamp is UTC-stable regardless of local time-of-day components', () => {
  assert.equal(dateStamp(new Date('2026-07-14T23:59:59Z')), '2026-07-14');
  assert.equal(dateStamp(new Date('2026-01-05T00:00:00Z')), '2026-01-05');
});

test('contentSuffix is deterministic and differs for different content', () => {
  const a = contentSuffix('# report one');
  const b = contentSuffix('# report two');
  assert.equal(a, contentSuffix('# report one'));
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{6}$/);
});

test('contentSuffix tolerates null/undefined content', () => {
  assert.match(contentSuffix(undefined), /^[0-9a-f]{6}$/);
});

// ---- pure: slug builders ---------------------------------------------------------------------------

test('dailyStorySlug carries the UTC date and a content-derived suffix', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  const slug = dailyStorySlug({ date, markdown: '# standup' });
  assert.match(slug, /^daily-story-2026-07-14-[0-9a-f]{6}$/);
});

test('dailyStorySlug is a collision-safe suffix: different payloads same day get different slugs', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  const a = dailyStorySlug({ date, markdown: 'payload A' });
  const b = dailyStorySlug({ date, markdown: 'payload B' });
  assert.notEqual(a, b);
});

test('dailyStorySlug is idempotent for the SAME payload on the SAME day (re-run overwrites, no dup)', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  assert.equal(
    dailyStorySlug({ date, markdown: 'identical payload' }),
    dailyStorySlug({ date, markdown: 'identical payload' })
  );
});

test('pmoWeeklySlug/pmoMonthlySlug/pmoSheetSlug are one stable slug per UTC day, no suffix', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  assert.equal(pmoWeeklySlug({ date }), 'pmo-weekly-2026-07-14');
  assert.equal(pmoMonthlySlug({ date }), 'pmo-monthly-2026-07-14');
  assert.equal(pmoSheetSlug({ date }), 'pmo-sheet-2026-07-14');
});

test("slugForArtifact dispatches by the report scripts' own artifact names", () => {
  const date = new Date('2026-07-14T05:00:00Z');
  assert.match(
    slugForArtifact({ name: 'standup', date, markdown: 'x' }),
    /^daily-story-2026-07-14-[0-9a-f]{6}$/
  );
  assert.equal(slugForArtifact({ name: 'weekly', date, markdown: 'x' }), 'pmo-weekly-2026-07-14');
  assert.equal(slugForArtifact({ name: 'monthly', date, markdown: 'x' }), 'pmo-monthly-2026-07-14');
  assert.equal(slugForArtifact({ name: 'sheet', date, markdown: 'x' }), 'pmo-sheet-2026-07-14');
});

test('slugForArtifact degrades to a safe packet-shaped slug for an unrecognized name instead of throwing', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  const slug = slugForArtifact({ name: 'mystery', date, markdown: 'x' });
  assert.match(slug, /^mystery-2026-07-14-[0-9a-f]{6}$/);
});

test('slugForArtifact sanitizes an unrecognized name before building the fallback slug', () => {
  const date = new Date('2026-07-14T05:00:00Z');
  const slug = slugForArtifact({ name: 'Weird Name!! With Spaces', date, markdown: 'x' });
  assert.match(slug, /^weird-name-with-spaces-2026-07-14-[0-9a-f]{6}$/);
});

// ---- pure: slug-part sanitization ---------------------------------------------------------------

test('sanitizeSlugPart lowercases and collapses anything outside [a-z0-9-] to a single dash', () => {
  assert.equal(sanitizeSlugPart('Weird Name!!'), 'weird-name');
  assert.equal(sanitizeSlugPart('a__b//c'), 'a-b-c');
  assert.equal(sanitizeSlugPart('  leading and trailing  '), 'leading-and-trailing');
  assert.equal(sanitizeSlugPart('already-clean-123'), 'already-clean-123');
});

test('sanitizeSlugPart falls back to "report" when sanitizing empties the string', () => {
  assert.equal(sanitizeSlugPart('!!!'), 'report');
  assert.equal(sanitizeSlugPart(''), 'report');
  assert.equal(sanitizeSlugPart(undefined), 'report');
});

// ---- pure: object-path mapping (must match infra/gcp/provision-report-registry.sh's lifecycle rule) ---

test('objectPathForSlug: daily-* slugs live under daily/ (90d TTL)', () => {
  assert.equal(objectPathForSlug('daily-story-2026-07-14-a1b2c3'), 'daily/daily-story-2026-07-14-a1b2c3.md');
});

test('objectPathForSlug: everything else lives under packets/ (kept forever)', () => {
  assert.equal(objectPathForSlug('pmo-weekly-2026-07-14'), 'packets/pmo-weekly-2026-07-14.md');
  assert.equal(objectPathForSlug('pmo-monthly-2026-07-14'), 'packets/pmo-monthly-2026-07-14.md');
  assert.equal(objectPathForSlug('pmo-sheet-2026-07-14'), 'packets/pmo-sheet-2026-07-14.md');
  assert.equal(objectPathForSlug('mystery-2026-07-14-abc123'), 'packets/mystery-2026-07-14-abc123.md');
});

// ---- pure: URL building + bucket resolution --------------------------------------------------------

test('registryUrl builds the hub short link', () => {
  assert.equal(
    registryUrl({ slug: 'pmo-weekly-2026-07-14', baseUrl: 'https://example.test' }),
    'https://example.test/r/pmo-weekly-2026-07-14'
  );
});

test('resolveBucket has NO default — unset means the registry is off; config then env override', () => {
  assert.equal(resolveBucket({}), null);
  assert.equal(resolveBucket({}, BUCKET), BUCKET);
  assert.equal(resolveBucket({ REPORT_REGISTRY_BUCKET: 'reports-staging' }, BUCKET), 'reports-staging');
});

test('buildReportLink with no registry configured uploads nothing and keeps the fallback link', async () => {
  let called = false;
  const fallbackUrl = 'https://viewer.example.test/#md=x';
  for (const partial of [{}, { bucket: BUCKET }, { baseUrl: RESOLVER_BASE_URL, bucket: null }]) {
    const result = await buildReportLink({
      name: 'weekly',
      markdown: 'x',
      fallbackUrl,
      date: new Date('2026-07-14T05:00:00Z'),
      ...partial,
      uploader: async () => {
        called = true;
        return { ok: true };
      },
    });
    assert.equal(result.url, fallbackUrl);
    assert.equal(result.usedRegistry, false);
    assert.equal(result.reason, 'registry-not-configured');
  }
  assert.equal(called, false, 'an unconfigured registry must never upload');
});

// ---- pure: fallback decision ------------------------------------------------------------------------

test('shouldFallbackToUrlHash: true unless the upload explicitly succeeded', () => {
  assert.equal(shouldFallbackToUrlHash({ ok: true }), false);
  assert.equal(shouldFallbackToUrlHash({ ok: false, reason: 'no-credentials' }), true);
  assert.equal(shouldFallbackToUrlHash(null), true);
  assert.equal(shouldFallbackToUrlHash(undefined), true);
});

// ---- orchestration (buildReportLink / upgradeArtifactLinks) with an INJECTED fake uploader ----------
// No live network/gcloud calls anywhere in this file — `uploader` is always a fake.

test('buildReportLink returns the short registry link when the upload succeeds', async () => {
  const errors = [];
  const result = await buildReportLink({
    ...REGISTRY,
    name: 'weekly',
    markdown: '# weekly report',
    fallbackUrl: 'https://viewer.example.test/#md=fallback',
    date: new Date('2026-07-14T05:00:00Z'),
    uploader: async () => ({ ok: true }),
    logError: (msg) => errors.push(msg),
  });
  assert.equal(result.usedRegistry, true);
  assert.equal(result.url, `${RESOLVER_BASE_URL}/r/pmo-weekly-2026-07-14`);
  assert.equal(result.slug, 'pmo-weekly-2026-07-14');
  assert.equal(errors.length, 0);
});

test('buildReportLink falls back to the URL-hash link on upload failure and logs to stderr', async () => {
  const errors = [];
  const fallbackUrl = 'https://viewer.example.test/#md=fallback';
  const result = await buildReportLink({
    ...REGISTRY,
    name: 'standup',
    markdown: '# standup',
    fallbackUrl,
    date: new Date('2026-07-14T05:00:00Z'),
    uploader: async () => ({ ok: false, reason: 'no-credentials' }),
    logError: (msg) => errors.push(msg),
  });
  assert.equal(result.usedRegistry, false);
  assert.equal(result.url, fallbackUrl);
  assert.equal(result.reason, 'no-credentials');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no-credentials/);
  assert.match(errors[0], /falling back to the URL-hash link/);
});

test('buildReportLink never throws when the uploader itself REJECTS — falls back to the URL-hash link', async () => {
  // uploadReportPayload's real implementation never rejects (every branch is try/caught), but a caller
  // wiring in a bad/unusual uploader shouldn't be able to crash a report script either — the "any
  // failure falls back" contract has to hold whether the uploader resolves `{ ok: false }` OR rejects.
  const errors = [];
  const fallbackUrl = 'https://example.test/#md=x';
  const result = await buildReportLink({
    ...REGISTRY,
    name: 'weekly',
    markdown: 'x',
    fallbackUrl,
    date: new Date('2026-07-14T05:00:00Z'),
    uploader: async () => {
      throw new Error('boom');
    },
    logError: (msg) => errors.push(msg),
  });
  assert.equal(result.usedRegistry, false);
  assert.equal(result.url, fallbackUrl);
  assert.match(result.reason, /uploader-threw/);
  assert.match(result.reason, /boom/);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /falling back to the URL-hash link/);
});

// ---- dry-run: must never call the uploader, but still logs the would-be slug/link -------------------

test('buildReportLink dry-run never calls the uploader and keeps the URL-hash fallback', async () => {
  const errors = [];
  const infos = [];
  let uploaderCalled = false;
  const fallbackUrl = 'https://example.test/#md=fallback';
  const result = await buildReportLink({
    ...REGISTRY,
    name: 'standup',
    markdown: '# standup',
    fallbackUrl,
    date: new Date('2026-07-14T05:00:00Z'),
    dryRun: true,
    uploader: async () => {
      uploaderCalled = true;
      return { ok: true };
    },
    logError: (msg) => errors.push(msg),
    logInfo: (msg) => infos.push(msg),
  });
  assert.equal(uploaderCalled, false, 'dry run must never call the uploader');
  assert.equal(result.usedRegistry, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.url, fallbackUrl);
  assert.equal(errors.length, 0);
  assert.equal(infos.length, 1);
  assert.match(infos[0], /dry run/);
  assert.match(infos[0], /daily-story-2026-07-14-[0-9a-f]{6}/);
});

test('upgradeArtifactLinks forwards dryRun to every artifact, uploading none of them', async () => {
  const artifacts = [
    { name: 'weekly', markdown: '# weekly', url: 'https://example.test/#md=weekly-fallback' },
    { name: 'sheet', markdown: '# sheet', url: 'https://example.test/#md=sheet-fallback' },
  ];
  let calls = 0;
  await upgradeArtifactLinks(artifacts, {
    ...REGISTRY,
    date: new Date('2026-07-14T05:00:00Z'),
    dryRun: true,
    uploader: async () => {
      calls += 1;
      return { ok: true };
    },
    logInfo: () => {},
  });
  assert.equal(calls, 0);
  assert.equal(artifacts[0].url, 'https://example.test/#md=weekly-fallback');
  assert.equal(artifacts[1].url, 'https://example.test/#md=sheet-fallback');
  assert.equal(artifacts[0].usedRegistry, false);
  assert.equal(artifacts[1].usedRegistry, false);
});

test('upgradeArtifactLinks upgrades a successful upload and preserves the fallback on failure, per-artifact', async () => {
  const artifacts = [
    { name: 'weekly', markdown: '# weekly', url: 'https://example.test/#md=weekly-fallback' },
    { name: 'sheet', markdown: '# sheet', url: 'https://example.test/#md=sheet-fallback' },
  ];
  const errors = [];
  const uploader = async ({ slug }) =>
    slug.startsWith('pmo-weekly') ? { ok: true } : { ok: false, reason: 'boom' };
  const result = await upgradeArtifactLinks(artifacts, {
    ...REGISTRY,
    date: new Date('2026-07-14T05:00:00Z'),
    uploader,
    logError: (msg) => errors.push(msg),
  });
  assert.equal(result, artifacts); // mutates + returns the same array
  assert.equal(artifacts[0].usedRegistry, true);
  assert.equal(artifacts[0].url, `${RESOLVER_BASE_URL}/r/pmo-weekly-2026-07-14`);
  assert.equal(artifacts[1].usedRegistry, false);
  assert.equal(artifacts[1].url, 'https://example.test/#md=sheet-fallback');
  assert.equal(errors.length, 1);
});

// ---- overwrite protection: an existing object at this slug is treated as SUCCESS, never replaced ----
// No live network/gcloud calls — fetchImpl/spawnSyncImpl are always fakes here too.

test('uploadViaRest sends x-goog-if-generation-match: 0 (never overwrite an existing object)', async () => {
  let seenHeaders;
  await uploadViaRest({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    token: 'tok',
    fetchImpl: async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(seenHeaders['x-goog-if-generation-match'], '0');
});

test('uploadViaRest treats a 412 (object already exists) as success, not a failure', async () => {
  const result = await uploadViaRest({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    token: 'tok',
    fetchImpl: async () => ({ ok: false, status: 412 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'already-exists');
});

test('uploadViaRest still fails on a genuine non-412 error', async () => {
  const result = await uploadViaRest({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    token: 'tok',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /rest-upload-http-403/);
});

test('uploadViaGcloud passes --if-generation-match=0 (never overwrite an existing object)', () => {
  let seenArgs;
  uploadViaGcloud({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    spawnSyncImpl: (cmd, args) => {
      seenArgs = args;
      return { status: 0 };
    },
  });
  assert.ok(seenArgs.includes('--if-generation-match=0'));
});

test('uploadViaGcloud treats a precondition-failure stderr as success, not a failure', () => {
  const result = uploadViaGcloud({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    spawnSyncImpl: (cmd, args) => {
      if (args[0] === '--version') return { status: 0 };
      return { status: 1, stderr: 'PreconditionException: 412 Precondition Failed' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'already-exists');
});

test('uploadViaGcloud still fails on a genuine non-precondition error', () => {
  const result = uploadViaGcloud({
    bucket: 'b',
    objectPath: 'daily/x.md',
    markdown: '# x',
    spawnSyncImpl: (cmd, args) => {
      if (args[0] === '--version') return { status: 0 };
      return { status: 1, stderr: 'ERROR: (gcloud.storage.cp) 403 Forbidden' };
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /gcloud-cp-failed/);
  assert.match(result.reason, /403 Forbidden/);
});

// ---- Story 2.1: live/ objects — allowOverwrite skips the never-overwrite precondition ----------------

test('liveObjectPath lives under live/, sanitizes the key, and defaults to a .json extension', () => {
  assert.equal(liveObjectPath('roadmap-status'), `${LIVE_PREFIX}roadmap-status.json`);
  assert.equal(liveObjectPath('Weird Key!!', 'md'), `${LIVE_PREFIX}weird-key.md`);
});

test('uploadViaRest with allowOverwrite:true omits the x-goog-if-generation-match header', async () => {
  let seenHeaders;
  const result = await uploadViaRest({
    bucket: 'b',
    objectPath: 'live/roadmap-status.json',
    markdown: '{}',
    token: 'tok',
    allowOverwrite: true,
    fetchImpl: async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal('x-goog-if-generation-match' in seenHeaders, false);
});

test('uploadViaRest respects a custom contentType', async () => {
  let seenHeaders;
  await uploadViaRest({
    bucket: 'b',
    objectPath: 'live/x.json',
    markdown: '{}',
    token: 'tok',
    contentType: 'application/json; charset=utf-8',
    allowOverwrite: true,
    fetchImpl: async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(seenHeaders['Content-Type'], 'application/json; charset=utf-8');
});

test('uploadViaGcloud with allowOverwrite:true omits --if-generation-match=0', () => {
  let seenArgs;
  uploadViaGcloud({
    bucket: 'b',
    objectPath: 'live/x.json',
    markdown: '{}',
    allowOverwrite: true,
    spawnSyncImpl: (cmd, args) => {
      seenArgs = args;
      return { status: 0 };
    },
  });
  assert.equal(seenArgs.includes('--if-generation-match=0'), false);
});

test('default uploadViaRest/uploadViaGcloud calls are unaffected (allowOverwrite defaults to false)', async () => {
  let seenHeaders;
  await uploadViaRest({
    bucket: 'b',
    objectPath: 'packets/x.md',
    markdown: '# x',
    token: 'tok',
    fetchImpl: async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(seenHeaders['x-goog-if-generation-match'], '0');

  let seenArgs;
  uploadViaGcloud({
    bucket: 'b',
    objectPath: 'packets/x.md',
    markdown: '# x',
    spawnSyncImpl: (cmd, args) => {
      seenArgs = args;
      return { status: 0 };
    },
  });
  assert.ok(seenArgs.includes('--if-generation-match=0'));
});

test('uploadReportPayload accepts an objectPath override (bypasses slug->path derivation)', async () => {
  let seenPath;
  const result = await uploadReportPayload({
    bucket: 'b',
    objectPath: 'live/custom.json',
    markdown: '{}',
    env: { GOOGLE_APPLICATION_CREDENTIALS_JSON: '' },
    spawnSyncImpl: (cmd, args) => {
      seenPath = args.find((a) => a.startsWith('gs://'));
      return cmd === 'gcloud' && args[0] === '--version' ? { status: 0 } : { status: 0 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(seenPath, 'gs://b/live/custom.json');
});

// ---- publishLiveArtifact: the Story 2.1/2.2 orchestrator, no fallback-URL concept, never throws -------

test('publishLiveArtifact uploads to live/<key>.<ext> with allowOverwrite:true', async () => {
  let seenArgs;
  const result = await publishLiveArtifact({
    bucket: 'b',
    key: 'roadmap-status',
    content: '{"a":1}',
    uploader: async (args) => {
      seenArgs = args;
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.objectPath, 'live/roadmap-status.json');
  assert.equal(seenArgs.allowOverwrite, true);
  assert.equal(seenArgs.objectPath, 'live/roadmap-status.json');
  assert.equal(seenArgs.contentType, 'application/json; charset=utf-8');
});

test('publishLiveArtifact supports a markdown ext/contentType for chart views', async () => {
  let seenArgs;
  const result = await publishLiveArtifact({
    bucket: 'b',
    key: 'pmo-live-metrics',
    content: '# chart doc',
    ext: 'md',
    uploader: async (args) => {
      seenArgs = args;
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.objectPath, 'live/pmo-live-metrics.md');
  assert.equal(seenArgs.contentType, 'text/markdown; charset=utf-8');
});

test('publishLiveArtifact degrades to { ok: false, reason } on upload failure, never throws', async () => {
  const result = await publishLiveArtifact({
    bucket: 'b',
    key: 'roadmap-status',
    content: '{}',
    uploader: async () => ({ ok: false, reason: 'no-credentials' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-credentials');
});

test('publishLiveArtifact never throws even when the uploader itself REJECTS', async () => {
  const result = await publishLiveArtifact({
    bucket: 'b',
    key: 'roadmap-status',
    content: '{}',
    uploader: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /uploader-threw/);
  assert.match(result.reason, /boom/);
});
