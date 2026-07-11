import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = (process.argv[2] || `v${manifest.version}`).replace(/^v/, '');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const startMarker = `## [${version}]`;
const start = changelog.indexOf(startMarker);
if (start < 0) throw new Error(`release notes: ${startMarker} not found in CHANGELOG.md`);
const remainder = changelog.slice(start);
const next = remainder.slice(startMarker.length).search(/\n## \[/);
const notes = (next < 0 ? remainder : remainder.slice(0, startMarker.length + next)).trim();
const output = path.join(root, '.aic/release-notes.md');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${notes}\n`);
console.log(output);
