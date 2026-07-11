#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { initProject } from '../compiler/init-project.mjs';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(toolRoot, 'package.json'), 'utf8'));
const commands = [
  ['init [directory]', 'Create a starter OscarUI project in an empty directory'],
  ['validate', 'Validate app config, UI IR, components, tokens, and native actions'],
  ['build', 'Generate native SwiftUI and Jetpack Compose source'],
  ['build:runtime', 'Generate the portable Runtime Mode bundle and renderers'],
  ['runtime:validate', 'Validate that the project is supported by Runtime Mode'],
  ['runtime:parity', 'Compare normalized compile input with the Runtime bundle'],
  ['runtime:install:ios', 'Install a Runtime bundle into the booted iOS Simulator'],
  ['runtime:install:android', 'Install a Runtime bundle into the connected Android app'],
  ['test', 'Run deterministic validation, build, runtime, and parity checks'],
  ['doctor:ios', 'Report whether the iOS toolchain is ready'],
  ['doctor:android', 'Report whether the Android toolchain is ready'],
  ['dev:ios', 'Build, install, and launch the native iOS app'],
  ['dev:android', 'Build, install, and launch the native Android app'],
  ['dev:ios:runtime', 'Build and launch the iOS Runtime Mode app'],
  ['dev:android:runtime', 'Build and launch the Android Runtime Mode app'],
  ['snapshots', 'Capture fresh iOS and Android Compile Mode screenshots'],
  ['snapshots:runtime', 'Capture fresh iOS and Android Runtime Mode screenshots'],
  ['snapshots:runtime-parity', 'Compare Compile and Runtime screenshots pixel by pixel'],
  ['visual:review', 'Compare current screenshots with accepted visual baselines'],
  ['author:loop', 'Generate deterministic validation and visual feedback for AI'],
  ['figma:import <input> [output]', 'Import constrained Figma JSON into draft UI IR'],
  ['plugins:validate', 'Validate plugin manifests'],
  ['help', 'Show this command list'],
];

function runCompiler(arguments_) {
  const compiler = path.join(toolRoot, 'compiler/aic.mjs');
  const result = spawnSync(process.execPath, [compiler, ...arguments_], {
    cwd: process.cwd(),
    env: { ...process.env, OSCARUI_PROJECT_ROOT: process.cwd() },
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`✗ unable to run OscarUI: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function help() {
  console.log(`OscarUI ${manifest.version}`);
  console.log('One AI. Two truly native apps: Swift for iOS, Kotlin for Android.');
  console.log('');
  console.log('Usage: oscarui <command> [options]');
  console.log('');
  console.log('Commands:');
  for (const [name, description] of commands) console.log(`  ${name.padEnd(22)} ${description}`);
  console.log('');
  console.log('Run oscarui <command> from an OscarUI project directory.');
}

const args = process.argv.slice(2);
const command = args[0];
if (!command || command === 'help' || command === '--help' || command === '-h') {
  help();
  process.exit(0);
}
if (command === '--version' || command === '-v' || command === 'version') {
  console.log(manifest.version);
  process.exit(0);
}
if (command === 'init') {
  try {
    initProject(toolRoot, args[1], manifest.version);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  process.exit(0);
}
if (command === 'test') {
  const checks = ['validate', 'plugins:validate', 'build', 'build:runtime', 'runtime:selftest', 'runtime:parity'];
  for (const check of checks) {
    const status = runCompiler([check]);
    if (status !== 0) process.exit(status);
  }
  process.exit(0);
}

process.exit(runCompiler(args));
