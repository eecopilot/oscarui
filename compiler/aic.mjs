#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { emitThemeSwift, emitScreenSwift, emitComponentSwift } from './swiftui.mjs';
import { emitThemeKotlin, emitScreenKotlin, emitComponentKotlin } from './compose.mjs';
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
const APP_CONFIG_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/app-config.schema.json'), 'utf8'));
const PLUGIN_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/plugin.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, discriminator: true });
const validateSchema = ajv.compile(SCHEMA);
const validateAppConfigSchema = ajv.compile(APP_CONFIG_SCHEMA);
const validatePluginSchema = ajv.compile(PLUGIN_SCHEMA);
const SRC_ROOT = path.join(ROOT, 'src');
const SCREEN_DIR = path.join(SRC_ROOT, 'screens');
const COMPONENT_DIR = path.join(SRC_ROOT, 'components');
const NATIVE_DIR = path.join(SRC_ROOT, 'native');

function loadTokens() {
  return YAML.parse(fs.readFileSync(path.join(SRC_ROOT, 'theme/tokens.yaml'), 'utf8'));
}

export function loadAppConfig(root = ROOT) {
  const file = path.join(root, 'src/app.config.yaml');
  if (!fs.existsSync(file)) throw new Error('src/app.config.yaml is required');
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

function appConfigProblems(config) {
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

function loadScreens() {
  const dir = SCREEN_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ui.yaml'))
    .sort()
    .map(f => {
      const sourceFile = path.join(dir, f);
      const raw = YAML.parse(fs.readFileSync(sourceFile, 'utf8'));
      return { file: path.relative(ROOT, sourceFile), sourceFile, raw, ir: normalizeIr(raw, ROOT, sourceFile) };
    });
}

function loadComponents() {
  const dir = COMPONENT_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ui.yaml'))
    .sort()
    .map(f => {
      const sourceFile = path.join(dir, f);
      const raw = YAML.parse(fs.readFileSync(sourceFile, 'utf8'));
      return { file: path.relative(ROOT, sourceFile), sourceFile, raw, ir: normalizeIr(raw, ROOT, sourceFile) };
    });
}

function normalizeIr(ir, root, sourceFile) {
  return {
    ...ir,
    body: (ir.body ?? []).map(node => normalizeNode(node, root, path.dirname(sourceFile))),
  };
}

function normalizeNode(node, root, sourceDir) {
  if (node.use) return normalizeComponentRef(node, root, sourceDir);
  const next = { ...node };
  if (node.if) {
    next.visibleWhen = node.if;
    delete next.if;
  }
  if (node.children) next.children = node.children.map(child => normalizeNode(child, root, sourceDir));
  if (node.itemTemplate) next.itemTemplate = node.itemTemplate.map(child => normalizeNode(child, root, sourceDir));
  return next;
}

function normalizeComponentRef(node, root, sourceDir) {
  const props = normalizePropsForAlias(componentRefProps(node), node.for ? node.for.match(/^([a-z][A-Za-z0-9]*)\s+in\s+([a-z][A-Za-z0-9]*)$/)?.[1] : '');
  const component = {
    type: 'component',
    name: componentNameForRef(node, root, sourceDir),
    props,
  };
  if (node.if) component.visibleWhen = node.if;
  if (!node.for) return component;

  const match = node.for.match(/^([a-z][A-Za-z0-9]*)\s+in\s+([a-z][A-Za-z0-9]*)$/);
  if (!match) return component;
  return {
    type: 'list',
    bind: match[2],
    itemTemplate: [component],
  };
}

function componentRefProps(node) {
  const reserved = new Set(['use', 'path', 'if', 'for', 'props']);
  const inline = Object.fromEntries(Object.entries(node).filter(([key]) => !reserved.has(key)));
  return { ...inline, ...(node.props ?? {}) };
}

function componentNameForRef(node, root, sourceDir) {
  if (node.use !== 'component') return node.use;
  const file = resolveComponentRefPath(node, root, sourceDir);
  if (!file || !fs.existsSync(file)) return '';
  try {
    const ir = YAML.parse(fs.readFileSync(file, 'utf8'));
    return ir.component ?? '';
  } catch {
    return '';
  }
}

function isInsideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveComponentRefPath(node, root, sourceDir) {
  if (!node.path) return '';
  const candidates = path.isAbsolute(node.path)
    ? [node.path]
    : [
        path.resolve(sourceDir, node.path),
        path.resolve(root, node.path),
        path.resolve(SRC_ROOT, node.path),
      ];
  const insideCandidates = candidates.filter(file => isInsideRoot(root, file));
  return insideCandidates.find(file => fs.existsSync(file)) ?? insideCandidates[0] ?? '';
}

function componentRefProblems(raw, root, sourceFile) {
  const errors = [];
  const sourceDir = path.dirname(sourceFile);
  function walk(node) {
    if (node.use === 'component') {
      const file = resolveComponentRefPath(node, root, sourceDir);
      if (!node.path) {
        errors.push('component path is required when use is "component"');
      } else if (!file) {
        errors.push(`component path "${node.path}" must stay inside the project`);
      } else if (!fs.existsSync(file)) {
        errors.push(`component path "${node.path ?? ''}" does not exist`);
      } else {
        try {
          const ir = YAML.parse(fs.readFileSync(file, 'utf8'));
          if (!ir.component) errors.push(`component path "${node.path}" must point to a component IR file`);
        } catch (error) {
          errors.push(`component path "${node.path}" could not be parsed: ${error.message}`);
        }
      }
    }
    for (const child of node.children ?? []) walk(child);
    for (const child of node.itemTemplate ?? []) walk(child);
  }
  for (const node of raw.body ?? []) walk(node);
  return errors;
}

function normalizePropsForAlias(props, alias) {
  if (!alias || alias === 'item') return props;
  return Object.fromEntries(Object.entries(props).map(([key, value]) => {
    if (typeof value === 'string' && value.startsWith(`${alias}.`)) {
      return [key, `item.${value.slice(alias.length + 1)}`];
    }
    return [key, value];
  }));
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
      if (!hasToken(tokens, group, name)) problems.push(`src/theme/tokens.yaml is missing ${group} token "${name}"`);
    }
  }
  return problems;
}

function nativeActionProblems(ir) {
  if (!ir.screen) return [];
  const problems = [];
  const platforms = [
    { label: 'iOS', file: path.join(NATIVE_DIR, 'ios', `${ir.screen}ActionsImpl.swift`), pattern: action => new RegExp(`\\bfunc\\s+${action}\\s*\\(`) },
    { label: 'Android', file: path.join(NATIVE_DIR, 'android', `${ir.screen}ActionsImpl.kt`), pattern: action => new RegExp(`\\bfun\\s+${action}\\s*\\(`) },
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

function semanticCheck(ir, tokens, screenNames, componentNames, componentsByName) {
  const errors = [];
  const stateNames = new Map((ir.state ?? []).map(s => [s.name, s]));
  const propNames = new Map((ir.props ?? []).map(p => [p.name, p]));
  const actionNames = new Set((ir.actions ?? []).map(a => a.name));

  errors.push(...duplicateNames(ir.state, 'state'));
  errors.push(...duplicateNames(ir.props, 'prop'));
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
    const conditionValue = stateNames.get(node.visibleWhen.state) ?? propNames.get(node.visibleWhen.state);
    if (!conditionValue) {
      errors.push(`${node.type} visibleWhen references undeclared state or prop "${node.visibleWhen.state}"`);
    } else if (conditionValue.type === 'list' || conditionValue.type === 'action') {
      errors.push(`${node.type} visibleWhen "${node.visibleWhen.state}" must reference scalar state or prop`);
    }
  }

  function listFieldProblem(binding, listContext, label) {
    if (!binding.startsWith('item.')) return false;
    const field = binding.slice('item.'.length);
      if (!listContext) {
      errors.push(`${label} "${binding}" can only be used inside list itemTemplate`);
      return true;
      }
      const fields = new Set((listContext.item?.fields ?? []).map(f => f.name));
    if (!fields.has(field)) errors.push(`${label} "${binding}" references unknown list item field`);
    return true;
  }

  function checkTextBinding(node, listContext) {
    if (node.type !== 'text' || !node.bind) return;
    if (listFieldProblem(node.bind, listContext, 'text bind')) return;
    const value = stateNames.get(node.bind) ?? propNames.get(node.bind);
    if (!value) errors.push(`text binds to undeclared state or prop "${node.bind}"`);
    else if (value.type === 'list' || value.type === 'action') errors.push(`text bind "${node.bind}" must reference scalar state or prop`);
  }

  function checkActionReference(node) {
    if (node.type !== 'button') return;
    if (actionNames.has(node.action)) return;
    const prop = propNames.get(node.action);
    if (!prop) {
      errors.push(`button references undeclared action or action prop "${node.action}"`);
    } else if (prop.type !== 'action') {
      errors.push(`button action "${node.action}" must reference action prop`);
    }
  }

  function checkComponentCall(node, listContext) {
    if (node.type !== 'component') return;
    const component = componentsByName.get(node.name);
    if (!component) {
      if (node.name) errors.push(`component node references unknown component "${node.name}"`);
      return;
    }

    const expectedProps = new Map((component.props ?? []).map(prop => [prop.name, prop]));
    const actualProps = node.props ?? {};
    for (const prop of component.props ?? []) {
      if (!Object.hasOwn(actualProps, prop.name)) errors.push(`component "${node.name}" is missing prop "${prop.name}"`);
    }
    for (const propName of Object.keys(actualProps)) {
      const expected = expectedProps.get(propName);
      if (!expected) {
        errors.push(`component "${node.name}" received unknown prop "${propName}"`);
        continue;
      }
      const value = actualProps[propName];
      if (expected.type === 'action') {
        if (typeof value !== 'string') {
          errors.push(`component "${node.name}" action prop "${propName}" must be an action name`);
        } else if (!actionNames.has(value) && propNames.get(value)?.type !== 'action') {
          errors.push(`component "${node.name}" action prop "${propName}" references undeclared action or action prop "${value}"`);
        }
        continue;
      }
      if (typeof value === 'string' && listFieldProblem(value, listContext, `component "${node.name}" prop "${propName}"`)) continue;
      if (typeof value === 'string' && /^[a-z][A-Za-z0-9]*$/.test(value)) {
        const referenced = stateNames.get(value) ?? propNames.get(value);
        if (referenced && referenced.type !== expected.type) {
          errors.push(`component "${node.name}" prop "${propName}" expects ${expected.type} but "${value}" is ${referenced.type}`);
        }
      }
    }
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
    checkComponentCall(node, listContext);

    if (node.type === 'textField' && !stateNames.has(node.bind)) {
      errors.push(`textField binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'textField' && stateNames.get(node.bind)?.type !== 'string') {
      errors.push(`textField bind "${node.bind}" must reference string state`);
    }
    checkActionReference(node);
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
  const components = loadComponents();
  const tokens = loadTokens();
  const appConfig = loadAppConfig();
  if (!screens.length) {
    console.error('no .ui.yaml files found in src/screens/');
    process.exit(1);
  }
  let failed = false;
  const appConfigErrors = [];
  if (!validateAppConfigSchema(appConfig)) {
    for (const e of validateAppConfigSchema.errors)
      appConfigErrors.push(`${e.instancePath || '/'} ${e.message}`);
  } else {
    appConfigErrors.push(...appConfigProblems(appConfig));
  }
  if (appConfigErrors.length) {
    failed = true;
    console.error('✗ src/app.config.yaml');
    for (const p of appConfigErrors) console.error(`    ${p}`);
  } else {
    console.log('✓ src/app.config.yaml');
  }
  const tokenProblems = themeProblems(tokens);
  if (tokenProblems.length) {
    failed = true;
    console.error('✗ src/theme/tokens.yaml');
    for (const p of tokenProblems) console.error(`    ${p}`);
  }
  const screenFilesByName = new Map();
  const componentFilesByName = new Map();
  const allScreenNames = new Set(screens.map(({ ir }) => ir.screen).filter(Boolean));
  const allComponentNames = new Set(components.map(({ ir }) => ir.component).filter(Boolean));
  const componentsByName = new Map(components.map(({ ir }) => [ir.component, ir]));
  const entryScreens = screens.filter(({ ir }) => ir.entry);
  if (entryScreens.length > 1) {
    failed = true;
    console.error('✗ src/screens/');
    for (const { file, ir } of entryScreens) console.error(`    entry screen "${ir.screen}" declared in ${file}`);
  }
  for (const { file, sourceFile, raw, ir } of screens) {
    const problems = [];
    if (!validateSchema(raw)) {
      for (const e of validateSchema.errors)
        problems.push(`${e.instancePath || '/'} ${e.message}`);
    } else {
      problems.push(...componentRefProblems(raw, ROOT, sourceFile));
      if (screenFilesByName.has(ir.screen)) {
        problems.push(`duplicate screen name "${ir.screen}" also used by ${screenFilesByName.get(ir.screen)}`);
      } else {
        screenFilesByName.set(ir.screen, file);
      }
      if ((ir.props ?? []).length) problems.push('screen cannot declare props; use state instead');
      problems.push(...semanticCheck(ir, tokens, allScreenNames, allComponentNames, componentsByName));
    }
    if (problems.length) {
      failed = true;
      console.error(`✗ ${file}`);
      for (const p of problems) console.error(`    ${p}`);
    } else {
      console.log(`✓ ${file}`);
    }
  }
  for (const { file, sourceFile, raw, ir } of components) {
    const problems = [];
    if (!validateSchema(raw)) {
      for (const e of validateSchema.errors)
        problems.push(`${e.instancePath || '/'} ${e.message}`);
    } else {
      problems.push(...componentRefProblems(raw, ROOT, sourceFile));
      if (componentFilesByName.has(ir.component)) {
        problems.push(`duplicate component name "${ir.component}" also used by ${componentFilesByName.get(ir.component)}`);
      } else {
        componentFilesByName.set(ir.component, file);
      }
      if (ir.entry) problems.push('component cannot declare entry');
      if ((ir.state ?? []).length) problems.push('component cannot declare state; use props instead');
      if ((ir.actions ?? []).length) problems.push('component cannot declare actions; use action props instead');
      problems.push(...semanticCheck(ir, tokens, allScreenNames, allComponentNames, componentsByName));
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
  return { screens, components };
}

function build() {
  const { screens, components } = validate();
  const appConfig = loadAppConfig();
  const tokens = loadTokens();
  const nativeCreated = ensureNativeActionStubs(ROOT, screens, NATIVE_DIR);

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

  for (const { ir } of components) {
    fs.writeFileSync(path.join(iosDir, `${ir.component}View.swift`), emitComponentSwift(ir, components.map(({ ir }) => ir)));
    fs.writeFileSync(path.join(androidDir, `${ir.component}.kt`), emitComponentKotlin(ir, components.map(({ ir }) => ir)));
    console.log(`→ generated/ios/${ir.component}View.swift`);
    console.log(`→ generated/android/${ir.component}.kt`);
  }

  for (const { ir } of screens) {
    fs.writeFileSync(path.join(iosDir, `${ir.screen}View.swift`), emitScreenSwift(ir, components.map(({ ir }) => ir)));
    fs.writeFileSync(path.join(androidDir, `${ir.screen}Screen.kt`), emitScreenKotlin(ir, components.map(({ ir }) => ir)));
    console.log(`→ generated/ios/${ir.screen}View.swift`);
    console.log(`→ generated/android/${ir.screen}Screen.kt`);
  }

  for (const file of nativeCreated) {
    console.log(`→ ${file}`);
  }

  return { screens, appConfig };
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
else if (cmd === 'snapshots:diff') diffSnapshots(ROOT, validate().screens);
else if (cmd === 'plugins:validate') validatePlugins();
else if (cmd === 'doctor:ios') doctorIos() || process.exit(1);
else if (cmd === 'doctor:android') doctorAndroid() || process.exit(1);
else if (cmd === 'dry-run:ios') {
  const { appConfig } = build();
  dryRunIos(ROOT, appConfig);
}
else if (cmd === 'dev:ios') {
  const { appConfig } = build();
  devIos(ROOT, appConfig);
}
else if (cmd === 'dry-run:android') {
  const { screens, appConfig } = build();
  dryRunAndroid(ROOT, screens, appConfig);
}
else if (cmd === 'dev:android') {
  const { screens, appConfig } = build();
  devAndroid(ROOT, screens, appConfig);
}
else if (cmd === 'snapshots') {
  const { screens, appConfig } = build();
  devIos(ROOT, appConfig);
  devAndroid(ROOT, screens, appConfig);
  captureSnapshots(ROOT, screens);
}
else {
  console.log('usage: node compiler/aic.mjs <validate|build|author:loop|figma:import|snapshots:diff|plugins:validate|doctor:ios|dry-run:ios|dev:ios|doctor:android|dry-run:android|dev:android|snapshots>');
  process.exit(1);
}
