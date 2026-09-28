#!/usr/bin/env node
// perf-probe.mjs — raw transfer baseline for the project's production runtime.
//
// Ported from the origin project by plugin-audit-and-extraction S3.2. Fetch and
// Playwright transparently decompress bodies;
// this deliberately uses node:https so byte counts are the bytes received on
// the wire (with an explicit Accept-Encoding), which is what a transfer budget
// must police. It is a reporting read only: --dry-run makes no network call.
//
// WHAT to probe is the project's: perf-probe.config.json at the repo root —
//   { "baseUrl": "https://example.com",
//     "targets": [ { "id": "home", "label": "home (signed-out)", "path": "/" },
//                   { "id": "image", "label": "cold real image variant", "path": "/api/img?…", "image": true } ] }
// Pick REAL, live pages — a fixture that 404s measures an error page. No config → a clear error, never
// a probe of someone else's site.

import http from 'node:http'
import https from 'node:https'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'perf-probe.config.json')
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { readSection } from './lib/config.mjs'

const MODERN_IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'

/** Read + validate perf-probe.config.json. Throws naming the file — there is no default target. */
export function loadProbeConfig({ path = CONFIG_PATH, exists = existsSync, read = readFileSync } = {}) {
  // `smoke.perf` in golden-frijoles.config.json over the legacy file (D9); validation stays here.
  const { raw, present } = readSection('smoke.perf', { legacyExists: exists, legacyRead: read, legacyPath: path, onLegacyError: (_p, e) => { throw e } })
  if (!present) throw new Error(`${path} not found — copy perf-probe.config.example.json and list your real pages`)
  if (!/^https?:\/\//.test(raw.baseUrl || '')) throw new Error(`${path}: "baseUrl" must be an http(s) URL`)
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) throw new Error(`${path}: "targets" must list at least one page`)
  for (const [i, t] of raw.targets.entries()) {
    if (!t?.id || !t?.label || typeof t.path !== 'string' || !t.path.startsWith('/')) {
      throw new Error(`${path}: "targets[${i}]" needs id, label and a path starting with "/"`)
    }
  }
  return { baseUrl: raw.baseUrl, targets: raw.targets }
}

// `imageUrl`, when given, replaces ONLY the image target's URL (an explicit, named substitution).
export function fixtureUrls({ baseUrl, imageUrl = null, targets }) {
  const base = baseUrl.replace(/\/$/, '')
  return targets.map((t) => ({
    id: t.id,
    label: t.label,
    url: t.image && imageUrl ? imageUrl : `${base}${t.path}`,
    ...(t.image ? { image: true } : {}),
  }))
}

export function parseArgs(argv) {
  const out = { baseUrl: null, imageUrl: null, json: false, dryRun: false, revision: null, help: false }
  const assignValue = (arg, value) => {
    if (!value?.trim()) throw new Error(`${arg} requires a non-blank value`)
    const key = { '--base-url': 'baseUrl', '--image-url': 'imageUrl', '--revision': 'revision' }[arg]
    out[key] = arg === '--revision' ? value.trim() : value
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') out.json = true
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '-h' || arg === '--help') out.help = true
    else if (arg === '--base-url' || arg === '--image-url' || arg === '--revision') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      assignValue(arg, value)
    } else if (arg.startsWith('--base-url=')) assignValue('--base-url', arg.slice('--base-url='.length))
    else if (arg.startsWith('--image-url=')) assignValue('--image-url', arg.slice('--image-url='.length))
    else if (arg.startsWith('--revision=')) assignValue('--revision', arg.slice('--revision='.length))
    else throw new Error(`unknown argument '${arg}'`)
  }
  return out
}

export const HELP = `perf-probe.mjs — raw compressed transfer baseline

Usage:
  node scripts/perf-probe.mjs [--json] [--base-url <url>] [--image-url <url>] [--revision <id>] [--dry-run]

Fixtures: the targets in perf-probe.config.json (--base-url overrides its baseUrl).
--image-url replaces only the target marked image; it is never silently substituted.
--dry-run prints the configured fixtures and makes no network calls or writes.`

function metric(state, value, detail) {
  return { state, ...(value === undefined ? {} : { value }), ...(detail ? { detail } : {}) }
}

export function requestTransport(url, deps = {}) {
  const protocol = new URL(url).protocol
  if (protocol === 'http:') return deps.httpRequest ?? http.request
  if (protocol === 'https:') return deps.httpsRequest ?? https.request
  throw new Error(`unsupported URL protocol '${protocol}'`)
}

export function rawRequest(url, { headers = {}, timeoutMs = 30_000 } = {}, deps = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = process.hrtime.bigint()
    const transport = deps.transport ?? requestTransport(url, deps)
    const req = transport(url, {
      method: 'GET',
      headers: {
        // https.request does not auto-decompress. Explicitly negotiate normal
        // CDN encodings so the collected chunks are the real transfer payload.
        'accept-encoding': 'gzip, br, deflate',
        'user-agent': 'perf-probe/1.0',
        ...headers,
      },
    }, (res) => {
      const ttfbMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      let bytes = 0
      const chunks = []
      res.on('data', (chunk) => { bytes += chunk.length; chunks.push(chunk) })
      res.on('error', reject)
      res.on('end', () => resolve({
        url,
        statusCode: res.statusCode ?? 0,
        headers: res.headers,
        bytes,
        body: Buffer.concat(chunks),
        ttfbMs,
      }))
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${timeoutMs}ms`)))
    req.on('error', reject)
    req.end()
  })
}

export function extractClientScriptUrls(html, pageUrl) {
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((src) => /\/_next\/static\/.+\.js(?:\?|$)/.test(src))
  return [...new Set(srcs.map((src) => new URL(src, pageUrl).toString()))]
}

// Keep `response.bytes` untouched for transfer reporting, but decode a COPY
// only to inspect HTML. Reading raw compressed chunks and parsing compressed
// bytes are separate concerns; conflating them was the exact false-absent
// failure this probe exists to prevent.
export function decodeBodyForInspection(body, contentEncoding = '') {
  const encoding = String(contentEncoding).toLowerCase().trim()
  if (encoding === 'br') return brotliDecompressSync(body).toString('utf8')
  if (encoding === 'gzip') return gunzipSync(body).toString('utf8')
  if (encoding === 'deflate') return inflateSync(body).toString('utf8')
  return body.toString('utf8')
}

export async function measureFixture(fixture, deps = { request: rawRequest }) {
  const request = deps.request ?? rawRequest
  try {
    const response = await request(fixture.url, fixture.image ? { headers: { accept: MODERN_IMAGE_ACCEPT } } : {}, deps)
    const cache = response.headers['cf-cache-status']
    const result = {
      id: fixture.id,
      label: fixture.label,
      url: fixture.url,
      // A redirect is a different first-hop response, not proof that the
      // locked page/image was measured. Count only a direct 2xx as present so
      // a short redirect body cannot masquerade as a low-byte baseline.
      status: response.statusCode >= 200 && response.statusCode < 300 ? 'present' : 'absent',
      http_status: response.statusCode,
      ttfb_ms: metric('present', Number(response.ttfbMs.toFixed(1))),
      cf_cache_status: cache ? metric('present', String(cache)) : metric('absent'),
      total_transfer_bytes: metric('present', response.bytes),
      client_js_transfer_bytes: metric('absent'),
      content_type: response.headers['content-type']
        ? metric('present', String(response.headers['content-type']).split(';', 1)[0].trim().toLowerCase())
        : metric('absent'),
    }

    if (fixture.image) {
      if (!String(result.content_type.value ?? '').startsWith('image/')) {
        result.status = 'absent'
        result.content_type = metric('absent', result.content_type.value, 'expected an image response')
        return result
      }
      const requestedFormat = new URL(fixture.url).searchParams.get('f')
      const expectedFormat = requestedFormat === 'jpg' ? 'jpeg' : requestedFormat
      const expectedType = expectedFormat ? `image/${expectedFormat}` : null
      if (expectedType && result.content_type.value !== expectedType) {
        result.status = 'absent'
        result.content_type = metric('absent', result.content_type.value, `expected ${expectedType}`)
      }
      return result
    }
    let html
    try {
      html = decodeBodyForInspection(response.body, response.headers['content-encoding'])
    } catch (error) {
      result.client_js_transfer_bytes = metric('unavailable', undefined, `could not inspect compressed HTML: ${error instanceof Error ? error.message : String(error)}`)
      result.status = 'unavailable'
      return result
    }
    const scripts = extractClientScriptUrls(html, fixture.url)
    if (scripts.length === 0) {
      result.client_js_transfer_bytes = metric('absent', undefined, 'no Next client scripts found in the HTML')
      result.status = 'absent'
      return result
    }
    try {
      const transfers = await Promise.all(scripts.map((src) => request(src, {}, deps)))
      const failed = transfers.find((item) => item.statusCode < 200 || item.statusCode >= 300)
      if (failed) {
        result.client_js_transfer_bytes = metric('absent', undefined, `client script returned HTTP ${failed.statusCode}: ${failed.url}`)
        result.status = 'absent'
        return result
      }
      result.client_js_transfer_bytes = metric('present', transfers.reduce((total, item) => total + item.bytes, 0))
    } catch (error) {
      result.client_js_transfer_bytes = metric('unavailable', undefined, error instanceof Error ? error.message : String(error))
      result.status = 'unavailable'
    }
    return result
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      id: fixture.id,
      label: fixture.label,
      url: fixture.url,
      status: 'unavailable',
      ttfb_ms: metric('unavailable', undefined, detail),
      cf_cache_status: metric('unavailable', undefined, detail),
      total_transfer_bytes: metric('unavailable', undefined, detail),
      client_js_transfer_bytes: metric('unavailable', undefined, detail),
      content_type: metric('unavailable', undefined, detail),
    }
  }
}

export async function runProbe(options, deps = { request: rawRequest, now: () => new Date() }) {
  // CLI flags override the config only where GIVEN — parseArgs defaults unset flags to null, and a plain
  // spread would let those nulls wipe the config's baseUrl.
  const config = options.targets ? options : (deps.loadConfig ?? loadProbeConfig)()
  const fixtures = fixtureUrls({
    targets: options.targets ?? config.targets,
    baseUrl: options.baseUrl ?? config.baseUrl,
    imageUrl: options.imageUrl ?? null,
  })
  if (options.dryRun) return { dry_run: true, fixtures }
  const results = []
  for (const fixture of fixtures) results.push(await measureFixture(fixture, deps))
  const revision = typeof options.revision === 'string' ? options.revision.trim() : ''
  return {
    measured_at: (deps.now ?? (() => new Date()))().toISOString(),
    deployed_revision: revision ? metric('present', revision) : metric('unavailable', undefined, 'pass --revision with the deployed Git SHA'),
    fixtures: results,
    unavailable: results.filter((result) => result.status === 'unavailable').length,
    absent: results.filter((result) => result.status === 'absent').length,
  }
}

// A reachable 404/500 is not the same condition as an unreachable target,
// but either means this baseline did not observe every locked fixture and must
// never exit green.
export function probeExitCode(report) {
  if (report.dry_run) return 0
  const revision = report.deployed_revision
  const identifiedRevision = revision?.state === 'present' && typeof revision.value === 'string' && revision.value.trim()
  return report.unavailable || report.absent || !identifiedRevision ? 1 : 0
}

export function formatReport(report) {
  if (report.dry_run) return `DRY RUN — no network calls or writes\n${report.fixtures.map((f) => `- ${f.id}: ${f.url}`).join('\n')}\n`
  const lines = [
    `Performance probe — ${report.measured_at}`,
    `Deployed revision: ${report.deployed_revision.state === 'present' ? report.deployed_revision.value : `unavailable (${report.deployed_revision.detail ?? 'not identified'})`}`,
    '',
    '| Fixture | Status | TTFB | CF cache | Transfer | Client JS |',
    '|---|---|---:|---|---:|---:|',
  ]
  const display = (value, suffix = '') => value.state === 'present' ? `${value.value}${suffix}` : value.state
  for (const item of report.fixtures) {
    lines.push(`| ${item.label} | ${item.status} | ${display(item.ttfb_ms, ' ms')} | ${display(item.cf_cache_status)} | ${display(item.total_transfer_bytes, ' B')} | ${display(item.client_js_transfer_bytes, ' B')} |`)
  }
  if (report.unavailable) lines.push(`\nUNAVAILABLE: ${report.unavailable} fixture(s) could not be measured; this is not a green run.`)
  if (report.absent) lines.push(`\nFAILED: ${report.absent} locked fixture(s) returned a non-2xx or invalid measurement; this is not a green run.`)
  if (report.deployed_revision.state !== 'present') lines.push(`\nFAILED: deployed revision was not identified; pass --revision with the live Git SHA.`)
  return `${lines.join('\n')}\n`
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) return process.stdout.write(`${HELP}\n`)
    const report = await runProbe(options)
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report))
    if (!options.dryRun && probeExitCode(report)) {
      const reasons = [
        report.unavailable ? `${report.unavailable} unreachable or unreadable` : null,
        report.absent ? `${report.absent} non-2xx or invalid measurement` : null,
        report.deployed_revision.state !== 'present' ? 'deployed revision unidentified' : null,
      ].filter(Boolean).join('; ')
      process.stderr.write(`perf-probe: locked fixture failure (${reasons}); see rows above.\n`)
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`perf-probe: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
