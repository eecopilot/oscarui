import fs from 'node:fs';
import path from 'node:path';

export const ANDROID_APP_NAME = 'OscarUI';
export const ANDROID_APPLICATION_ID = 'app.generated.oscarui';
export const ANDROID_NAMESPACE = 'app.generated';
export const ANDROID_COMPILE_SDK = 35;
export const ANDROID_MIN_SDK = 23;
export const ANDROID_TARGET_SDK = 35;
export const ANDROID_GRADLE_VERSION = '8.10.2';
export const ANDROID_HOST_TEMPLATE = 'gradle-compose-android35-app';

function androidConfig(config = {}) {
  return {
    appName: config.app?.name ?? ANDROID_APP_NAME,
    displayName: config.app?.displayName ?? config.app?.name ?? ANDROID_APP_NAME,
    applicationId: config.app?.applicationId ?? ANDROID_APPLICATION_ID,
    namespace: ANDROID_NAMESPACE,
    versionName: config.app?.versionName ?? '1.0',
    versionCode: config.app?.versionCode ?? 1,
    compileSdk: config.platform?.android?.compileSdk ?? ANDROID_COMPILE_SDK,
    minSdk: config.platform?.android?.minSdk ?? ANDROID_MIN_SDK,
    targetSdk: config.platform?.android?.targetSdk ?? ANDROID_TARGET_SDK,
    permissions: config.permissions ?? {},
    links: config.links ?? {},
  };
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function resetPath(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyGeneratedKotlin(root, sourceDir, targetDir) {
  const files = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith('.kt'))
    .sort();

  if (!files.length) {
    throw new Error('android host: no generated Kotlin files found. Run build first.');
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  return files.map(file => ({
    name: file,
    path: path.relative(root, path.join(targetDir, file)),
  }));
}

function copyNativeKotlin(root, targetDir) {
  const sourceDir = path.join(root, 'src/native/android');
  if (!fs.existsSync(sourceDir)) return [];

  const files = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith('.kt'))
    .sort();

  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  return files.map(file => ({
    name: file,
    path: path.relative(root, path.join(targetDir, file)),
  }));
}

export function defaultAndroidHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    '/opt/homebrew/share/android-commandlinetools',
    path.join(process.env.HOME ?? '', 'Library/Android/sdk'),
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(candidate)) ?? '';
}

export function detectJava17Home() {
  const candidates = [
    '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home',
    process.env.JAVA_HOME,
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'bin/java'))) ?? '';
}

function emitSettingsGradle(config = {}) {
  const android = androidConfig(config);
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${android.appName}"
include(":app")
`;
}

function emitRootBuildGradle() {
  return `plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
`;
}

function emitAppBuildGradle(config = {}) {
  const android = androidConfig(config);
  return `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${android.namespace}"
    compileSdk = ${android.compileSdk}

    defaultConfig {
        applicationId = "${android.applicationId}"
        minSdk = ${android.minSdk}
        targetSdk = ${android.targetSdk}
        versionCode = ${android.versionCode}
        versionName = "${android.versionName}"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("io.coil-kt:coil-compose:2.7.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
`;
}

function emitGradleProperties(javaHome) {
  const lines = [
    'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8',
    'android.useAndroidX=true',
    'android.nonTransitiveRClass=true',
  ];
  if (javaHome) lines.push(`org.gradle.java.home=${javaHome.replace(/\\/g, '/')}`);
  lines.push(...emitProxyProperties());
  return `${lines.join('\n')}\n`;
}

function parseProxyUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return {
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
    };
  } catch {
    return null;
  }
}

function emitProxyProperties() {
  const http = parseProxyUrl(process.env.HTTP_PROXY ?? process.env.http_proxy);
  const https = parseProxyUrl(process.env.HTTPS_PROXY ?? process.env.https_proxy) ?? http;
  const lines = [];

  function pushProxy(prefix, proxy) {
    if (!proxy) return;
    lines.push(`systemProp.${prefix}.proxyHost=${proxy.host}`);
    lines.push(`systemProp.${prefix}.proxyPort=${proxy.port}`);
    if (proxy.username) lines.push(`systemProp.${prefix}.proxyUser=${proxy.username}`);
    if (proxy.password) lines.push(`systemProp.${prefix}.proxyPassword=${proxy.password}`);
  }

  pushProxy('http', http);
  pushProxy('https', https);

  if (http || https) {
    const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? 'localhost,127.0.0.1,::1';
    const nonProxyHosts = noProxy
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value === '*' ? '*' : value.replace(/^\./, '*.'))
      .join('|');
    if (nonProxyHosts) {
      lines.push(`systemProp.http.nonProxyHosts=${nonProxyHosts}`);
      lines.push(`systemProp.https.nonProxyHosts=${nonProxyHosts}`);
    }
  }

  return lines;
}

function emitLocalProperties(androidHome) {
  return `sdk.dir=${androidHome.replace(/\\/g, '/')}\n`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function androidPermissionNames(permissions = {}) {
  const names = [];
  if (permissions.camera?.enabled) names.push('android.permission.CAMERA');
  if (permissions.microphone?.enabled) names.push('android.permission.RECORD_AUDIO');
  if (permissions.locationWhenInUse?.enabled) names.push('android.permission.ACCESS_FINE_LOCATION');
  if (permissions.photoLibrary?.enabled) names.push('android.permission.READ_MEDIA_IMAGES');
  if (permissions.notifications?.enabled) names.push('android.permission.POST_NOTIFICATIONS');
  return names;
}

function emitAndroidAppLinks(links = {}) {
  return (links.androidAppLinks ?? []).map(link => `            <intent-filter${link.autoVerify === false ? '' : ' android:autoVerify="true"'}>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${xmlEscape(link.host)}"${link.pathPrefix ? ` android:pathPrefix="${xmlEscape(link.pathPrefix)}"` : ''} />
            </intent-filter>`).join('\n');
}

function emitManifest(config = {}) {
  const android = androidConfig(config);
  const permissions = androidPermissionNames(android.permissions).map(permission => `    <uses-permission android:name="${permission}" />`);
  const appLinks = emitAndroidAppLinks(android.links);
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissions.length ? `${permissions.join('\n')}\n` : ''}
    <application
        android:label="${xmlEscape(android.displayName)}"
        android:theme="@style/AppTheme">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
${appLinks ? `${appLinks}\n` : ''}
        </activity>
    </application>
</manifest>
`;
}

function emitStyles() {
  return `<resources>
    <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar" />
</resources>
`;
}

function emitMainActivity(entryScreen, screens) {
  const lines = [
    'package app.generated',
    '',
    'import android.os.Bundle',
    'import androidx.activity.ComponentActivity',
    'import androidx.activity.compose.setContent',
    'import androidx.compose.foundation.background',
    'import androidx.compose.foundation.layout.Box',
    'import androidx.compose.foundation.layout.fillMaxSize',
    'import androidx.compose.foundation.layout.padding',
    'import androidx.compose.foundation.layout.statusBarsPadding',
    'import androidx.compose.material3.IconButton',
    'import androidx.compose.material3.MaterialTheme',
    'import androidx.compose.material3.Surface',
    'import androidx.compose.material3.Text',
    'import androidx.compose.runtime.Composable',
    'import androidx.compose.runtime.getValue',
    'import androidx.compose.ui.Alignment',
    'import androidx.compose.ui.Modifier',
    'import androidx.compose.ui.unit.dp',
    'import androidx.navigation.compose.NavHost',
    'import androidx.navigation.compose.composable',
    'import androidx.navigation.compose.currentBackStackEntryAsState',
    'import androidx.navigation.compose.rememberNavController',
    '',
    'class MainActivity : ComponentActivity() {',
    '    override fun onCreate(savedInstanceState: Bundle?) {',
    '        super.onCreate(savedInstanceState)',
    '        setContent {',
    '            OscarUIRoot()',
    '        }',
    '    }',
    '}',
    '',
    '@Composable',
    'private fun OscarUIRoot() {',
    '    val navController = rememberNavController()',
    '    val backStackEntry by navController.currentBackStackEntryAsState()',
    '    val currentRoute = backStackEntry?.destination?.route',
    '    MaterialTheme {',
    '        Surface(',
    '            modifier = Modifier',
    '                .fillMaxSize()',
    '                .background(Theme.Colors.background),',
    '            color = Theme.Colors.background',
    '        ) {',
    '            Box(modifier = Modifier.fillMaxSize()) {',
    '                NavHost(',
    '                    navController = navController,',
    `                    startDestination = "${entryScreen}",`,
    `                    modifier = Modifier.padding(top = if (currentRoute != null && currentRoute != "${entryScreen}") 56.dp else 0.dp)`,
    '                ) {',
    ...screens.map(screen => [
      `                    composable("${screen}") {`,
      `                        ${screen}Screen(actions = ${screen}ActionsImpl(), navController = navController)`,
      '                    }',
    ]).flat(),
    '                }',
    `                if (currentRoute != null && currentRoute != "${entryScreen}") {`,
    '                    IconButton(',
    '                        onClick = { navController.popBackStack() },',
    '                        modifier = Modifier',
    '                            .align(Alignment.TopStart)',
    '                            .statusBarsPadding()',
    '                            .padding(start = 8.dp, top = 8.dp)',
    '                    ) {',
    '                        Text(',
    '                            text = "\\u2039",',
    '                            style = Theme.Typography.title,',
    '                            color = Theme.Colors.textPrimary',
    '                        )',
    '                    }',
    '                }',
    '            }',
    '        }',
    '    }',
    '}',
  ];
  return lines.join('\n');
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
