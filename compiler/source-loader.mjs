import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { normalizeIr } from './ir-normalize.mjs';

export function loadTokens(srcRoot) {
  return YAML.parse(fs.readFileSync(path.join(srcRoot, 'theme/tokens.yaml'), 'utf8'));
}

export function loadScreens(root, screenDir, srcRoot) {
  return loadIrFiles(root, screenDir, srcRoot);
}

export function loadComponents(root, componentDir, srcRoot) {
  return loadIrFiles(root, componentDir, srcRoot);
}

function loadIrFiles(root, dir, srcRoot) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ui.yaml'))
    .sort()
    .map(f => {
      const sourceFile = path.join(dir, f);
      const raw = YAML.parse(fs.readFileSync(sourceFile, 'utf8'));
      return { file: path.relative(root, sourceFile), sourceFile, raw, ir: normalizeIr(raw, root, sourceFile, srcRoot) };
    });
}

