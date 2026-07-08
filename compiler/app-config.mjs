import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export function loadAppConfig(root) {
  const file = path.join(root, 'src/app.config.yaml');
  if (!fs.existsSync(file)) throw new Error('src/app.config.yaml is required');
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function appConfigProblems(config) {
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

  return problems;
}

