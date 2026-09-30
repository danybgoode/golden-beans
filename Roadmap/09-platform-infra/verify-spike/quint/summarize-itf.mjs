#!/usr/bin/env node
// Prints a Quint ITF trace (from `quint run --mbt --out-itf`) as one line per step:
// the action taken, then every existing delivery row, the destinations and the busy workers.
import { readFileSync } from 'node:fs';

const trace = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const v = (x) => (x && typeof x === 'object' && '#bigint' in x ? Number(x['#bigint']) : x);
const entries = (m) => m['#map'];
const field = (state, name) => state[Object.keys(state).find((k) => k.endsWith(`::${name}`) || k === name)];

trace.states.forEach((s, i) => {
  const action = field(s, 'mbt::actionTaken') ?? '';
  const picks = field(s, 'mbt::nondetPicks');
  const args = picks
    ? Object.entries(picks)
        .map(([k, p]) => {
          const val = p?.value ?? p;
          const shown = val?.['#tup'] ? `(${val['#tup'].join(',')})` : JSON.stringify(v(val));
          return val && !val.tag ? `${k}=${shown}` : null;
        })
        .filter(Boolean)
        .join(' ')
    : '';
  const rows = entries(field(s, 'rows'))
    .filter(([, r]) => r.status !== 'none')
    .map(
      ([k, r]) => `${k['#tup'].join('/')}:${r.status}#${v(r.attempts)}${v(r.token) ? `@t${v(r.token)}` : ''}`
    )
    .join(' ');
  const dests = entries(field(s, 'dests'))
    .map(([d, x]) => `${d}[${x.deleted ? 'DELETED' : x.enabled ? 'on' : 'off'}${x.up ? '' : ',sink-down'}]`)
    .join(' ');
  const workers = entries(field(s, 'workers'))
    .filter(([, w]) => w.phase !== 'idle')
    .map(
      ([w, x]) =>
        `${w}:${x.phase}(${x.key['#tup'].join('/')}@t${v(x.token)}${x.result ? `,${x.result}` : ''})`
    )
    .join(' ');
  const sends = entries(field(s, 'sends'))
    .filter(([, n]) => v(n) > 0)
    .map(([k, n]) => `${k['#tup'].join('/')}=${v(n)}`)
    .join(' ');
  console.log(
    `${String(i).padStart(2)} ${action.padEnd(14)} ${args.padEnd(22)} | rows ${rows || '-'} | ${dests} | ${workers || 'workers idle'}${sends ? ` | sends ${sends}` : ''}`
  );
});
