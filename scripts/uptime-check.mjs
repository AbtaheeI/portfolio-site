// One uptime check: request the homepage and the resume, append the result to uptime.json.
// Usage: node scripts/uptime-check.mjs <path/to/uptime.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = process.argv[2];
const BASE = process.env.SITE_URL || 'https://abtaheeislam.com';
const targets = ['/', '/CVA.pdf'];

async function probe(path) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'cache-control': 'no-cache' } });
    await res.arrayBuffer();
    return { ok: res.ok, code: res.status, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, code: e.name === 'TimeoutError' ? 'timeout' : 'error', ms: Math.round(performance.now() - t0) };
  }
}

const results = await Promise.all(targets.map(probe));
const row = {
  t: new Date().toISOString(),
  ok: results.every(r => r.ok),
  code: results.find(r => !r.ok)?.code ?? 200,
  ms: results[0].ms
};

const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { checks: [] };
data.checks.push(row);
data.checks = data.checks.slice(-3000); // a few months of checks
writeFileSync(out, JSON.stringify(data));
console.log(row);
if (!row.ok) process.exitCode = 1; // a red run in the Actions tab is the alert
