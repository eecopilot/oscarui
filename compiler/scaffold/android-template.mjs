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

export function androidConfig(config = {}) {
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
    assets: config.assets ?? {},
  };
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

export function emitSettingsGradle(config = {}) {
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

export function emitRootBuildGradle() {
  return `plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
`;
}

export function emitAppBuildGradle(config = {}) {
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

export function emitGradleProperties(javaHome) {
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

export function emitLocalProperties(androidHome) {
  return `sdk.dir=${androidHome.replace(/\\/g, '/')}\n`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function androidPermissionNames(permissions = {}, runtime = {}) {
  const names = [];
  if (runtime.allowRemoteUpdates) names.push('android.permission.INTERNET');
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

export function emitManifest(config = {}) {
  const android = androidConfig(config);
  const permissions = androidPermissionNames(android.permissions, config.runtime).map(permission => `    <uses-permission android:name="${permission}" />`);
  const appLinks = emitAndroidAppLinks(android.links);
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissions.length ? `${permissions.join('\n')}\n` : ''}
    <application
        android:label="${xmlEscape(android.displayName)}"
        ${android.assets.appIcon ? 'android:icon="@drawable/app_icon"\n        ' : ''}android:theme="@style/AppTheme">
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

export function emitStyles(config = {}) {
  const launchImage = config.assets?.launchImage;
  return `<resources>
    <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar">${launchImage ? '\n        <item name="android:windowBackground">@drawable/launch_screen</item>\n    ' : ''}</style>
</resources>
`;
}

export function emitLaunchDrawable() {
  return `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/white" />
    <item>
        <bitmap android:src="@drawable/launch_image" android:gravity="center" />
    </item>
</layer-list>
`;
}

export function emitMainActivity(entryScreen, screens, config = {}) {
  const animationsEnabled = config.navigation?.animation !== 'none';
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
    'import androidx.compose.runtime.mutableStateListOf',
    'import androidx.compose.runtime.remember',
    'import androidx.compose.ui.Alignment',
    'import androidx.compose.ui.Modifier',
    'import androidx.compose.ui.unit.dp',
    'import androidx.navigation.compose.NavHost',
    'import androidx.navigation.compose.composable',
    'import androidx.navigation.compose.currentBackStackEntryAsState',
    'import androidx.navigation.compose.rememberNavController',
    'import androidx.navigation.NavHostController',
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
    'interface OscarNavigator {',
    '    fun navigate(screen: String)',
    '    fun pop()',
    '}',
    '',
    ...(animationsEnabled ? [
      'private class OscarNavControllerNavigator(private val navController: NavHostController) : OscarNavigator {',
      '    override fun navigate(screen: String) { navController.navigate(screen) }',
      '    override fun pop() { navController.popBackStack() }',
      '}',
      '',
    ] : [
      'private class OscarStateNavigator(startDestination: String) : OscarNavigator {',
      '    private val path = mutableStateListOf(startDestination)',
      '    val currentRoute: String get() = path.last()',
      '    override fun navigate(screen: String) { path.add(screen) }',
      '    override fun pop() { if (path.size > 1) path.removeAt(path.lastIndex) }',
      '}',
      '',
    ]),
    '@Composable',
    'private fun OscarUIRoot() {',
    ...(animationsEnabled ? [
      '    val navController = rememberNavController()',
      '    val navigator = remember(navController) { OscarNavControllerNavigator(navController) }',
      '    val backStackEntry by navController.currentBackStackEntryAsState()',
      '    val currentRoute = backStackEntry?.destination?.route',
    ] : [
      `    val navigator = remember { OscarStateNavigator("${entryScreen}") }`,
      '    val currentRoute = navigator.currentRoute',
    ]),
    '    MaterialTheme {',
    '        Surface(',
    '            modifier = Modifier',
    '                .fillMaxSize()',
    '                .background(Theme.Colors.background),',
    '            color = Theme.Colors.background',
    '        ) {',
    '            Box(modifier = Modifier.fillMaxSize()) {',
    ...(animationsEnabled ? [
      '                NavHost(',
      '                    navController = navController,',
      `                    startDestination = "${entryScreen}",`,
      `                    modifier = Modifier.padding(top = if (currentRoute != null && currentRoute != "${entryScreen}") 56.dp else 0.dp)`,
      '                ) {',
      ...screens.map(screen => [
        `                    composable("${screen}") {`,
        `                        ${screen}Screen(actions = ${screen}ActionsImpl(), navigator = navigator)`,
        '                    }',
      ]).flat(),
      '                }',
    ] : [
      `                Box(modifier = Modifier.padding(top = if (currentRoute != "${entryScreen}") 56.dp else 0.dp)) {`,
      '                    when (currentRoute) {',
      ...screens.map(screen => `                        "${screen}" -> ${screen}Screen(actions = ${screen}ActionsImpl(), navigator = navigator)`),
      '                    }',
      '                }',
    ]),
    `                if (currentRoute != null && currentRoute != "${entryScreen}") {`,
    '                    IconButton(',
    '                        onClick = { navigator.pop() },',
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
