import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { prepareAndroidHost } from './android-host.mjs';
import { prepareIosHost } from './ios-host.mjs';
import { loadScreens } from './source-loader.mjs';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(toolRoot, 'tests/fixtures/parity');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oscarui-host-'));

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

function treeHash(directory) {
  const hash = crypto.createHash('sha256');
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      const relative = path.relative(directory, file);
      hash.update(relative);
      if (entry.isDirectory()) visit(file);
      else hash.update(fs.readFileSync(file));
    }
  }
  visit(directory);
  return hash.digest('hex');
}

try {
  copyDirectory(fixture, temporary);
  copyDirectory(path.join(toolRoot, 'schema'), path.join(temporary, 'schema'));
  copyDirectory(path.join(toolRoot, 'runtime'), path.join(temporary, 'runtime'));
  const fakeSdk = path.join(temporary, 'android-sdk');
  fs.mkdirSync(fakeSdk);
  process.env.ANDROID_HOME = fakeSdk;
  const environment = { ...process.env, OSCARUI_PROJECT_ROOT: temporary };
  execFileSync(process.execPath, [path.join(toolRoot, 'compiler/aic.mjs'), 'build'], { env: environment, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(toolRoot, 'compiler/aic.mjs'), 'build:runtime'], { env: environment, stdio: 'pipe' });

  const srcRoot = path.join(temporary, 'src');
  const screens = loadScreens(temporary, path.join(srcRoot, 'screens'), srcRoot);
  const config = YAML.parse(fs.readFileSync(path.join(srcRoot, 'app.config.yaml'), 'utf8'));

  for (const mode of ['compile', 'runtime']) {
    const options = mode === 'runtime' ? { mode } : {};
    fs.rmSync(path.join(temporary, '.aic'), { recursive: true, force: true });
    prepareIosHost(temporary, config, options);
    prepareAndroidHost(temporary, screens, config, options);
    const first = treeHash(path.join(temporary, '.aic'));
    fs.rmSync(path.join(temporary, '.aic'), { recursive: true, force: true });
    prepareIosHost(temporary, config, options);
    prepareAndroidHost(temporary, screens, config, options);
    const second = treeHash(path.join(temporary, '.aic'));
    assert.equal(second, first, `${mode} host regeneration must be deterministic`);
  }

  assert.equal(fs.existsSync(path.join(temporary, '.aic/ios/ParityApp/Assets.xcassets/AppIcon.appiconset/AppIcon.png')), true);
  assert.equal(fs.existsSync(path.join(temporary, '.aic/ios/ParityApp/Assets.xcassets/LaunchImage.imageset/LaunchImage.png')), true);
  assert.equal(fs.existsSync(path.join(temporary, '.aic/android/app/src/main/res/drawable-nodpi/app_icon.png')), true);
  assert.equal(fs.existsSync(path.join(temporary, '.aic/android/app/src/main/res/drawable-nodpi/launch_image.png')), true);
  console.log('✓ compile/runtime native hosts rebuild deterministically with custom metadata and assets');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
