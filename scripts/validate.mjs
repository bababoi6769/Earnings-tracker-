#!/usr/bin/env node
/**
 * Static checks for the tracker apps — no dependencies, runs on plain Node.
 *
 *   node scripts/validate.mjs
 *
 * Checks, for every app under apps/:
 *   1. required files exist (index.html, and the vendored chart library)
 *   2. inline CSS blocks have balanced braces
 *   3. inline JS blocks parse (so a typo can never ship a blank page)
 *   4. no leftover console.log() debug statements
 *   5. no duplicate element ids
 *   6. no unreachable remote CDN dependencies (apps work offline)
 *   7. README links to files that actually exist
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const APPS = [
  { name: 'Landing page', path: 'index.html', vendors: [] },
  { name: 'Ultimate Earnings Tracker', path: 'apps/ultimate/index.html', vendors: ['apps/ultimate/vendor/chart.umd.min.js'] },
  { name: 'Girly Pop Edition', path: 'apps/girlypop/index.html', vendors: [] },
  { name: 'Dark Edition', path: 'apps/dark/index.html', vendors: [] },
];

let failures = 0;
const fail = (app, message) => {
  failures += 1;
  console.error(`  ✗ ${app}: ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

for (const app of APPS) {
  console.log(`\n${app.name}`);

  if (!existsSync(join(ROOT, app.path))) {
    fail(app.name, `missing ${app.path}`);
    continue;
  }

  const html = read(app.path);

  // 1. vendored assets
  for (const vendor of app.vendors) {
    if (existsSync(join(ROOT, vendor))) pass(`vendored asset present (${vendor})`);
    else fail(app.name, `missing vendored asset ${vendor}`);
  }

  // 2. CSS braces
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  styles.forEach((css, i) => {
    const clean = stripComments(css);
    const open = (clean.match(/{/g) || []).length;
    const close = (clean.match(/}/g) || []).length;
    if (open === close) pass(`style block ${i}: braces balanced (${open})`);
    else fail(app.name, `style block ${i}: ${open} "{" vs ${close} "}"`);
  });

  // 3. JS parses
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  scripts.forEach((js, i) => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(js);
      pass(`script block ${i}: parses (${js.split('\n').length} lines)`);
    } catch (error) {
      fail(app.name, `script block ${i}: ${error.message}`);
    }
  });

  // 4. debug logging
  const logs = html.match(/console\.log\(/g) || [];
  if (logs.length === 0) pass('no leftover console.log() debug statements');
  else fail(app.name, `${logs.length} console.log() statement(s) left in the shipped file`);

  // 5. duplicate ids
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (dupes.length === 0) pass(`element ids are unique (${ids.length})`);
  else fail(app.name, `duplicate ids: ${dupes.join(', ')}`);

  // 6. offline friendly
  const remoteScripts = [...html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (remoteScripts.length === 0) pass('no remote script dependencies — apps run offline');
  else fail(app.name, `remote script dependency: ${remoteScripts.join(', ')}`);

  // 7. internal links
  const links = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#|mailto:)([^"]+)"/g)].map((m) => m[1]);
  const missing = links.filter((link) => !existsSync(join(ROOT, dirname(app.path), link)));
  if (missing.length === 0) pass(`local asset references resolve (${links.length})`);
  else fail(app.name, `broken local reference(s): ${missing.join(', ')}`);
}

// README links
console.log('\nREADME');
const readme = read('README.md');
const targets = [...readme.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)].map((m) => m[1].split('#')[0]);
const brokenLinks = targets.filter((target) => target && !existsSync(join(ROOT, decodeURIComponent(target))));
if (brokenLinks.length === 0) pass(`all ${targets.length} relative links resolve`);
else {
  brokenLinks.forEach((link) => fail('README.md', `broken link: ${link}`));
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed ✨');
