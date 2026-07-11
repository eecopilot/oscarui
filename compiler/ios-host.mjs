import fs from 'node:fs';
import path from 'node:path';

import { copyFilesByExtension, resetPath, writeFile } from './scaffold/host-utils.mjs';
import {
  IOS_HOST_TEMPLATE,
  emitAccentColorContents,
  emitAppIconContents,
  emitAssetCatalogContents,
  emitEntitlements,
  emitInfoPlist,
  emitProject,
  emitScheme,
  emitWorkspace,
  iosConfig,
} from './scaffold/ios-template.mjs';

function copyGeneratedSwift(root, sourceDir, appDir) {
  return copyFilesByExtension(root, sourceDir, appDir, '.swift', 'ios host: no generated Swift files found. Run build first.');
}

function copyNativeSwift(root, appDir) {
  const sourceDir = path.join(root, 'src/native/ios');
  if (!fs.existsSync(sourceDir)) return [];
  return copyFilesByExtension(root, sourceDir, appDir, '.swift');
}

export function prepareIosHost(root, config = {}, options = {}) {
  const ios = iosConfig(config);
  const iosRoot = path.join(root, '.aic/ios');
  const appDir = path.join(iosRoot, ios.appName);
  const projectDir = path.join(iosRoot, `${ios.appName}.xcodeproj`);
  const runtimeMode = options.mode === 'runtime';
  const generatedSourceDir = runtimeMode ? path.join(root, 'generated/runtime/ios') : path.join(root, 'generated/ios');

  resetPath(appDir);
  resetPath(projectDir);

  const sourceFiles = [
    ...copyGeneratedSwift(root, generatedSourceDir, appDir),
    ...copyNativeSwift(root, appDir),
  ];

  writeFile(path.join(appDir, 'Assets.xcassets/Contents.json'), emitAssetCatalogContents());
  writeFile(path.join(appDir, 'Assets.xcassets/AppIcon.appiconset/Contents.json'), emitAppIconContents());
  writeFile(path.join(appDir, 'Assets.xcassets/AccentColor.colorset/Contents.json'), emitAccentColorContents());
  if (runtimeMode) {
    fs.copyFileSync(path.join(root, 'generated/runtime/oscarui.runtime.json'), path.join(appDir, 'oscarui.runtime.json'));
  }
  writeFile(path.join(iosRoot, 'GeneratedInfo.plist'), emitInfoPlist(config));
  writeFile(path.join(appDir, `${ios.appName}.entitlements`), emitEntitlements(config));
  writeFile(path.join(projectDir, 'project.pbxproj'), emitProject(config));
  writeFile(path.join(projectDir, 'project.xcworkspace/contents.xcworkspacedata'), emitWorkspace());
  writeFile(path.join(projectDir, `xcshareddata/xcschemes/${ios.appName}.xcscheme`), emitScheme(config));

  return {
    appName: ios.appName,
    bundleId: ios.bundleId,
    template: runtimeMode ? `${IOS_HOST_TEMPLATE}+runtime` : IOS_HOST_TEMPLATE,
    iosRoot,
    project: path.join(projectDir, 'project.pbxproj'),
    scheme: ios.appName,
    sources: sourceFiles,
  };
}

export function iosCommandPlan(root, simulator = { udid: '<simulator-udid>' }, config = {}) {
  const ios = iosConfig(config);
  const iosRoot = path.join(root, '.aic/ios');
  const project = path.join(iosRoot, `${ios.appName}.xcodeproj`);
  const derivedData = path.join(iosRoot, 'DerivedData');
  const app = path.join(derivedData, `Build/Products/Debug-iphonesimulator/${ios.appName}.app`);
  const simulatorTarget = simulator.udid ?? '<simulator-udid>';
  const destination = simulator.udid
    ? `platform=iOS Simulator,id=${simulator.udid}`
    : `platform=iOS Simulator,name=${simulator.name}`;

  return [
    ['xcodebuild', ['-quiet', '-project', project, '-scheme', ios.appName, '-configuration', 'Debug', '-destination', destination, '-derivedDataPath', derivedData, 'build']],
    ['xcrun', ['simctl', 'boot', simulatorTarget]],
    ['xcrun', ['simctl', 'bootstatus', simulatorTarget, '-b']],
    ['open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', simulatorTarget]],
    ['xcrun', ['simctl', 'install', simulatorTarget, app]],
    ['xcrun', ['simctl', 'launch', simulatorTarget, ios.bundleId]],
  ];
}

export function formatCommand([command, args], root) {
  return [command, ...args].map(part => {
    const normalized = part.startsWith(root) ? path.relative(root, part) : part;
    return /\s/.test(normalized) ? JSON.stringify(normalized) : normalized;
  }).join(' ');
}
