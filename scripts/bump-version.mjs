#!/usr/bin/env node
/**
 * Bumps the eldraw version in lockstep across:
 *   - package.json
 *   - src-tauri/Cargo.toml       (package.version)
 *   - src-tauri/tauri.conf.json  (version)
 *
 * Usage: node scripts/bump-version.mjs <new-version>
 *        node scripts/bump-version.mjs 0.2.0
 *
 * Does not create a git tag — run `git tag v<version>` separately once the
 * bump commit is on main. Pushing the tag triggers the release workflow.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const next = process.argv[2];
if (!next || !SEMVER.test(next)) {
  console.error('usage: node scripts/bump-version.mjs <semver>');
  console.error('example: node scripts/bump-version.mjs 0.2.0');
  console.error('         node scripts/bump-version.mjs 0.2.0-rc.1');
  process.exit(1);
}

function replaceInFile(path, matcher, replacement, label) {
  const abs = resolve(root, path);
  const before = readFileSync(abs, 'utf8');
  const after = before.replace(matcher, replacement);
  if (before === after) {
    throw new Error(`${label}: pattern not found in ${path}`);
  }
  writeFileSync(abs, after);
  console.log(`  ${path}`);
}

console.log(`bumping eldraw to ${next}`);

replaceInFile('package.json', /("version"\s*:\s*")[^"]+(")/, `$1${next}$2`, 'package.json');

replaceInFile(
  'src-tauri/Cargo.toml',
  /(^\s*version\s*=\s*")[^"]+(")/m,
  `$1${next}$2`,
  'Cargo.toml',
);

replaceInFile(
  'src-tauri/tauri.conf.json',
  /("version"\s*:\s*")[^"]+(")/,
  `$1${next}$2`,
  'tauri.conf.json',
);

console.log(`done. next: commit, then \`git tag v${next} && git push origin v${next}\`.`);
