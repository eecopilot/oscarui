import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oscarui-package-'));

function run(command, args, cwd, env = {}) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  const packOutput = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporary], root));
  const tarball = path.join(temporary, packOutput[0].filename);
  assert.equal(fs.existsSync(tarball), true, 'npm pack must emit a tarball');

  const harness = path.join(temporary, 'harness');
  fs.mkdirSync(harness);
  run('npm', ['init', '-y'], harness);
  run('npm', ['install', '--ignore-scripts', tarball], harness);
  const executable = path.join(harness, 'node_modules/.bin/oscarui');
  assert.match(run(executable, ['--version'], harness), /^\d+\.\d+\.\d+\s*$/);
  assert.match(run(executable, ['--help'], harness), /init \[directory\]/);

  const project = path.join(temporary, 'starter-app');
  run(executable, ['init', project], harness, { OSCARUI_INIT_PACKAGE_SPEC: tarball });
  assert.equal(fs.existsSync(path.join(project, 'src/app.config.yaml')), true);
  assert.equal(fs.existsSync(path.join(project, 'schema/ui-ir.schema.json')), true);
  assert.equal(fs.existsSync(path.join(project, '.aic')), false, 'init must not copy local build artifacts');
  run('npm', ['install', '--ignore-scripts'], project);
  run('npm', ['run', 'validate'], project);
  run('npm', ['run', 'build'], project);
  run('npm', ['test'], project);

  console.log('✓ packed CLI installs, initializes, validates, builds, and tests a clean project');
} catch (error) {
  const stderr = error.stderr?.toString().trim();
  const stdout = error.stdout?.toString().trim();
  if (stdout) console.error(stdout);
  if (stderr) console.error(stderr);
  throw error;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
