import path from 'node:path';
import {
  ANDROID_GRADLE_VERSION,
  androidCommandPlan,
  defaultAndroidHome,
  detectJava17Home,
  formatCommand,
  prepareAndroidHost,
} from './android-host.mjs';
import { firstLine } from './dev/process.mjs';
import { installRuntimeAndroid } from './runtime/install.mjs';
import {
  avdNames,
  ensureAndroidDevice,
  ensureGradle,
  findTool,
  installedPackages,
  isExecutable,
  runAndroid,
  runAndroidLogged,
} from './dev/android-env.mjs';

export function doctorAndroid() {
  const packages = installedPackages();
  const checks = [];
  const androidHome = defaultAndroidHome();
  const javaHome = detectJava17Home();
  const java = javaHome ? path.join(javaHome, 'bin/java') : findTool('java');
  const javaVersion = java ? runAndroid(java, ['-version']) : { ok: false, stderr: 'java not found' };

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

export function dryRunAndroid(root, screens, config, options = {}) {
  const host = prepareAndroidHost(root, screens, config, options);
  const commands = androidCommandPlan(root, undefined, config);

  console.log(`→ .aic/android`);
  console.log(`→ .aic/android/app/src/main/java/app/generated/*.kt`);
  console.log(`→ Android host template: ${host.template}`);
  console.log('');
  console.log('Android dry run command plan:');
  for (const command of commands) {
    console.log(`$ ${formatCommand(command, root)}`);
  }
}

export function devAndroid(root, screens, config, options = {}) {
  const host = prepareAndroidHost(root, screens, config, options);
  console.log(`→ .aic/android`);
  console.log(`→ .aic/android/app/src/main/java/app/generated/*.kt`);
  console.log(`→ Android host template: ${host.template}`);

  if (!doctorAndroid()) process.exit(1);

  const gradle = ensureGradle(root);
  const apk = path.join(root, '.aic/android/app/build/outputs/apk/debug/app-debug.apk');
  const adb = findTool('adb');

  console.log('');
  runAndroidLogged(gradle, ['--no-daemon', '--console=plain', '-p', path.join(root, '.aic/android'), ':app:assembleDebug'], root);
  ensureAndroidDevice(root);
  runAndroidLogged(adb, ['install', '-r', apk], root);
  if (options.mode === 'runtime') installRuntimeAndroid(root, config);
  const startCommand = androidCommandPlan(root, undefined, config).at(-1);
  runAndroidLogged(startCommand[0], startCommand[1], root);

  console.log('');
  console.log('Android app is running.');
}
