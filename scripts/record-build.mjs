// Reads the Lighthouse CI manifest for the homepage and appends one row to builds.json.
// Usage: node scripts/record-build.mjs <path/to/builds.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = process.argv[2];
const manifest = JSON.parse(readFileSync('.lighthouseci/reports/manifest.json', 'utf8'));
const home = manifest.find(m => m.isRepresentativeRun && /\/index\.html$/.test(m.url) && !/work|status/.test(m.url));
if (!home) { console.error('no representative homepage run'); process.exit(0); }
const lhr = JSON.parse(readFileSync(home.jsonPath, 'utf8'));
const s = k => Math.round(lhr.categories[k].score * 100);

const row = {
  t: new Date().toISOString(),
  sha: process.env.GITHUB_SHA || 'local',
  perf: s('performance'), a11y: s('accessibility'), bp: s('best-practices'), seo: s('seo'),
  lcp: Math.round(lhr.audits['largest-contentful-paint'].numericValue),
  bytes: Math.round(lhr.audits['total-byte-weight'].numericValue)
};

const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { builds: [] };
data.builds.push(row);
data.builds = data.builds.slice(-200);
writeFileSync(out, JSON.stringify(data, null, 1));
console.log('recorded', row);
