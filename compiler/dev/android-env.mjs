import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ANDROID_GRADLE_VERSION, defaultAndroidHome, detectJava17Home, formatCommand } from '../android-host.mjs';
import { run, runLogged } from './process.mjs';

export function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function androidEnv() {
  const androidHome = defaultAndroidHome();
  const javaHome = detectJava17Home();
  const extraPath = [
    path.join(androidHome, 'cmdline-tools/latest/bin'),
    path.join(androidHome, 'platform-tools'),
    path.join(androidHome, 'emulator'),
  ].filter(Boolean);

  return {
    ...process.env,
    ANDROID_HOME: androidHome || process.env.ANDROID_HOME,
    ANDROID_SDK_ROOT: androidHome || process.env.ANDROID_SDK_ROOT,
    JAVA_HOME: javaHome || process.env.JAVA_HOME,
    PATH: [...extraPath, process.env.PATH].filter(Boolean).join(path.delimiter),
  };
}

export function findTool(name) {
  const env = androidEnv();
  const candidates = [
    ...String(env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, name)),
    `/opt/homebrew/bin/${name}`,
  ];
  return candidates.find(isExecutable) ?? '';
}

export function runAndroid(command, args = [], options = {}) {
  return run(command, args, { env: androidEnv(), ...options });
}

export function runAndroidLogged(command, args, root) {
  runLogged(command, args, root, {
    formatCommand,
    execOptions: { env: androidEnv() },
  });
}

export function installedPackages() {
  const sdkmanager = findTool('sdkmanager');
  if (!sdkmanager) return '';
  return runAndroid(sdkmanager, ['--list_installed']).stdout;
}

export function avdNames() {
  const emulator = findTool('emulator');
  if (!emulator) return [];
  const result = runAndroid(emulator, ['-list-avds']);
  if (!result.ok) return [];
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
}

function gradleCacheRoot(root) {
  return path.join(root, '.aic/android/.gradle-dist');
}

function cachedGradle(root) {
  const gradle = path.join(gradleCacheRoot(root), `gradle-${ANDROID_GRADLE_VERSION}`, 'bin', 'gradle');
  return isExecutable(gradle) ? gradle : '';
}

export function ensureGradle(root) {
  const cached = cachedGradle(root);
  if (cached) return cached;

  const globalGradle = findTool('gradle');
  if (globalGradle) return globalGradle;

  const curl = findTool('curl') || '/usr/bin/curl';
  const unzip = findTool('unzip') || '/usr/bin/unzip';
  if (!isExecutable(curl)) throw new Error('android dev: curl is required to download Gradle.');
  if (!isExecutable(unzip)) throw new Error('android dev: unzip is required to unpack Gradle.');

  const cacheRoot = gradleCacheRoot(root);
  const zip = path.join(cacheRoot, `gradle-${ANDROID_GRADLE_VERSION}-bin.zip`);
  const url = `https://services.gradle.org/distributions/gradle-${ANDROID_GRADLE_VERSION}-bin.zip`;

  fs.mkdirSync(cacheRoot, { recursive: true });
  console.log(`→ downloading Gradle ${ANDROID_GRADLE_VERSION} to .aic/android/.gradle-dist`);
  execFileSync(curl, ['-L', '--fail', '-o', zip, url], { stdio: 'inherit', env: androidEnv() });
  execFileSync(unzip, ['-q', '-o', zip, '-d', cacheRoot], { stdio: 'inherit', env: androidEnv() });

  const gradle = cachedGradle(root);
  if (!gradle) throw new Error('android dev: Gradle download completed but gradle executable was not found.');
  return gradle;
}

function bootedDeviceSerial() {
  const adb = findTool('adb');
  if (!adb) return '';
  const result = runAndroid(adb, ['devices']);
  if (!result.ok) return '';
  const line = result.stdout.split('\n').find(line => /\tdevice$/.test(line));
  return line?.split(/\s+/)[0] ?? '';
}

function waitForAndroidBoot(root) {
  const adb = findTool('adb');
  runAndroidLogged(adb, ['wait-for-device'], root);

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const booted = runAndroid(adb, ['shell', 'getprop', 'sys.boot_completed']);
    if (booted.ok && booted.stdout.trim() === '1') return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error('android dev: emulator did not finish booting within 180 seconds.');
}

function selectAndroidAvd(preferred = process.env.AIC_ANDROID_AVD) {
  const avds = avdNames();
  if (!avds.length) return '';
  if (!preferred) return avds[0];
  return avds.includes(preferred) ? preferred : '';
}

export function ensureAndroidDevice(root, avdName = selectAndroidAvd()) {
  const serial = bootedDeviceSerial();
  if (serial) {
    console.log(`✓ Android device already connected: ${serial}`);
    return;
  }

  const emulator = findTool('emulator');
  if (!emulator) throw new Error('android dev: emulator command not found.');
  if (!avdName) {
    const hint = process.env.AIC_ANDROID_AVD
      ? ` AIC_ANDROID_AVD="${process.env.AIC_ANDROID_AVD}" did not match an installed AVD.`
      : '';
    throw new Error(`android dev: no Android AVD found.${hint} Create one with avdmanager first.`);
  }
  if (!avdNames().includes(avdName)) {
    throw new Error(`android dev: AVD "${avdName}" not found. Create it with avdmanager first.`);
  }

  console.log(`$ ${formatCommand([emulator, ['-avd', avdName]], root)}`);
  const child = spawn(emulator, ['-avd', avdName], {
    detached: true,
    stdio: 'ignore',
    env: androidEnv(),
  });
  child.unref();

  waitForAndroidBoot(root);
}

