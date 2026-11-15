// Fails the build if the writing slips into habits I don't want on the site.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const banned = [
  [/—|–/, 'em or en dash'],
  [/!\s*</, 'exclamation mark in visible text'],
  [/\b(leverag(e|ing)|seamless(ly)?|supercharge|unlock|game-?changing|revolutioni[sz]e|delve|passionate|cutting-edge|synerg(y|ies)|robust solutions?)\b/i, 'hype word'],
  [/\brecent graduate\b/i, 'wrong career stage'],
];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk('_site').filter(f => !f.includes('liveability_map') && !f.includes('House-Price'));
let fails = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [re, label] of banned) {
    const m = text.match(re);
    if (m) { console.error(`${f}: ${label}: "${m[0]}"`); fails++; }
  }
}
if (fails) { console.error(`${fails} copy problem(s)`); process.exit(1); }
console.log(`copy check passed on ${files.length} pages`);
