// report-registry.mjs — the report scripts' half of reporthub-as-notion Sprint 1: uploads a report
// payload to the GCS registry provisioned by the project's bucket-provisioning script (Story 1.1) and
// returns a short `/r/<slug>` link served by the project's doc-viewer resolver (Story 1.2). On
// ANY failure — no credentials, no `gcloud`, a rejected upload, an unreachable bucket — this degrades to
// the caller's already-computed URL-hash link (LEARNINGS soft-mode pattern: standup.mjs/weekly-recap.mjs
// already do this for a missing/wiped delta-log baseline; this is the same discipline applied to a new
// failure mode). Callers keep building the URL-hash link first (scripts/lib/pmo-templates.mjs's
// buildDocViewerUrl) — this module only ever *upgrades* that link, never replaces the guaranteed fallback.
//
// The resolver URL and bucket are the PROJECT's (reporting.config.json → artifacts.registry). Unset, the
// registry is simply off: buildReportLink returns the fallback with reason `registry-not-configured` and
// uploads nothing. There is deliberately no default bucket — a default is one project's storage.
//
// Slug -> object path convention (matches the project's bucket-provisioning script's lifecycle rule and
// the fork's /r/<slug> resolver EXACTLY — a change here needs the same-wave change called out in
// the project's registry-invariants test):
//   daily-story-YYYY-MM-DD-<hash6>  -> daily/daily-story-YYYY-MM-DD-<hash6>.md   (90d TTL)
//   pmo-weekly-YYYY-MM-DD           -> packets/pmo-weekly-YYYY-MM-DD.md          (kept forever)
//   pmo-monthly-YYYY-MM-DD          -> packets/pmo-monthly-YYYY-MM-DD.md         (kept forever)
//   pmo-sheet-YYYY-MM-DD            -> packets/pmo-sheet-YYYY-MM-DD.md           (kept forever)
// Any other slug that doesn't start with "daily-" also lands under packets/ — the daily/ prefix is the
// only thing the lifecycle rule keys off, so anything not explicitly daily must default to "kept forever".
//
// Zero new deps: the credentialed upload path signs a service-account JSON key's JWT with node:crypto,
// exchanges it for an OAuth token, and PUTs straight to the storage.googleapis.com JSON API — no
// google-cloud/storage package. A `gcloud storage cp` fallback covers local/interactive runs that already
// have Application Default Credentials but no service-account key file at hand.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const DAILY_PREFIX = 'daily/';
export const PACKETS_PREFIX = 'packets/';
// reporthub-as-notion S2.1: a THIRD prefix for artifacts that need to be repeatedly overwritten in
// place at a stable, well-known key (a live JSON/markdown snapshot the hub reads on every page load) —
// unlike daily/ and packets/ objects, which are one-shot immutable artifacts protected by
// `if-generation-match: 0` (see uploadViaRest/uploadViaGcloud below), live/ objects are written with
// `allowOverwrite: true` and are expected to change on every publish run. Not covered by the bucket's
// 90d lifecycle rule (the project's bucket-provisioning script only expires daily/ — a live/ object is a
// single small rolling snapshot, not an accumulating log, so "kept forever" is fine and matches
// packets/'s default).
export const LIVE_PREFIX = 'live/';

const GCS_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ---------------------------------------------------------------------------------------------------
// Pure — slug generation, path mapping, URL building, the fallback decision. No I/O; fully unit-testable
// without a live bucket/credentials (LEARNINGS: keep the auth/upload plumbing separate from the logic a
// regression test should pin).
// ---------------------------------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

// UTC date, not local — routine runs execute in an unknown timezone; a UTC-stable slug means the same
// calendar instant always produces the same daily/packet key regardless of where the script executes.
export function dateStamp(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// A short, deterministic, collision-safe suffix derived from the payload's own content (FNV-1a, 32-bit,
// hex — no crypto module needed for a non-adversarial collision-avoidance hash). Two different reports
// generated on the same UTC day get different suffixes; the SAME report content re-uploaded on the same
// day reproduces the SAME slug, which makes an accidental double-run idempotent (overwrite, not a stray
// duplicate object) instead of minting a fresh throwaway link each retry.
export function contentSuffix(content) {
  let hash = 0x811c9dc5;
  const s = String(content ?? '');
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

// Slug builders — one per artifact kind the report scripts emit today. `daily-story` is the ONLY kind
// that carries a collision suffix + lands under daily/; every packet kind is a stable one-per-day slug
// under packets/ (a same-day re-run intentionally overwrites the same object — packets are the
// "kept forever" canonical link for that day, not a throwaway).
export function dailyStorySlug({ date = new Date(), markdown = '' } = {}) {
  return `daily-story-${dateStamp(date)}-${contentSuffix(markdown)}`;
}

export function pmoWeeklySlug({ date = new Date() } = {}) {
  return `pmo-weekly-${dateStamp(date)}`;
}

export function pmoMonthlySlug({ date = new Date() } = {}) {
  return `pmo-monthly-${dateStamp(date)}`;
}

export function pmoSheetSlug({ date = new Date() } = {}) {
  return `pmo-sheet-${dateStamp(date)}`;
}

const SLUG_BUILDERS = {
  standup: dailyStorySlug,
  'daily-story': dailyStorySlug,
  weekly: pmoWeeklySlug,
  monthly: pmoMonthlySlug,
  sheet: pmoSheetSlug,
};

// Pure — lowercases and collapses anything outside [a-z0-9-] to a single '-' (leading/trailing dashes
// trimmed). Only used for the UNRECOGNIZED-name fallback slug below: a caller-supplied artifact `name`
// is developer-controlled today, but a future artifact kind (or a typo) could carry spaces, punctuation,
// or mixed case, and a slug is a URL path segment / GCS object key — never build one from unsanitized
// interpolation. Falls back to 'report' if sanitizing empties the string entirely.
export function sanitizeSlugPart(value) {
  const cleaned = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'report';
}

// Dispatches by the report scripts' own artifact `name` (standup.mjs's 'standup', pmo-report.mjs's
// 'weekly'/'monthly'/'sheet') to the matching slug builder. An unrecognized name still gets a safe,
// unique-enough slug (packet-shaped, content-suffixed, sanitized) rather than throwing — a new artifact
// kind added later degrades to "works, not optimally named" instead of crashing the report script.
export function slugForArtifact({ name, date = new Date(), markdown = '' }) {
  const builder = SLUG_BUILDERS[name];
  if (builder) return builder({ date, markdown });
  return `${sanitizeSlugPart(name)}-${dateStamp(date)}-${contentSuffix(markdown)}`;
}

// The one place the daily/-vs-packets/ split is decided — matches
// the project's bucket-provisioning script's `DAILY_PREFIX="daily/"` lifecycle rule exactly.
export function objectPathForSlug(slug) {
  return slug.startsWith('daily-') ? `${DAILY_PREFIX}${slug}.md` : `${PACKETS_PREFIX}${slug}.md`;
}

// live/<key>.<ext> — the object path for an overwrite-allowed live artifact (Story 2.1/2.2). `key` is
// sanitized the same way an unrecognized artifact name is (see sanitizeSlugPart below) because it's
// still a GCS object-key/URL path segment; a caller-supplied key should never be interpolated raw.
export function liveObjectPath(key, ext = 'json') {
  return `${LIVE_PREFIX}${sanitizeSlugPart(key)}.${ext}`;
}

export function registryUrl({ slug, baseUrl }) {
  return `${baseUrl}/r/${slug}`;
}

export function resolveBucket(env = process.env, configured = null) {
  return env.REPORT_REGISTRY_BUCKET || configured || null;
}

// Pure — the fallback decision itself, isolated so it's independently testable from the I/O that
// produces `ok`/`reason`. "Any failure" means exactly that: no special-casing of WHY the upload failed.
export function shouldFallbackToUrlHash(uploadResult) {
  return !uploadResult?.ok;
}

// ---------------------------------------------------------------------------------------------------
// Impure — credential resolution + the actual upload. Two paths, tried in order:
//   1. Service-account JSON key (routine pattern — an env-var-provided key, per LEARNINGS' env-var
//      fallback discipline for anything a routine needs unattended): signs + exchanges its own JWT,
//      zero new deps, then PUTs the payload straight to the JSON API.
//   2. `gcloud storage cp` (local/interactive pattern — Application Default Credentials already on the
//      machine, no key file needed).
// Neither available/working -> soft failure, never throws; the caller always gets a `{ ok, reason }`.
// ---------------------------------------------------------------------------------------------------

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function loadServiceAccountKey(env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      return JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    } catch {
      return null;
    }
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      return JSON.parse(readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

// Signs a self-issued JWT for a service-account key (RS256, node:crypto only) and exchanges it for an
// OAuth access token via the standard JWT-bearer grant. Returns null on any failure (malformed key,
// network error, non-2xx response) — never throws, so a routine with no key configured just falls
// through to the gcloud path or the URL-hash fallback.
export async function getAccessTokenFromServiceAccountKey(
  key,
  { fetchImpl = fetch, now = () => Date.now() } = {}
) {
  if (!key?.client_email || !key?.private_key) return null;
  const iat = Math.floor(now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: GCS_UPLOAD_SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  let signature;
  try {
    signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key);
  } catch {
    return null;
  }
  const assertion = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.access_token || null;
  } catch {
    return null;
  }
}

// Precondition-failure detector shared by both upload paths — a 412 (REST) or gcloud's equivalent
// stderr means "an object already exists at this generation-0 precondition", i.e. this exact slug is
// already taken. That's treated as SUCCESS (not overwritten, but the /r/<slug> link already resolves to
// *something* — idempotent-safe for a same-day re-run with unchanged content, and for a genuine
// same-day content drift on a packet slug it's a deliberate "never silently replace a public link"
// trade-off, not a bug).
function isPreconditionFailure(text) {
  return /\b412\b|precondition/i.test(String(text ?? ''));
}

export async function uploadViaRest({
  bucket,
  objectPath,
  markdown,
  token,
  fetchImpl = fetch,
  contentType = 'text/markdown; charset=utf-8',
  // Story 2.1: live/ objects are meant to be overwritten on every publish run — set true to skip the
  // generation-0 precondition entirely. Every existing caller (daily/packets uploads) leaves this false
  // and keeps the original never-overwrite behavior unchanged.
  allowOverwrite = false,
}) {
  try {
    const headers = {
      'Content-Type': contentType,
      Authorization: `Bearer ${token}`,
    };
    // Overwrite protection: generation 0 means "only succeed if no object exists at this name yet" — an
    // existing /r/<slug> object can never be silently replaced by a later run. Skipped for live/ objects,
    // which are expected to change on every publish.
    if (!allowOverwrite) headers['x-goog-if-generation-match'] = '0';
    const res = await fetchImpl(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
        `?uploadType=media&name=${encodeURIComponent(objectPath)}`,
      {
        method: 'POST',
        headers,
        body: markdown,
        signal: AbortSignal.timeout(15000),
      }
    );
    if (res.ok) return { ok: true };
    if (res.status === 412) return { ok: true, reason: 'already-exists' };
    return { ok: false, reason: `rest-upload-http-${res.status}` };
  } catch (err) {
    return { ok: false, reason: `rest-upload-error: ${err.message || err}` };
  }
}

function gcloudAvailable(spawnSyncImpl) {
  const r = spawnSyncImpl('gcloud', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function uploadViaGcloud({
  bucket,
  objectPath,
  markdown,
  spawnSyncImpl = spawnSync,
  contentType = 'text/markdown; charset=utf-8',
  allowOverwrite = false,
}) {
  if (!gcloudAvailable(spawnSyncImpl)) return { ok: false, reason: 'gcloud-not-available' };
  // `cp -` (stdin) has no filename to sniff a content-type from — pin it explicitly so the object serves
  // as `text/markdown` (matching the REST path's Content-Type) instead of defaulting to
  // application/octet-stream, which some renderers refuse to treat as text.
  // --if-generation-match=0: same overwrite protection as the REST path's x-goog-if-generation-match
  // header — `gcloud storage cp` supports this flag directly (confirmed: `gcloud storage cp --help`).
  // Skipped when allowOverwrite is true (live/ objects — see uploadViaRest's comment).
  const args = ['storage', 'cp', '-', `gs://${bucket}/${objectPath}`, `--content-type=${contentType}`];
  if (!allowOverwrite) args.push('--if-generation-match=0');
  const r = spawnSyncImpl('gcloud', args, { input: markdown, encoding: 'utf8' });
  if (r.status === 0) return { ok: true };
  const stderr = (r.stderr || '').trim();
  if (isPreconditionFailure(stderr)) return { ok: true, reason: 'already-exists' };
  return { ok: false, reason: `gcloud-cp-failed: ${stderr.slice(0, 300)}` };
}

// Orchestrates the two upload paths. Tries the credentialed REST path first (the routine/unattended
// pattern — an env-var key is the only thing that works with no interactive gcloud session at all); falls
// back to `gcloud storage cp` (the local/interactive pattern — ADC already on the machine). Returns
// `{ ok: false, reason: 'no-credentials' }` when neither is usable, never throws.
export async function uploadReportPayload({
  bucket,
  slug,
  markdown,
  env = process.env,
  fetchImpl = fetch,
  spawnSyncImpl = spawnSync,
  // Story 2.1: override the slug->path derivation (used by publishLiveArtifact below to target live/
  // instead of daily//packets/) and the content-type (JSON payloads, not just markdown). Both default to
  // the original packet/daily behavior, so every existing caller is unaffected.
  objectPath = objectPathForSlug(slug),
  contentType = 'text/markdown; charset=utf-8',
  allowOverwrite = false,
}) {
  const key = loadServiceAccountKey(env);
  if (key) {
    const token = await getAccessTokenFromServiceAccountKey(key, { fetchImpl });
    if (token) {
      const result = await uploadViaRest({
        bucket,
        objectPath,
        markdown,
        token,
        fetchImpl,
        contentType,
        allowOverwrite,
      });
      if (result.ok) return result;
      // A key was configured but the upload itself failed (bad IAM binding, wrong bucket, etc.) — still
      // worth trying the gcloud path in case ADC on this machine covers it, before giving up.
    }
  }

  if (gcloudAvailable(spawnSyncImpl)) {
    return uploadViaGcloud({ bucket, objectPath, markdown, spawnSyncImpl, contentType, allowOverwrite });
  }

  return { ok: false, reason: 'no-credentials' };
}

// ---------------------------------------------------------------------------------------------------
// Story 2.1/2.2 — publish a LIVE artifact (a well-known, repeatedly-overwritten key under live/), for
// the hub's auto-refreshed roadmap/sprint views and PMO chart views. This is deliberately a SEPARATE
// call site from buildReportLink/upgradeArtifactLinks above: those upgrade a Telegram artifact's
// fallback URL to a one-shot, overwrite-PROTECTED packet link; this publishes a rolling snapshot at a
// STABLE address the hub always fetches from — no fallback-URL concept, just "did the publish
// succeed?". Never throws (same soft-mode contract as uploadReportPayload); a routine calling this
// degrades gracefully — the hub's client-side fetch (public/reports.js) falls back to its last-known
// bundled snapshot on any failure, so a failed publish is a staleness issue, not an outage.
// ---------------------------------------------------------------------------------------------------
export async function publishLiveArtifact({
  bucket = resolveBucket(),
  key,
  content,
  ext = 'json',
  contentType = ext === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
  env = process.env,
  uploader = uploadReportPayload,
}) {
  const objectPath = liveObjectPath(key, ext);
  if (!bucket) return { ok: false, objectPath, reason: 'registry-not-configured' };
  try {
    const result = await uploader({
      bucket,
      objectPath,
      markdown: content,
      env,
      contentType,
      allowOverwrite: true,
    });
    if (result?.ok) return { ok: true, objectPath };
    return { ok: false, objectPath, reason: result?.reason || 'unknown' };
  } catch (err) {
    return { ok: false, objectPath, reason: `uploader-threw: ${(err && err.message) || err}` };
  }
}

// ---------------------------------------------------------------------------------------------------
// The one call site the report scripts use: try to upload + upgrade to a short /r/<slug> link; on ANY
// failure — including an uploader that REJECTS rather than resolving `{ ok: false }` — keep the
// caller's already-built URL-hash link and note the fallback on stderr (never throws, never blocks the
// script from still printing/sending its report).
// ---------------------------------------------------------------------------------------------------

export async function buildReportLink({
  name,
  markdown,
  fallbackUrl,
  date = new Date(),
  bucket = resolveBucket(),
  baseUrl = null,
  env = process.env,
  uploader = uploadReportPayload,
  logError = (msg) => console.error(msg),
  logInfo = (msg) => console.error(msg),
  // Dry-run: never write to the registry. Still computes + logs the slug/link this run WOULD have used
  // (so `--dry-run` output stays informative) but skips calling `uploader` entirely — dry-run must be a
  // real no-op against the live bucket, not just skip Telegram/log persistence.
  dryRun = false,
} = {}) {
  const slug = slugForArtifact({ name, date, markdown });
  if (!bucket || !baseUrl) {
    return { url: fallbackUrl, slug, usedRegistry: false, reason: 'registry-not-configured' };
  }
  if (dryRun) {
    logInfo(
      `report-registry: dry run — would upload "${name}" as slug ${slug} ` +
        `(${registryUrl({ slug, baseUrl })}); no write performed.`
    );
    return { url: fallbackUrl, slug, usedRegistry: false, reason: 'dry-run', dryRun: true };
  }

  let uploadResult;
  try {
    uploadResult = await uploader({ bucket, slug, markdown, env });
  } catch (err) {
    // An uploader that REJECTS (vs. resolving `{ ok: false, reason }`) must degrade exactly the same way
    // — the real uploadReportPayload never rejects (every internal branch is try/caught), but this
    // boundary's contract ("never throws") has to hold for ANY uploader implementation passed in, not
    // just the well-behaved default.
    uploadResult = { ok: false, reason: `uploader-threw: ${(err && err.message) || err}` };
  }
  if (!shouldFallbackToUrlHash(uploadResult)) {
    return { url: registryUrl({ slug, baseUrl }), slug, usedRegistry: true };
  }
  logError(
    `report-registry: upload of "${name}" (slug ${slug}) to gs://${bucket} failed ` +
      `(${uploadResult.reason || 'unknown reason'}) — falling back to the URL-hash link.`
  );
  return { url: fallbackUrl, slug, usedRegistry: false, reason: uploadResult.reason || 'unknown' };
}

// Convenience for the report scripts: mutates each `{ name, markdown, url }` artifact's `url` in place
// (keeping `url` as the fallback if the upgrade fails) and returns the same array, so a caller can do
// `artifacts = await upgradeArtifactLinks(artifacts, { dryRun })` right after building them with the
// existing URL-hash builder (scripts/lib/pmo-templates.mjs's buildDocViewerUrl /
// scripts/lib/standup-deck.mjs's buildStandupArtifacts) with no other call-site changes. `options` is
// forwarded to buildReportLink as-is — pass `dryRun: true` to skip every write for this run (see
// buildReportLink's `dryRun` param above).
export async function upgradeArtifactLinks(artifacts, options = {}) {
  for (const artifact of artifacts) {
    const result = await buildReportLink({
      name: artifact.name,
      markdown: artifact.markdown,
      fallbackUrl: artifact.url,
      ...options,
    });
    artifact.url = result.url;
    artifact.slug = result.slug;
    artifact.usedRegistry = result.usedRegistry;
  }
  return artifacts;
}
