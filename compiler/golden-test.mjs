import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'tests/fixtures/parity');
const golden = path.join(root, 'tests/golden');
const update = process.argv.includes('--update');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oscarui-golden-'));

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

function files(directory, base = directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file, base) : [path.relative(base, file)];
  }).sort();
}

try {
  copyDirectory(fixture, temporary);
  copyDirectory(path.join(root, 'schema'), path.join(temporary, 'schema'));
  copyDirectory(path.join(root, 'runtime'), path.join(temporary, 'runtime'));
  const environment = { ...process.env, OSCARUI_PROJECT_ROOT: temporary };
  execFileSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), 'build'], { env: environment, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), 'build:runtime'], { env: environment, stdio: 'pipe' });
  const actual = path.join(temporary, 'generated');

  if (update) {
    fs.rmSync(golden, { recursive: true, force: true });
    copyDirectory(actual, golden);
    console.log(`✓ updated ${path.relative(root, golden)}`);
  } else {
    const expectedFiles = files(golden);
    const actualFiles = files(actual);
    if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
      console.error('✗ golden output file list changed');
      console.error(`  expected: ${expectedFiles.join(', ')}`);
      console.error(`  actual:   ${actualFiles.join(', ')}`);
      process.exitCode = 1;
    }

    for (const relative of [...new Set([...expectedFiles, ...actualFiles])]) {
      const expected = path.join(golden, relative);
      const received = path.join(actual, relative);
      if (!fs.existsSync(expected) || !fs.existsSync(received)) continue;
      if (fs.readFileSync(expected).equals(fs.readFileSync(received))) continue;
      process.exitCode = 1;
      console.error(`✗ generated output changed: ${relative}`);
      const diff = spawnSync('diff', ['-u', expected, received], { encoding: 'utf8' });
      console.error((diff.stdout || diff.stderr || '  binary content differs').trim());
    }

    if (!process.exitCode) console.log(`✓ ${actualFiles.length} Swift, Kotlin, and Runtime golden files match`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
