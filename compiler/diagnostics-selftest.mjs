import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createDiagnostic, recoveryHint } from './diagnostics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oscarui-diagnostics-'));

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

try {
  copyDirectory(path.join(root, 'tests/fixtures/parity'), temporary);
  copyDirectory(path.join(root, 'schema'), path.join(temporary, 'schema'));
  const login = path.join(temporary, 'src/screens/login.ui.yaml');
  fs.writeFileSync(login, fs.readFileSync(login, 'utf8').replace('bind: email', 'bind: missingEmail'));
  const result = spawnSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), 'validate', '--json'], {
    env: { ...process.env, OSCARUI_PROJECT_ROOT: temporary },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  const diagnostic = report.diagnostics.find(item => item.file === 'src/screens/login.ui.yaml');
  assert.equal(diagnostic.path, 'body[0].children[2]');
  assert.equal(diagnostic.code, 'unknown_reference');
  assert.match(diagnostic.hint, /Declare/);

  const human = spawnSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), 'validate'], {
    env: { ...process.env, OSCARUI_PROJECT_ROOT: temporary },
    encoding: 'utf8',
  });
  assert.equal(human.status, 1);
  assert.match(human.stderr, /body\[0\]\.children\[2\]/);
  assert.match(human.stderr, /Hint:/);

  assert.equal(createDiagnostic('x', 'body[0]: text references missing color token "brand"').code, 'missing_token');
  assert.equal(createDiagnostic('x', 'iOS native action implementation is missing "save"').code, 'missing_native_action');
  assert.match(recoveryHint('Android SDK not found'), /doctor:android/);
  assert.match(recoveryHint('xcodebuild failed'), /doctor:ios/);

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'oscarui-empty-'));
  try {
    const fatal = spawnSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), 'validate', '--json'], {
      env: { ...process.env, OSCARUI_PROJECT_ROOT: empty },
      encoding: 'utf8',
    });
    assert.equal(fatal.status, 1);
    assert.equal(JSON.parse(fatal.stdout).ok, false);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
  console.log('✓ human and JSON diagnostics include file, node path, code, and actionable hints');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
