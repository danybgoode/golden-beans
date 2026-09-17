// The published version, as a constant.
//
// ⚠️ **Not `require('../package.json').version`.** The build emits `dist/` beside `package.json`, so
// the relative path differs between source and build, and a `resolveJsonModule` import would put a
// copy of the manifest into the bundle. Worse, it is exactly the kind of runtime lookup that
// silently returns `undefined` on a packaging change and prints `gf undefined`.
//
// It is a literal, and `version.test.ts` asserts it equals `package.json`'s — so the two cannot
// drift, and the drift is caught by the unit gate rather than by someone reading `gf --version`.
export const VERSION = '0.1.0'
