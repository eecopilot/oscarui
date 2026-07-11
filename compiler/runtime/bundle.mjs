import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalStringify } from './canonical-json.mjs';
import {
  RUNTIME_API_VERSION,
  RUNTIME_BUNDLE_FILE,
  RUNTIME_BUNDLE_FORMAT,
  RUNTIME_BUNDLE_VERSION,
  UI_SCHEMA_VERSION,
} from './constants.mjs';

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function compilerVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

export function createRuntimeBundle(root, { screens, components, tokens, appConfig }) {
  const entry = screens.find(({ ir }) => ir.entry)?.ir ?? screens[0]?.ir;
  if (!entry) throw new Error('runtime bundle: at least one screen is required');

  const content = canonicalStringify({
    manifest: {
      format: RUNTIME_BUNDLE_FORMAT,
      bundleVersion: RUNTIME_BUNDLE_VERSION,
      compatibility: {
        compilerVersion: compilerVersion(root),
        minRuntimeApi: RUNTIME_API_VERSION,
        maxRuntimeApi: RUNTIME_API_VERSION,
        uiSchemaVersion: UI_SCHEMA_VERSION,
      },
      entryScreen: entry.screen,
      screenOrder: screens.map(({ ir }) => ir.screen),
      metadata: {
        appName: appConfig.app.name,
        versionName: appConfig.app.versionName,
        versionCode: appConfig.app.versionCode,
      },
    },
    payload: {
      screens: screens.map(({ ir }) => ir),
      components: components.map(({ ir }) => ir),
      tokens,
      appConfig,
    },
  });

  return {
    contentHash: sha256(content),
    content,
  };
}

export function verifyRuntimeBundle(bundle) {
  if (!bundle || typeof bundle.content !== 'string' || typeof bundle.contentHash !== 'string') {
    return { ok: false, error: 'runtime bundle envelope must contain content and contentHash' };
  }
  const actualHash = sha256(bundle.content);
  if (actualHash !== bundle.contentHash) {
    return { ok: false, error: `runtime bundle hash mismatch: expected ${bundle.contentHash}, got ${actualHash}` };
  }
  let decoded;
  try {
    decoded = JSON.parse(bundle.content);
  } catch (error) {
    return { ok: false, error: `runtime bundle content is invalid JSON: ${error.message}` };
  }
  const manifest = decoded.manifest ?? {};
  if (manifest.format !== RUNTIME_BUNDLE_FORMAT || manifest.bundleVersion !== RUNTIME_BUNDLE_VERSION) {
    return { ok: false, error: 'runtime bundle format or version is unsupported' };
  }
  const compatibility = manifest.compatibility ?? {};
  if (compatibility.minRuntimeApi > RUNTIME_API_VERSION || compatibility.maxRuntimeApi < RUNTIME_API_VERSION) {
    return { ok: false, error: `runtime API ${RUNTIME_API_VERSION} is outside bundle compatibility range` };
  }
  if (compatibility.uiSchemaVersion !== UI_SCHEMA_VERSION) {
    return { ok: false, error: `UI schema version ${compatibility.uiSchemaVersion} is unsupported` };
  }
  return { ok: true, decoded, hash: actualHash };
}

export function emitRuntimeBundle(root, project) {
  const outputDir = path.join(root, 'generated/runtime');
  const file = path.join(outputDir, RUNTIME_BUNDLE_FILE);
  const bundle = createRuntimeBundle(root, project);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
  return { bundle, file };
}

export function loadRuntimeBundleFile(file) {
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { bundle, verification: verifyRuntimeBundle(bundle) };
}
