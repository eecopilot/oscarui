import fs from 'node:fs';
import path from 'node:path';

import { copyFilesByExtension, resetPath, writeFile } from './scaffold/host-utils.mjs';
import {
  ANDROID_HOST_TEMPLATE,
  androidConfig,
  defaultAndroidHome,
  detectJava17Home,
  emitAppBuildGradle,
  emitGradleProperties,
  emitLocalProperties,
  emitMainActivity,
  emitManifest,
  emitRootBuildGradle,
  emitSettingsGradle,
  emitStyles,
} from './scaffold/android-template.mjs';

export { ANDROID_GRADLE_VERSION, defaultAndroidHome, detectJava17Home } from './scaffold/android-template.mjs';

function copyGeneratedKotlin(root, sourceDir, targetDir) {
  return copyFilesByExtension(root, sourceDir, targetDir, '.kt', 'android host: no generated Kotlin files found. Run build first.');
}

function copyNativeKotlin(root, targetDir) {
  const sourceDir = path.join(root, 'src/native/android');
  if (!fs.existsSync(sourceDir)) return [];
  return copyFilesByExtension(root, sourceDir, targetDir, '.kt');
}

export function prepareAndroidHost(root, screens, config = {}) {
  const android = androidConfig(config);
  const androidRoot = path.join(root, '.aic/android');
  const appDir = path.join(androidRoot, 'app');
  const sourceDir = path.join(root, 'generated/android');
  const packageDir = path.join(appDir, 'src/main/java/app/generated');
  const androidHome = defaultAndroidHome();
  const javaHome = detectJava17Home();
  const entry = screens[0]?.ir;

  const entryScreen = screens.find(({ ir }) => ir.entry)?.ir ?? entry;
  if (!entryScreen) throw new Error('android host: at least one screen is required');
  if (!androidHome) throw new Error('android host: Android SDK not found. Set ANDROID_HOME.');

  resetPath(appDir);

  const sourceFiles = [
    ...copyGeneratedKotlin(root, sourceDir, packageDir),
    ...copyNativeKotlin(root, packageDir),
  ];
  writeFile(path.join(androidRoot, 'settings.gradle.kts'), emitSettingsGradle(config));
  writeFile(path.join(androidRoot, 'build.gradle.kts'), emitRootBuildGradle());
  writeFile(path.join(androidRoot, 'gradle.properties'), emitGradleProperties(javaHome));
  writeFile(path.join(androidRoot, 'local.properties'), emitLocalProperties(androidHome));
  writeFile(path.join(appDir, 'build.gradle.kts'), emitAppBuildGradle(config));
  writeFile(path.join(appDir, 'src/main/AndroidManifest.xml'), emitManifest(config));
  writeFile(path.join(appDir, 'src/main/res/values/styles.xml'), emitStyles());
  writeFile(path.join(packageDir, 'MainActivity.kt'), emitMainActivity(entryScreen.screen, screens.map(({ ir }) => ir.screen)));

  return {
    appName: android.appName,
    applicationId: android.applicationId,
    template: ANDROID_HOST_TEMPLATE,
    androidHome,
    androidRoot,
    gradleProject: androidRoot,
    sourceFiles,
  };
}

export function androidCommandPlan(root, avdName = process.env.AIC_ANDROID_AVD || 'oscarui_api35', config = {}) {
  const android = androidConfig(config);
  const androidRoot = path.join(root, '.aic/android');
  const apk = path.join(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk');
  return [
    ['gradle', ['--no-daemon', '--console=plain', '-p', androidRoot, ':app:assembleDebug']],
    ['emulator', ['-avd', avdName]],
    ['adb', ['wait-for-device']],
    ['adb', ['install', '-r', apk]],
    ['adb', ['shell', 'am', 'start', '-n', `${android.applicationId}/${android.namespace}.MainActivity`]],
  ];
}

export function formatCommand([command, args], root) {
  return [command, ...args].map(part => {
    const normalized = part.startsWith(root) ? path.relative(root, part) : part;
    return /\s/.test(normalized) ? JSON.stringify(normalized) : normalized;
  }).join(' ');
}
