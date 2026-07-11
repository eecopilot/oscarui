import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { loadRuntimeBundleFile } from './bundle.mjs';
import { RUNTIME_BUNDLE_FILE } from './constants.mjs';
import { findTool } from '../dev/android-env.mjs';

function checkedBundle(root, file) {
  const bundleFile = path.resolve(root, file ?? path.join('generated/runtime', RUNTIME_BUNDLE_FILE));
  if (!fs.existsSync(bundleFile)) throw new Error(`runtime install: bundle not found at ${bundleFile}`);
  const { verification } = loadRuntimeBundleFile(bundleFile);
  if (!verification.ok) throw new Error(`runtime install: ${verification.error}`);
  return bundleFile;
}

export function installRuntimeIos(root, config, file) {
  const bundleFile = checkedBundle(root, file);
  const bundleId = config.app.bundleId;
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', 'booted', bundleId, 'data'], { encoding: 'utf8' }).trim();
  const targetDir = path.join(container, 'Library/Application Support/OscarUI/runtime');
  fs.mkdirSync(targetDir, { recursive: true });
  const current = path.join(targetDir, 'current.json');
  if (fs.existsSync(current)) fs.copyFileSync(current, path.join(targetDir, 'last-good.json'));
  fs.copyFileSync(bundleFile, current);
  console.log(`→ installed runtime bundle for ${bundleId} in the booted iOS Simulator`);
}

export function installRuntimeAndroid(root, config, file) {
  const bundleFile = checkedBundle(root, file);
  const adb = findTool('adb');
  if (!adb) throw new Error('runtime install: adb not found');
  const applicationId = config.app.applicationId;
  const temporary = '/data/local/tmp/oscarui.runtime.json';
  execFileSync(adb, ['push', bundleFile, temporary], { stdio: 'inherit' });
  execFileSync(adb, ['shell', 'run-as', applicationId, 'mkdir', '-p', 'files/runtime'], { stdio: 'inherit' });
  const current = spawnSync(adb, ['shell', 'run-as', applicationId, 'ls', 'files/runtime/current.json'], { stdio: 'ignore' });
  if (current.status === 0) {
    execFileSync(adb, ['shell', 'run-as', applicationId, 'cp', 'files/runtime/current.json', 'files/runtime/last-good.json'], { stdio: 'inherit' });
  }
  execFileSync(adb, ['shell', 'run-as', applicationId, 'cp', temporary, 'files/runtime/current.json'], { stdio: 'inherit' });
  execFileSync(adb, ['shell', 'rm', '-f', temporary], { stdio: 'inherit' });
  console.log(`→ installed runtime bundle for ${applicationId} on the connected Android device`);
}
