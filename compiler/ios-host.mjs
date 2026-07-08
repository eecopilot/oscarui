import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP_NAME = 'OscarUI';
const BUNDLE_ID = 'app.generated.OscarUI';
const IOS_DEPLOYMENT_TARGET = '17.0';
const IOS_HOST_TEMPLATE = 'xcode-26-swiftui-filesystem-synchronized-app';

function iosConfig(config = {}) {
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

function iosOrientations(value) {
  if (value === 'landscape') return ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  if (value === 'all') return ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  return ['UIInterfaceOrientationPortrait'];
}

function iosOrientationsBuildSetting(value) {
  return `"${iosOrientations(value).join(' ')}"`;
}

function plistEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emitInfoPlist(config = {}) {
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
    '    <dict/>',
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

function emitEntitlements(config = {}) {
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

function id(label) {
  return crypto.createHash('sha1').update(label).digest('hex').slice(0, 24).toUpperCase();
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function resetPath(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyGeneratedSwift(root, sourceDir, appDir) {
  const files = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith('.swift'))
    .sort();

  if (!files.length) {
    throw new Error('ios host: no generated Swift files found. Run build first.');
  }

  fs.mkdirSync(appDir, { recursive: true });

  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(appDir, file));
  }

  return files.map(file => ({
    name: file,
    path: path.relative(root, path.join(appDir, file)),
  }));
}

function copyNativeSwift(root, appDir) {
  const sourceDir = path.join(root, 'native/ios');
  if (!fs.existsSync(sourceDir)) return [];

  const files = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith('.swift'))
    .sort();

  fs.mkdirSync(appDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(appDir, file));
  }

  return files.map(file => ({
    name: file,
    path: path.relative(root, path.join(appDir, file)),
  }));
}

function emitAssetCatalogContents() {
  return `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function emitAppIconContents() {
  return `{
  "images" : [
    {
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function emitAccentColorContents() {
  return `{
  "colors" : [
    {
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function emitWorkspace() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "self:">
   </FileRef>
</Workspace>
`;
}

function emitScheme(config = {}) {
  const ios = iosConfig(config);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "2630"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${id('target')}"
               BuildableName = "${ios.appName}.app"
               BlueprintName = "${ios.appName}"
               ReferencedContainer = "container:${ios.appName}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${id('target')}"
            BuildableName = "${ios.appName}.app"
            BlueprintName = "${ios.appName}"
            ReferencedContainer = "container:${ios.appName}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${id('target')}"
            BuildableName = "${ios.appName}.app"
            BlueprintName = "${ios.appName}"
            ReferencedContainer = "container:${ios.appName}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

function buildSettings(configuration, config = {}) {
  const ios = iosConfig(config);
  return [
    '                ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
    '                ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;',
    `                CODE_SIGN_ENTITLEMENTS = ${ios.appName}/${ios.appName}.entitlements;`,
    '                CODE_SIGN_STYLE = Automatic;',
    `                CURRENT_PROJECT_VERSION = ${ios.versionCode};`,
    '                DEVELOPMENT_TEAM = "";',
    '                ENABLE_PREVIEWS = YES;',
    '                GENERATE_INFOPLIST_FILE = NO;',
    '                INFOPLIST_FILE = GeneratedInfo.plist;',
    '                INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;',
    '                INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;',
    '                INFOPLIST_KEY_UILaunchScreen_Generation = YES;',
    `                INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = ${iosOrientationsBuildSetting(ios.orientation.tablet)};`,
    `                INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = ${iosOrientationsBuildSetting(ios.orientation.phone)};`,
    '                LD_RUNPATH_SEARCH_PATHS = (',
    '                    "$(inherited)",',
    '                    "@executable_path/Frameworks",',
    '                );',
    `                MARKETING_VERSION = ${ios.versionName};`,
    `                PRODUCT_BUNDLE_IDENTIFIER = ${ios.bundleId};`,
    '                PRODUCT_NAME = "$(TARGET_NAME)";',
    '                STRING_CATALOG_GENERATE_SYMBOLS = YES;',
    '                SWIFT_APPROACHABLE_CONCURRENCY = YES;',
    '                SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor;',
    '                SWIFT_EMIT_LOC_STRINGS = YES;',
    '                SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY = YES;',
    '                SWIFT_VERSION = 5.0;',
    '                TARGETED_DEVICE_FAMILY = "1,2";',
  ].join('\n');
}

function projectBuildSettings(configuration, config = {}) {
  const ios = iosConfig(config);
  const common = [
    '                ALWAYS_SEARCH_USER_PATHS = NO;',
    '                ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES;',
    '                CLANG_ANALYZER_NONNULL = YES;',
    '                CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;',
    '                CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";',
    '                CLANG_ENABLE_MODULES = YES;',
    '                CLANG_ENABLE_OBJC_ARC = YES;',
    '                CLANG_ENABLE_OBJC_WEAK = YES;',
    '                CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;',
    '                CLANG_WARN_BOOL_CONVERSION = YES;',
    '                CLANG_WARN_COMMA = YES;',
    '                CLANG_WARN_CONSTANT_CONVERSION = YES;',
    '                CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;',
    '                CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;',
    '                CLANG_WARN_DOCUMENTATION_COMMENTS = YES;',
    '                CLANG_WARN_EMPTY_BODY = YES;',
    '                CLANG_WARN_ENUM_CONVERSION = YES;',
    '                CLANG_WARN_INFINITE_RECURSION = YES;',
    '                CLANG_WARN_INT_CONVERSION = YES;',
    '                CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;',
    '                CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;',
    '                CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;',
    '                CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;',
    '                CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;',
    '                CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;',
    '                CLANG_WARN_STRICT_PROTOTYPES = YES;',
    '                CLANG_WARN_SUSPICIOUS_MOVE = YES;',
    '                CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;',
    '                CLANG_WARN_UNREACHABLE_CODE = YES;',
    '                CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;',
    '                COPY_PHASE_STRIP = NO;',
  ];

  const debug = [
    '                DEBUG_INFORMATION_FORMAT = dwarf;',
    '                DEVELOPMENT_TEAM = "";',
    '                ENABLE_STRICT_OBJC_MSGSEND = YES;',
    '                ENABLE_TESTABILITY = YES;',
    '                ENABLE_USER_SCRIPT_SANDBOXING = YES;',
    '                GCC_C_LANGUAGE_STANDARD = gnu17;',
    '                GCC_DYNAMIC_NO_PIC = NO;',
    '                GCC_NO_COMMON_BLOCKS = YES;',
    '                GCC_OPTIMIZATION_LEVEL = 0;',
    '                GCC_PREPROCESSOR_DEFINITIONS = (',
    '                    "DEBUG=1",',
    '                    "$(inherited)",',
    '                );',
    '                GCC_WARN_64_TO_32_BIT_CONVERSION = YES;',
    '                GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;',
    '                GCC_WARN_UNDECLARED_SELECTOR = YES;',
    '                GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;',
    '                GCC_WARN_UNUSED_FUNCTION = YES;',
    '                GCC_WARN_UNUSED_VARIABLE = YES;',
    `                IPHONEOS_DEPLOYMENT_TARGET = ${ios.deploymentTarget};`,
    '                LOCALIZATION_PREFERS_STRING_CATALOGS = YES;',
    '                MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;',
    '                MTL_FAST_MATH = YES;',
    '                ONLY_ACTIVE_ARCH = YES;',
    '                SDKROOT = iphoneos;',
    '                SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";',
    '                SWIFT_OPTIMIZATION_LEVEL = "-Onone";',
  ];

  const release = [
    '                DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";',
    '                DEVELOPMENT_TEAM = "";',
    '                ENABLE_NS_ASSERTIONS = NO;',
    '                ENABLE_STRICT_OBJC_MSGSEND = YES;',
    '                ENABLE_USER_SCRIPT_SANDBOXING = YES;',
    '                GCC_C_LANGUAGE_STANDARD = gnu17;',
    '                GCC_NO_COMMON_BLOCKS = YES;',
    '                GCC_WARN_64_TO_32_BIT_CONVERSION = YES;',
    '                GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;',
    '                GCC_WARN_UNDECLARED_SELECTOR = YES;',
    '                GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;',
    '                GCC_WARN_UNUSED_FUNCTION = YES;',
    '                GCC_WARN_UNUSED_VARIABLE = YES;',
    `                IPHONEOS_DEPLOYMENT_TARGET = ${ios.deploymentTarget};`,
    '                LOCALIZATION_PREFERS_STRING_CATALOGS = YES;',
    '                MTL_ENABLE_DEBUG_INFO = NO;',
    '                MTL_FAST_MATH = YES;',
    '                SDKROOT = iphoneos;',
    '                SWIFT_COMPILATION_MODE = wholemodule;',
    '                VALIDATE_PRODUCT = YES;',
  ];

  return [
    ...common,
    ...(configuration === 'Debug' ? debug : release),
  ].join('\n');
}

// Keep this close to a fresh Xcode SwiftUI app project. If the desired host
// skeleton changes, update this template block first and keep dev flow logic
// outside it.
function emitProject(config = {}) {
  const ios = iosConfig(config);
  return `// !$*UTF8*$!
{
    archiveVersion = 1;
    classes = {
    };
    objectVersion = 77;
    objects = {

/* Begin PBXFileReference section */
        ${id(`product:${ios.appName}.app`)} /* ${ios.appName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${ios.appName}.app; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
        ${id('fsroot:app')} /* ${ios.appName} */ = {
            isa = PBXFileSystemSynchronizedRootGroup;
            path = ${ios.appName};
            sourceTree = "<group>";
        };
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
        ${id('phase:frameworks')} /* Frameworks */ = {
            isa = PBXFrameworksBuildPhase;
            buildActionMask = 2147483647;
            files = (
            );
            runOnlyForDeploymentPostprocessing = 0;
        };
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
        ${id('group:root')} = {
            isa = PBXGroup;
            children = (
                ${id('fsroot:app')} /* ${ios.appName} */,
                ${id('group:products')} /* Products */,
            );
            sourceTree = "<group>";
        };
        ${id('group:products')} /* Products */ = {
            isa = PBXGroup;
            children = (
                ${id(`product:${ios.appName}.app`)} /* ${ios.appName}.app */,
            );
            name = Products;
            sourceTree = "<group>";
        };
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
        ${id('target')} /* ${ios.appName} */ = {
            isa = PBXNativeTarget;
            buildConfigurationList = ${id('configlist:target')} /* Build configuration list for PBXNativeTarget "${ios.appName}" */;
            buildPhases = (
                ${id('phase:sources')} /* Sources */,
                ${id('phase:frameworks')} /* Frameworks */,
                ${id('phase:resources')} /* Resources */,
            );
            buildRules = (
            );
            dependencies = (
            );
            fileSystemSynchronizedGroups = (
                ${id('fsroot:app')} /* ${ios.appName} */,
            );
            name = ${ios.appName};
            packageProductDependencies = (
            );
            productName = ${ios.appName};
            productReference = ${id(`product:${ios.appName}.app`)} /* ${ios.appName}.app */;
            productType = "com.apple.product-type.application";
        };
/* End PBXNativeTarget section */

/* Begin PBXProject section */
        ${id('project')} /* Project object */ = {
            isa = PBXProject;
            attributes = {
                BuildIndependentTargetsInParallel = 1;
                LastSwiftUpdateCheck = 2630;
                LastUpgradeCheck = 2630;
                TargetAttributes = {
                    ${id('target')} = {
                        CreatedOnToolsVersion = 26.3;
                    };
                };
            };
            buildConfigurationList = ${id('configlist:project')} /* Build configuration list for PBXProject "${ios.appName}" */;
            developmentRegion = en;
            hasScannedForEncodings = 0;
            knownRegions = (
                en,
                Base,
            );
            mainGroup = ${id('group:root')};
            minimizedProjectReferenceProxies = 1;
            preferredProjectObjectVersion = 77;
            productRefGroup = ${id('group:products')} /* Products */;
            projectDirPath = "";
            projectRoot = "";
            targets = (
                ${id('target')} /* ${ios.appName} */,
            );
        };
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
        ${id('phase:resources')} /* Resources */ = {
            isa = PBXResourcesBuildPhase;
            buildActionMask = 2147483647;
            files = (
            );
            runOnlyForDeploymentPostprocessing = 0;
        };
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
        ${id('phase:sources')} /* Sources */ = {
            isa = PBXSourcesBuildPhase;
            buildActionMask = 2147483647;
            files = (
            );
            runOnlyForDeploymentPostprocessing = 0;
        };
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
        ${id('config:project:Debug')} /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
${projectBuildSettings('Debug', config)}
            };
            name = Debug;
        };
        ${id('config:project:Release')} /* Release */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
${projectBuildSettings('Release', config)}
            };
            name = Release;
        };
        ${id('config:target:Debug')} /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
${buildSettings('Debug', config)}
            };
            name = Debug;
        };
        ${id('config:target:Release')} /* Release */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
${buildSettings('Release', config)}
            };
            name = Release;
        };
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
        ${id('configlist:project')} /* Build configuration list for PBXProject "${ios.appName}" */ = {
            isa = XCConfigurationList;
            buildConfigurations = (
                ${id('config:project:Debug')} /* Debug */,
                ${id('config:project:Release')} /* Release */,
            );
            defaultConfigurationIsVisible = 0;
            defaultConfigurationName = Release;
        };
        ${id('configlist:target')} /* Build configuration list for PBXNativeTarget "${ios.appName}" */ = {
            isa = XCConfigurationList;
            buildConfigurations = (
                ${id('config:target:Debug')} /* Debug */,
                ${id('config:target:Release')} /* Release */,
            );
            defaultConfigurationIsVisible = 0;
            defaultConfigurationName = Release;
        };
/* End XCConfigurationList section */
    };
    rootObject = ${id('project')} /* Project object */;
}
`;
}

export function prepareIosHost(root, config = {}) {
  const ios = iosConfig(config);
  const iosRoot = path.join(root, '.aic/ios');
  const appDir = path.join(iosRoot, ios.appName);
  const projectDir = path.join(iosRoot, `${ios.appName}.xcodeproj`);
  const generatedSourceDir = path.join(root, 'generated/ios');

  resetPath(appDir);
  resetPath(projectDir);

  const sourceFiles = [
    ...copyGeneratedSwift(root, generatedSourceDir, appDir),
    ...copyNativeSwift(root, appDir),
  ];

  writeFile(path.join(appDir, 'Assets.xcassets/Contents.json'), emitAssetCatalogContents());
  writeFile(path.join(appDir, 'Assets.xcassets/AppIcon.appiconset/Contents.json'), emitAppIconContents());
  writeFile(path.join(appDir, 'Assets.xcassets/AccentColor.colorset/Contents.json'), emitAccentColorContents());
  writeFile(path.join(iosRoot, 'GeneratedInfo.plist'), emitInfoPlist(config));
  writeFile(path.join(appDir, `${ios.appName}.entitlements`), emitEntitlements(config));
  writeFile(path.join(projectDir, 'project.pbxproj'), emitProject(config));
  writeFile(path.join(projectDir, 'project.xcworkspace/contents.xcworkspacedata'), emitWorkspace());
  writeFile(path.join(projectDir, `xcshareddata/xcschemes/${ios.appName}.xcscheme`), emitScheme(config));

  return {
    appName: ios.appName,
    bundleId: ios.bundleId,
    template: IOS_HOST_TEMPLATE,
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
