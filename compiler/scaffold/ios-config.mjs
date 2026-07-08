const APP_NAME = 'OscarUI';
const BUNDLE_ID = 'app.generated.OscarUI';
const IOS_DEPLOYMENT_TARGET = '17.0';
export const IOS_HOST_TEMPLATE = 'xcode-26-swiftui-filesystem-synchronized-app';

export function iosConfig(config = {}) {
  return {
    appName: config.app?.name ?? APP_NAME,
    displayName: config.app?.displayName ?? config.app?.name ?? APP_NAME,
    bundleId: config.app?.bundleId ?? BUNDLE_ID,
    versionName: config.app?.versionName ?? '1.0',
    versionCode: String(config.app?.versionCode ?? 1),
    deploymentTarget: config.platform?.ios?.deploymentTarget ?? IOS_DEPLOYMENT_TARGET,
    permissions: config.permissions ?? {},
    privacy: config.privacy ?? {},
    links: config.links ?? {},
    orientation: config.orientation ?? {},
  };
}

export function iosOrientations(value) {
  if (value === 'landscape') return ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  if (value === 'all') return ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  return ['UIInterfaceOrientationPortrait'];
}

export function iosOrientationsBuildSetting(value) {
  return `"${iosOrientations(value).join(' ')}"`;
}

export function plistEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
