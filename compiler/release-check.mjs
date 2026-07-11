import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || `v${manifest.version}`;
assert.equal(tag, `v${manifest.version}`, `release tag ${tag} must match package version v${manifest.version}`);

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const heading = `## [${manifest.version}]`;
assert.equal(changelog.includes(heading), true, `CHANGELOG.md must contain ${heading}`);
console.log(`✓ release ${tag} matches package.json and CHANGELOG.md`);
