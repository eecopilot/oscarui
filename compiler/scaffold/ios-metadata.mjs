import { iosConfig, iosOrientations, plistEscape } from './ios-config.mjs';

export function emitInfoPlist(config = {}) {
  const ios = iosConfig(config);
  const privacyEntries = [];
  if (ios.permissions.camera?.enabled) privacyEntries.push(['NSCameraUsageDescription', ios.privacy.cameraUsage]);
  if (ios.permissions.photoLibrary?.enabled) privacyEntries.push(['NSPhotoLibraryUsageDescription', ios.privacy.photoLibraryUsage]);
  if (ios.permissions.locationWhenInUse?.enabled) privacyEntries.push(['NSLocationWhenInUseUsageDescription', ios.privacy.locationWhenInUseUsage]);
  if (ios.permissions.microphone?.enabled) privacyEntries.push(['NSMicrophoneUsageDescription', ios.privacy.microphoneUsage]);

  const urlSchemes = ios.links.urlSchemes ?? [];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>CFBundleExecutable</key>',
    '    <string>$(EXECUTABLE_NAME)</string>',
    '    <key>CFBundleIdentifier</key>',
    '    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>',
    '    <key>CFBundleInfoDictionaryVersion</key>',
    '    <string>6.0</string>',
    '    <key>CFBundleName</key>',
    '    <string>$(PRODUCT_NAME)</string>',
    '    <key>CFBundlePackageType</key>',
    '    <string>APPL</string>',
    '    <key>CFBundleDisplayName</key>',
    `    <string>${plistEscape(ios.displayName)}</string>`,
    '    <key>CFBundleShortVersionString</key>',
    `    <string>${plistEscape(ios.versionName)}</string>`,
    '    <key>CFBundleVersion</key>',
    `    <string>${plistEscape(ios.versionCode)}</string>`,
    '    <key>UIApplicationSceneManifest</key>',
    '    <dict>',
    '        <key>UIApplicationSupportsMultipleScenes</key>',
    '        <false/>',
    '        <key>UISceneConfigurations</key>',
    '        <dict>',
    '            <key>UIWindowSceneSessionRoleApplication</key>',
    '            <array>',
    '                <dict>',
    '                    <key>UISceneConfigurationName</key>',
    '                    <string>Default Configuration</string>',
    '                </dict>',
    '            </array>',
    '        </dict>',
    '    </dict>',
    '    <key>UIApplicationSupportsIndirectInputEvents</key>',
    '    <true/>',
    '    <key>UILaunchScreen</key>',
    ...(ios.assets.launchImage ? [
      '    <dict>',
      '        <key>UIImageName</key>',
      '        <string>LaunchImage</string>',
      '    </dict>',
    ] : ['    <dict/>']),
    '    <key>UISupportedInterfaceOrientations</key>',
    '    <array>',
    ...iosOrientations(ios.orientation.phone).map(value => `        <string>${value}</string>`),
    '    </array>',
    '    <key>UISupportedInterfaceOrientations~ipad</key>',
    '    <array>',
    ...iosOrientations(ios.orientation.tablet).map(value => `        <string>${value}</string>`),
    '    </array>',
  ];

  for (const [key, value] of privacyEntries) {
    lines.push(`    <key>${key}</key>`, `    <string>${plistEscape(value)}</string>`);
  }

  if (urlSchemes.length) {
    lines.push(
      '    <key>CFBundleURLTypes</key>',
      '    <array>',
      '        <dict>',
      '            <key>CFBundleURLSchemes</key>',
      '            <array>',
      ...urlSchemes.map(scheme => `                <string>${plistEscape(scheme)}</string>`),
      '            </array>',
      '        </dict>',
      '    </array>'
    );
  }

  lines.push('</dict>', '</plist>', '');
  return lines.join('\n');
}

export function emitEntitlements(config = {}) {
  const ios = iosConfig(config);
  const domains = ios.links.universalLinks ?? [];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
  ];

  if (domains.length) {
    lines.push(
      '    <key>com.apple.developer.associated-domains</key>',
      '    <array>',
      ...domains.map(domain => `        <string>applinks:${plistEscape(domain)}</string>`),
      '    </array>'
    );
  }

  lines.push('</dict>', '</plist>', '');
  return lines.join('\n');
}
