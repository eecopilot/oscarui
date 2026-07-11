import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defaultAndroidHome } from './android-host.mjs';

function findAdb() {
  const androidHome = defaultAndroidHome();
  const candidates = [
    process.env.ADB,
    androidHome && path.join(androidHome, 'platform-tools/adb'),
    '/opt/homebrew/share/android-commandlinetools/platform-tools/adb',
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
  ].filter(Boolean);

  return candidates.find(file => {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) ?? 'adb';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function captureSnapshots(root, screens, options = {}) {
  const screen = screens.find(({ ir }) => ir.entry)?.ir?.screen ?? screens[0]?.ir?.screen ?? 'Screen';
  const outDir = path.join(root, '.aic/snapshots');
  fs.mkdirSync(outDir, { recursive: true });
  const variant = options.variant ? `.${options.variant}` : '';

  const iosFile = path.join(outDir, `${screen}${variant}.ios.png`);
  const androidFile = path.join(outDir, `${screen}${variant}.android.png`);

  console.log('');
  sleep(Number(process.env.AIC_SNAPSHOT_SETTLE_MS ?? 2500));
  console.log('Capturing UI snapshots:');
  console.log(`$ xcrun simctl io booted screenshot ${path.relative(root, iosFile)}`);
  execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', iosFile], { stdio: 'inherit' });

  const adb = findAdb();
  console.log(`$ ${adb} exec-out screencap -p > ${path.relative(root, androidFile)}`);
  const androidPng = execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(androidFile, androidPng);

  console.log(`→ ${path.relative(root, iosFile)}`);
  console.log(`→ ${path.relative(root, androidFile)}`);

  return { iosFile, androidFile };
}
