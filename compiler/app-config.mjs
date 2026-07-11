import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export function loadAppConfig(root) {
  const file = path.join(root, 'src/app.config.yaml');
  if (!fs.existsSync(file)) throw new Error('src/app.config.yaml is required');
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function appConfigProblems(config, root = process.cwd()) {
  const problems = [];
  const privacy = config.privacy ?? {};
  const permissions = config.permissions ?? {};
  const requiredUsage = [
    ['camera', 'cameraUsage'],
    ['photoLibrary', 'photoLibraryUsage'],
    ['locationWhenInUse', 'locationWhenInUseUsage'],
    ['microphone', 'microphoneUsage'],
  ];

  for (const [permission, usageKey] of requiredUsage) {
    if (permissions[permission]?.enabled && !String(privacy[usageKey] ?? '').trim()) {
      problems.push(`permission "${permission}" requires privacy.${usageKey}`);
    }
  }

  if ((config.platform?.android?.minSdk ?? 0) > (config.platform?.android?.targetSdk ?? 0)) {
    problems.push('platform.android.minSdk cannot be greater than targetSdk');
  }
  if ((config.platform?.android?.targetSdk ?? 0) > (config.platform?.android?.compileSdk ?? 0)) {
    problems.push('platform.android.targetSdk cannot be greater than compileSdk');
  }

  if (config.runtime?.allowRemoteUpdates && !String(config.runtime?.remoteBundleURL ?? '').startsWith('https://')) {
    problems.push('runtime.allowRemoteUpdates requires an https runtime.remoteBundleURL');
  }

  for (const [name, relative] of Object.entries(config.assets ?? {})) {
    const file = path.resolve(root, relative);
    const assetRoot = path.resolve(root, 'src/assets');
    if (!file.startsWith(`${assetRoot}${path.sep}`)) {
      problems.push(`assets.${name} must stay inside src/assets/`);
    } else if (!fs.existsSync(file)) {
      problems.push(`assets.${name} file does not exist: ${relative}`);
    } else {
      const header = fs.readFileSync(file).subarray(0, 24);
      if (header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        problems.push(`assets.${name} must be a PNG file: ${relative}`);
      } else if (name === 'appIcon' && (header.readUInt32BE(16) !== 1024 || header.readUInt32BE(20) !== 1024)) {
        problems.push('assets.appIcon must be a 1024x1024 PNG');
      }
    }
  }

  return problems;
}
