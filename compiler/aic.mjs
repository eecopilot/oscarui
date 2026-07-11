#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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
import { ROOT, SRC_ROOT, SCREEN_DIR, COMPONENT_DIR, NATIVE_DIR } from './project-paths.mjs';
import { appConfigProblems, loadAppConfig } from './app-config.mjs';
import { componentRefProblems } from './ir-normalize.mjs';
import { semanticCheck, themeProblems } from './ir-semantics.mjs';
import { validatePlugins } from './plugin-validator.mjs';
import { createSchemaValidators } from './schema-validators.mjs';
import { loadComponents, loadScreens, loadTokens } from './source-loader.mjs';
import { buildRuntime as emitRuntimeBuild } from './runtime/build.mjs';
import { runtimeCompatibilityProblems } from './runtime/validation.mjs';
import { installRuntimeAndroid, installRuntimeIos } from './runtime/install.mjs';
import { runtimeParityReport } from './runtime/parity.mjs';
import { runtimeSnapshotParity } from './runtime/snapshot-parity.mjs';
import { acceptVisualBaselines, reviewVisualBaselines } from './visual-review.mjs';
import { createDiagnostic, printProblemReport, recoveryHint } from './diagnostics.mjs';

function fatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: false, diagnostics: [createDiagnostic('', message)] }, null, 2));
  } else {
    console.error(`✗ ${message}`);
    console.error(`Hint: ${recoveryHint(message)}`);
  }
  process.exit(1);
}

process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

const { validateSchema, validateAppConfigSchema, validatePluginSchema, validateRuntimeBundleSchema } = createSchemaValidators(ROOT);

function validate() {
  const structured = process.argv.includes('--json');
  const diagnostics = [];
  const success = file => { if (!structured) console.log(`✓ ${file}`); };
  const failure = (file, problems) => {
    for (const problem of problems) diagnostics.push(createDiagnostic(file, problem));
    if (!structured) printProblemReport(file, problems);
  };
  const screens = loadScreens(ROOT, SCREEN_DIR, SRC_ROOT);
  const components = loadComponents(ROOT, COMPONENT_DIR, SRC_ROOT);
  const tokens = loadTokens(SRC_ROOT);
  const appConfig = loadAppConfig(ROOT);
  if (!screens.length) {
    failure('src/screens/', ['no .ui.yaml files found']);
  }
  let failed = !screens.length;
  const appConfigErrors = [];
  if (!validateAppConfigSchema(appConfig)) {
    for (const e of validateAppConfigSchema.errors)
      appConfigErrors.push(`${e.instancePath || '/'}: ${e.message}`);
  } else {
    appConfigErrors.push(...appConfigProblems(appConfig, ROOT));
  }
  if (appConfigErrors.length) {
    failed = true;
    failure('src/app.config.yaml', appConfigErrors);
  } else {
    success('src/app.config.yaml');
  }
  const tokenProblems = themeProblems(tokens);
  if (tokenProblems.length) {
    failed = true;
    failure('src/theme/tokens.yaml', tokenProblems);
  }
  const screenFilesByName = new Map();
  const componentFilesByName = new Map();
  const allScreenNames = new Set(screens.map(({ ir }) => ir.screen).filter(Boolean));
  const allComponentNames = new Set(components.map(({ ir }) => ir.component).filter(Boolean));
  const componentsByName = new Map(components.map(({ ir }) => [ir.component, ir]));
  const entryScreens = screens.filter(({ ir }) => ir.entry);
  if (entryScreens.length > 1) {
    failed = true;
    failure('src/screens/', entryScreens.map(({ file, ir }) => `entry screen "${ir.screen}" declared in ${file}`));
  }
  for (const { file, sourceFile, raw, ir } of screens) {
    const problems = [];
    if (!validateSchema(raw)) {
      for (const e of validateSchema.errors)
        problems.push(`${e.instancePath || '/'}: ${e.message}`);
    } else {
      problems.push(...componentRefProblems(raw, ROOT, sourceFile, SRC_ROOT));
      if (screenFilesByName.has(ir.screen)) {
        problems.push(`duplicate screen name "${ir.screen}" also used by ${screenFilesByName.get(ir.screen)}`);
      } else {
        screenFilesByName.set(ir.screen, file);
      }
      if ((ir.props ?? []).length) problems.push('screen cannot declare props; use state instead');
      problems.push(...semanticCheck(ir, tokens, allScreenNames, allComponentNames, componentsByName, NATIVE_DIR));
    }
    if (problems.length) {
      failed = true;
      failure(file, problems);
    } else {
      success(file);
    }
  }
  for (const { file, sourceFile, raw, ir } of components) {
    const problems = [];
    if (!validateSchema(raw)) {
      for (const e of validateSchema.errors)
        problems.push(`${e.instancePath || '/'}: ${e.message}`);
    } else {
      problems.push(...componentRefProblems(raw, ROOT, sourceFile, SRC_ROOT));
      if (componentFilesByName.has(ir.component)) {
        problems.push(`duplicate component name "${ir.component}" also used by ${componentFilesByName.get(ir.component)}`);
      } else {
        componentFilesByName.set(ir.component, file);
      }
      if (ir.entry) problems.push('component cannot declare entry');
      if ((ir.state ?? []).length) problems.push('component cannot declare state; use props instead');
      if ((ir.actions ?? []).length) problems.push('component cannot declare actions; use action props instead');
      problems.push(...semanticCheck(ir, tokens, allScreenNames, allComponentNames, componentsByName, NATIVE_DIR));
    }
    if (problems.length) {
      failed = true;
      failure(file, problems);
    } else {
      success(file);
    }
  }
  if (structured) console.log(JSON.stringify({ ok: !failed, diagnostics }, null, 2));
  if (failed) process.exit(1);
  return { screens, components, tokens, appConfig };
}

function build() {
  const { screens, components } = validate();
  const appConfig = loadAppConfig(ROOT);
  const tokens = loadTokens(SRC_ROOT);
  const nativeCreated = ensureNativeActionStubs(ROOT, screens, NATIVE_DIR);

  const iosDir = path.join(ROOT, 'generated/ios');
  const androidDir = path.join(ROOT, 'generated/android');
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });

  fs.writeFileSync(path.join(iosDir, 'Theme.swift'), emitThemeSwift(tokens));
  fs.writeFileSync(path.join(iosDir, 'App.swift'), emitAppSwift(screens, appConfig.app.name, appConfig));
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

function validateRuntime() {
  const project = validate();
  const reports = runtimeCompatibilityProblems(project.screens, project.components);
  if (reports.length) {
    for (const report of reports) {
      console.error(`✗ ${report.file}`);
      for (const problem of report.problems) console.error(`    ${problem}`);
    }
    process.exit(1);
  }
  console.log('✓ Runtime Mode compatibility');
  return project;
}

function buildRuntime() {
  const project = validateRuntime();
  const nativeCreated = ensureNativeActionStubs(ROOT, project.screens, NATIVE_DIR);
  const emitted = emitRuntimeBuild(ROOT, project);
  if (!validateRuntimeBundleSchema(emitted.bundle)) {
    const errors = validateRuntimeBundleSchema.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('\n');
    throw new Error(`runtime bundle schema validation failed:\n${errors}`);
  }
  console.log(`→ ${path.relative(ROOT, emitted.file)}`);
  for (const file of emitted.iosFiles) console.log(`→ ${path.relative(ROOT, file)}`);
  for (const file of emitted.androidFiles) console.log(`→ ${path.relative(ROOT, file)}`);
  for (const file of nativeCreated) console.log(`→ ${file}`);
  return project;
}

const cmd = process.argv[2];
if (cmd === 'validate') validate();
else if (cmd === 'build') build();
else if (cmd === 'runtime:validate') validateRuntime();
else if (cmd === 'build:runtime') buildRuntime();
else if (cmd === 'runtime:selftest') await import('./runtime/selftest.mjs');
else if (cmd === 'author:loop') runAuthorLoop(ROOT);
else if (cmd === 'figma:import') importFigma(ROOT, process.argv[3], process.argv[4]);
else if (cmd === 'snapshots:diff') diffSnapshots(ROOT, validate().screens, process.argv[3] ?? 'compile');
else if (cmd === 'plugins:validate') validatePlugins(ROOT, validatePluginSchema);
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
else if (cmd === 'dry-run:ios:runtime') {
  const { appConfig } = buildRuntime();
  dryRunIos(ROOT, appConfig, { mode: 'runtime' });
}
else if (cmd === 'dev:ios:runtime') {
  const { appConfig } = buildRuntime();
  devIos(ROOT, appConfig, { mode: 'runtime' });
}
else if (cmd === 'dry-run:android:runtime') {
  const { screens, appConfig } = buildRuntime();
  dryRunAndroid(ROOT, screens, appConfig, { mode: 'runtime' });
}
else if (cmd === 'dev:android:runtime') {
  const { screens, appConfig } = buildRuntime();
  devAndroid(ROOT, screens, appConfig, { mode: 'runtime' });
}
else if (cmd === 'runtime:install:ios') {
  const project = validateRuntime();
  installRuntimeIos(ROOT, project.appConfig, process.argv[3]);
}
else if (cmd === 'runtime:install:android') {
  const project = validateRuntime();
  installRuntimeAndroid(ROOT, project.appConfig, process.argv[3]);
}
else if (cmd === 'runtime:parity') {
  const project = buildRuntime();
  runtimeParityReport(ROOT, project);
}
else if (cmd === 'snapshots:runtime-parity') runtimeSnapshotParity(ROOT, validate().screens);
else if (cmd === 'snapshots:accept') acceptVisualBaselines(ROOT);
else if (cmd === 'visual:review') reviewVisualBaselines(ROOT);
else if (cmd === 'snapshots') {
  const { screens, appConfig } = build();
  devIos(ROOT, appConfig);
  devAndroid(ROOT, screens, appConfig);
  captureSnapshots(ROOT, screens, { variant: 'compile' });
}
else if (cmd === 'snapshots:runtime') {
  const { screens, appConfig } = buildRuntime();
  devIos(ROOT, appConfig, { mode: 'runtime' });
  devAndroid(ROOT, screens, appConfig, { mode: 'runtime' });
  captureSnapshots(ROOT, screens, { variant: 'runtime' });
}
else {
  console.log('usage: node compiler/aic.mjs <validate|build|runtime:validate|build:runtime|runtime:selftest|runtime:parity|runtime:install:ios|runtime:install:android|author:loop|figma:import|snapshots|snapshots:runtime|snapshots:diff|snapshots:runtime-parity|snapshots:accept|visual:review|plugins:validate|doctor:ios|dry-run:ios|dev:ios|dry-run:ios:runtime|dev:ios:runtime|doctor:android|dry-run:android|dev:android|dry-run:android:runtime|dev:android:runtime>');
  process.exit(1);
}
