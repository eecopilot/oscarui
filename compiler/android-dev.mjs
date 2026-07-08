import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ANDROID_APPLICATION_ID,
  ANDROID_GRADLE_VERSION,
  ANDROID_NAMESPACE,
  androidCommandPlan,
  defaultAndroidHome,
  detectJava17Home,
  formatCommand,
  prepareAndroidHost,
} from './android-host.mjs';

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function androidEnv() {
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

function findTool(name) {
  const env = androidEnv();
  const candidates = [
    ...String(env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, name)),
    `/opt/homebrew/bin/${name}`,
  ];
  return candidates.find(isExecutable) ?? '';
}

function run(command, args = [], options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: androidEnv(),
        ...options,
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? '').trim(),
      stderr: String(error.stderr ?? error.message ?? '').trim(),
    };
  }
}

function runLogged(command, args, root) {
  console.log(`$ ${formatCommand([command, args], root)}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: androidEnv(),
  });
}

function firstLine(text) {
  return text.split('\n').find(Boolean) ?? '';
}

function installedPackages() {
  const sdkmanager = findTool('sdkmanager');
  if (!sdkmanager) return '';
  return run(sdkmanager, ['--list_installed']).stdout;
}

function avdNames() {
  const emulator = findTool('emulator');
  if (!emulator) return [];
  const result = run(emulator, ['-list-avds']);
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

function ensureGradle(root) {
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
  const result = run(adb, ['devices']);
  if (!result.ok) return '';
  const line = result.stdout.split('\n').find(line => /\tdevice$/.test(line));
  return line?.split(/\s+/)[0] ?? '';
}

function waitForAndroidBoot(root) {
  const adb = findTool('adb');
  runLogged(adb, ['wait-for-device'], root);

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const booted = run(adb, ['shell', 'getprop', 'sys.boot_completed']);
    if (booted.ok && booted.stdout.trim() === '1') return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error('android dev: emulator did not finish booting within 180 seconds.');
}

function ensureAndroidDevice(root, avdName = process.env.AIC_ANDROID_AVD || 'oscarui_api35') {
  const serial = bootedDeviceSerial();
  if (serial) {
    console.log(`✓ Android device already connected: ${serial}`);
    return;
  }

  const emulator = findTool('emulator');
  if (!emulator) throw new Error('android dev: emulator command not found.');
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

export function doctorAndroid() {
  const packages = installedPackages();
  const checks = [];
  const androidHome = defaultAndroidHome();
  const javaHome = detectJava17Home();
  const java = javaHome ? path.join(javaHome, 'bin/java') : findTool('java');
  const javaVersion = java ? run(java, ['-version']) : { ok: false, stderr: 'java not found' };

  checks.push({
    name: 'JDK 17',
    ok: Boolean(javaHome) && javaVersion.ok,
    detail: javaHome || javaVersion.stderr,
  });
  checks.push({
    name: 'Android SDK',
    ok: Boolean(androidHome),
    detail: androidHome || 'ANDROID_HOME is not set and SDK was not found',
  });
  for (const tool of ['sdkmanager', 'adb', 'emulator']) {
    const found = findTool(tool);
    checks.push({ name: tool, ok: Boolean(found), detail: found || 'not found' });
  }
  for (const pkg of ['platform-tools', 'platforms;android-35', 'build-tools;35.0.0']) {
    checks.push({ name: pkg, ok: packages.includes(pkg), detail: packages.includes(pkg) ? 'installed' : 'missing' });
  }
  const avds = avdNames();
  checks.push({ name: 'Android AVD', ok: avds.length > 0, detail: avds.join(', ') || 'none found' });
  checks.push({
    name: 'Gradle runner',
    ok: Boolean(findTool('gradle') || findTool('curl') || isExecutable('/usr/bin/curl')),
    detail: findTool('gradle') || `will cache Gradle ${ANDROID_GRADLE_VERSION} under .aic/android/.gradle-dist`,
  });

  for (const check of checks) {
    console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
  }

  return !checks.some(check => !check.ok);
}

export function dryRunAndroid(root, screens) {
  const host = prepareAndroidHost(root, screens);
  const commands = androidCommandPlan(root);

  console.log(`→ .aic/android`);
  console.log(`→ .aic/android/app/src/main/java/app/generated/*.kt`);
  console.log(`→ Android host template: ${host.template}`);
  console.log('');
  console.log('Android dry run command plan:');
  for (const command of commands) {
    console.log(`$ ${formatCommand(command, root)}`);
  }
}

export function devAndroid(root, screens) {
  const host = prepareAndroidHost(root, screens);
  console.log(`→ .aic/android`);
  console.log(`→ .aic/android/app/src/main/java/app/generated/*.kt`);
  console.log(`→ Android host template: ${host.template}`);

  if (!doctorAndroid()) process.exit(1);

  const gradle = ensureGradle(root);
  const apk = path.join(root, '.aic/android/app/build/outputs/apk/debug/app-debug.apk');
  const adb = findTool('adb');

  console.log('');
  runLogged(gradle, ['--no-daemon', '--console=plain', '-p', path.join(root, '.aic/android'), ':app:assembleDebug'], root);
  ensureAndroidDevice(root);
  runLogged(adb, ['install', '-r', apk], root);
  runLogged(adb, ['shell', 'am', 'start', '-n', `${ANDROID_APPLICATION_ID}/${ANDROID_NAMESPACE}.MainActivity`], root);

  console.log('');
  console.log('Android app is running.');
}
