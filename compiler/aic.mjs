#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { emitThemeSwift, emitScreenSwift } from './swiftui.mjs';
import { emitThemeKotlin, emitScreenKotlin } from './compose.mjs';
import { emitAppSwift } from './ios-shell.mjs';
import { doctorIos, devIos, dryRunIos } from './ios-dev.mjs';
import { doctorAndroid, devAndroid, dryRunAndroid } from './android-dev.mjs';
import { ensureNativeActionStubs } from './native-actions.mjs';
import { captureSnapshots } from './snapshots.mjs';
import { runAuthorLoop } from './author-loop.mjs';
import { importFigma } from './figma-import.mjs';
import { diffSnapshots } from './snapshot-diff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/ui-ir.schema.json'), 'utf8'));
const PLUGIN_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/plugin.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, discriminator: true });
const validateSchema = ajv.compile(SCHEMA);
const validatePluginSchema = ajv.compile(PLUGIN_SCHEMA);

function loadTokens() {
  return YAML.parse(fs.readFileSync(path.join(ROOT, 'theme/tokens.yaml'), 'utf8'));
}

function loadScreens() {
  const dir = path.join(ROOT, 'screens');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ui.yaml'))
    .sort()
    .map(f => ({ file: f, ir: YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

function duplicateNames(items, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items ?? []) {
    if (seen.has(item.name)) duplicates.add(item.name);
    seen.add(item.name);
  }
  return [...duplicates].map(name => `duplicate ${label} name "${name}"`);
}

function duplicateFieldNames(fields, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const field of fields ?? []) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return [...duplicates].map(name => `duplicate ${label} field name "${name}"`);
}

function hasToken(tokens, group, name) {
  return Boolean(name && tokens?.[group] && Object.hasOwn(tokens[group], name));
}

function themeProblems(tokens) {
  const required = {
    spacing: ['none', 'tight', 'normal', 'loose'],
    size: ['contentCompact', 'contentNormal', 'contentWide', 'controlHeight', 'buttonMinWidth', 'borderWidth'],
    radius: ['none', 'small', 'normal', 'large'],
    color: ['primary', 'background', 'fieldBackground', 'border', 'textPrimary', 'textSecondary', 'placeholder', 'onPrimary'],
    typography: ['title', 'heading', 'body', 'caption'],
  };
  const problems = [];
  for (const [group, names] of Object.entries(required)) {
    for (const name of names) {
      if (!hasToken(tokens, group, name)) problems.push(`theme/tokens.yaml is missing ${group} token "${name}"`);
    }
  }
  return problems;
}

function nativeActionProblems(ir) {
  const problems = [];
  const platforms = [
    { label: 'iOS', file: path.join(ROOT, 'native/ios', `${ir.screen}ActionsImpl.swift`), pattern: action => new RegExp(`\\bfunc\\s+${action}\\s*\\(`) },
    { label: 'Android', file: path.join(ROOT, 'native/android', `${ir.screen}ActionsImpl.kt`), pattern: action => new RegExp(`\\bfun\\s+${action}\\s*\\(`) },
  ];

  for (const platform of platforms) {
    if (!fs.existsSync(platform.file)) continue;
    const source = fs.readFileSync(platform.file, 'utf8');
    for (const action of ir.actions ?? []) {
      if (!platform.pattern(action.name).test(source)) {
        problems.push(`${platform.label} native action implementation is missing "${action.name}"`);
      }
    }
  }

  return problems;
}

function actionNavigationProblems(ir, screenNames) {
  const problems = [];
  for (const action of ir.actions ?? []) {
    if (!action.navigation) continue;
    if (action.navigation.type === 'push' && !screenNames.has(action.navigation.screen)) {
      problems.push(`action "${action.name}" navigates to unknown screen "${action.navigation.screen}"`);
    }
  }
  return problems;
}

function semanticCheck(ir, tokens, screenNames) {
  const errors = [];
  const stateNames = new Map((ir.state ?? []).map(s => [s.name, s]));
  const actionNames = new Set((ir.actions ?? []).map(a => a.name));

  errors.push(...duplicateNames(ir.state, 'state'));
  errors.push(...duplicateNames(ir.actions, 'action'));
  errors.push(...actionNavigationProblems(ir, screenNames));

  for (const state of ir.state ?? []) {
    if (state.type === 'list') {
      errors.push(...duplicateFieldNames(state.item?.fields, `state "${state.name}" item`));
    }
  }

  if (ir.layout?.contentWidth && ir.layout.contentWidth !== 'fill') {
    const token = `content${ir.layout.contentWidth.charAt(0).toUpperCase()}${ir.layout.contentWidth.slice(1)}`;
    if (!hasToken(tokens, 'size', token)) errors.push(`layout contentWidth references missing size token "${token}"`);
  }

  function checkCondition(node) {
    if (!node.visibleWhen) return;
    const conditionState = stateNames.get(node.visibleWhen.state);
    if (!conditionState) {
      errors.push(`${node.type} visibleWhen references undeclared state "${node.visibleWhen.state}"`);
    } else if (conditionState.type === 'list') {
      errors.push(`${node.type} visibleWhen state "${node.visibleWhen.state}" must reference scalar state`);
    }
  }

  function checkTextBinding(node, listContext) {
    if (node.type !== 'text' || !node.bind) return;
    if (node.bind.startsWith('item.')) {
      const field = node.bind.slice('item.'.length);
      if (!listContext) {
        errors.push(`text bind "${node.bind}" can only be used inside list itemTemplate`);
        return;
      }
      const fields = new Set((listContext.item?.fields ?? []).map(f => f.name));
      if (!fields.has(field)) errors.push(`text bind "${node.bind}" references unknown list item field`);
      return;
    }
    const state = stateNames.get(node.bind);
    if (!state) errors.push(`text binds to undeclared state "${node.bind}"`);
    else if (state.type === 'list') errors.push(`text bind "${node.bind}" must reference scalar state`);
  }

  function walk(node, listContext = null) {
    checkCondition(node);
    if (node.spacing && !hasToken(tokens, 'spacing', node.spacing))
      errors.push(`${node.type} references missing spacing token "${node.spacing}"`);
    if (node.padding && !hasToken(tokens, 'spacing', node.padding))
      errors.push(`${node.type} references missing padding token "${node.padding}"`);
    if (node.radius && !hasToken(tokens, 'radius', node.radius))
      errors.push(`${node.type} references missing radius token "${node.radius}"`);
    if (node.type === 'text' && node.color && !hasToken(tokens, 'color', node.color))
      errors.push(`text references missing color token "${node.color}"`);
    if (node.type === 'text' && node.role && !hasToken(tokens, 'typography', node.role))
      errors.push(`text references missing typography token "${node.role}"`);
    checkTextBinding(node, listContext);

    if (node.type === 'textField' && !stateNames.has(node.bind)) {
      errors.push(`textField binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'textField' && stateNames.get(node.bind)?.type !== 'string') {
      errors.push(`textField bind "${node.bind}" must reference string state`);
    }
    if (node.type === 'button' && !actionNames.has(node.action))
      errors.push(`button references undeclared action "${node.action}"`);
    let nextListContext = listContext;
    if (node.type === 'list' && node.bind && !stateNames.has(node.bind)) {
      errors.push(`list binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'list' && node.bind && stateNames.get(node.bind)?.type !== 'list') {
      errors.push(`list bind "${node.bind}" must reference list state`);
    } else if (node.type === 'list' && node.bind) {
      nextListContext = stateNames.get(node.bind);
    }
    for (const child of node.children ?? []) walk(child, listContext);
    for (const child of node.itemTemplate ?? []) walk(child, nextListContext);
  }
  for (const node of ir.body) walk(node);
  errors.push(...nativeActionProblems(ir));
  return errors;
}

function validate() {
  const screens = loadScreens();
  const tokens = loadTokens();
  if (!screens.length) {
    console.error('no .ui.yaml files found in screens/');
    process.exit(1);
  }
  let failed = false;
  const tokenProblems = themeProblems(tokens);
  if (tokenProblems.length) {
    failed = true;
    console.error('✗ theme/tokens.yaml');
    for (const p of tokenProblems) console.error(`    ${p}`);
  }
  const screenFilesByName = new Map();
  const allScreenNames = new Set(screens.map(({ ir }) => ir.screen).filter(Boolean));
  const entryScreens = screens.filter(({ ir }) => ir.entry);
  if (entryScreens.length > 1) {
    failed = true;
    console.error('✗ screens/');
    for (const { file, ir } of entryScreens) console.error(`    entry screen "${ir.screen}" declared in ${file}`);
  }
  for (const { file, ir } of screens) {
    const problems = [];
    if (!validateSchema(ir)) {
      for (const e of validateSchema.errors)
        problems.push(`${e.instancePath || '/'} ${e.message}`);
    } else {
      if (screenFilesByName.has(ir.screen)) {
        problems.push(`duplicate screen name "${ir.screen}" also used by ${screenFilesByName.get(ir.screen)}`);
      } else {
        screenFilesByName.set(ir.screen, file);
      }
      problems.push(...semanticCheck(ir, tokens, allScreenNames));
    }
    if (problems.length) {
      failed = true;
      console.error(`✗ ${file}`);
      for (const p of problems) console.error(`    ${p}`);
    } else {
      console.log(`✓ ${file}`);
    }
  }
  if (failed) process.exit(1);
  return screens;
}

function build() {
  const screens = validate();
  const tokens = loadTokens();
  const nativeCreated = ensureNativeActionStubs(ROOT, screens);

  const iosDir = path.join(ROOT, 'generated/ios');
  const androidDir = path.join(ROOT, 'generated/android');
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });

  fs.writeFileSync(path.join(iosDir, 'Theme.swift'), emitThemeSwift(tokens));
  fs.writeFileSync(path.join(iosDir, 'App.swift'), emitAppSwift(screens));
  fs.writeFileSync(path.join(androidDir, 'Theme.kt'), emitThemeKotlin(tokens));
  console.log('→ generated/ios/Theme.swift');
  console.log('→ generated/ios/App.swift');
  console.log('→ generated/android/Theme.kt');

  for (const { ir } of screens) {
    fs.writeFileSync(path.join(iosDir, `${ir.screen}View.swift`), emitScreenSwift(ir));
    fs.writeFileSync(path.join(androidDir, `${ir.screen}Screen.kt`), emitScreenKotlin(ir));
    console.log(`→ generated/ios/${ir.screen}View.swift`);
    console.log(`→ generated/android/${ir.screen}Screen.kt`);
  }

  for (const file of nativeCreated) {
    console.log(`→ ${file}`);
  }

  return screens;
}

function validatePlugins() {
  const dir = path.join(ROOT, 'plugins');
  if (!fs.existsSync(dir)) {
    console.log('no plugins/ directory found');
    return [];
  }

  const manifests = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name, 'plugin.json'))
    .filter(file => fs.existsSync(file))
    .sort();

  if (!manifests.length) {
    console.log('no plugin manifests found');
    return [];
  }

  let failed = false;
  for (const manifest of manifests) {
    const plugin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!validatePluginSchema(plugin)) {
      failed = true;
      console.error(`✗ ${path.relative(ROOT, manifest)}`);
      for (const e of validatePluginSchema.errors)
        console.error(`    ${e.instancePath || '/'} ${e.message}`);
    } else {
      console.log(`✓ ${path.relative(ROOT, manifest)}`);
    }
  }

  if (failed) process.exit(1);
  return manifests;
}

const cmd = process.argv[2];
if (cmd === 'validate') validate();
else if (cmd === 'build') build();
else if (cmd === 'author:loop') runAuthorLoop(ROOT);
else if (cmd === 'figma:import') importFigma(ROOT, process.argv[3], process.argv[4]);
else if (cmd === 'snapshots:diff') diffSnapshots(ROOT, validate());
else if (cmd === 'plugins:validate') validatePlugins();
else if (cmd === 'doctor:ios') doctorIos() || process.exit(1);
else if (cmd === 'doctor:android') doctorAndroid() || process.exit(1);
else if (cmd === 'dry-run:ios') {
  build();
  dryRunIos(ROOT);
}
else if (cmd === 'dev:ios') {
  build();
  devIos(ROOT);
}
else if (cmd === 'dry-run:android') {
  const screens = build();
  dryRunAndroid(ROOT, screens);
}
else if (cmd === 'dev:android') {
  const screens = build();
  devAndroid(ROOT, screens);
}
else if (cmd === 'snapshots') {
  const screens = build();
  devIos(ROOT);
  devAndroid(ROOT, screens);
  captureSnapshots(ROOT, screens);
}
else {
  console.log('usage: node compiler/aic.mjs <validate|build|author:loop|figma:import|snapshots:diff|plugins:validate|doctor:ios|dry-run:ios|dev:ios|doctor:android|dry-run:android|dev:android|snapshots>');
  process.exit(1);
}
