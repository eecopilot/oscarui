import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { canonicalStringify } from './canonical-json.mjs';
import { loadRuntimeBundleFile } from './bundle.mjs';
import { RUNTIME_BUNDLE_FILE } from './constants.mjs';

function featureCoverage(screens, components) {
  const nodes = new Set();
  let visibleWhen = false;
  let navigation = false;
  let listBinding = false;
  function walk(node) {
    nodes.add(node.type);
    if (node.visibleWhen) visibleWhen = true;
    if (node.type === 'list') listBinding = true;
    for (const child of node.children ?? []) walk(child);
    for (const child of node.itemTemplate ?? []) walk(child);
  }
  for (const { ir } of [...screens, ...components]) for (const node of ir.body ?? []) walk(node);
  for (const { ir } of screens) if ((ir.actions ?? []).some(action => action.navigation)) navigation = true;
  return { nodes: [...nodes].sort(), visibleWhen, navigation, listBinding };
}

export function runtimeParityReport(root, project) {
  const file = path.join(root, 'generated/runtime', RUNTIME_BUNDLE_FILE);
  const { verification } = loadRuntimeBundleFile(file);
  if (!verification.ok) throw new Error(verification.error);
  const expectedPayload = {
    screens: project.screens.map(({ ir }) => ir),
    components: project.components.map(({ ir }) => ir),
    tokens: project.tokens,
    appConfig: project.appConfig,
  };
  const payloadMatches = canonicalStringify(verification.decoded.payload) === canonicalStringify(expectedPayload);
  const coverage = featureCoverage(project.screens, project.components);
  const differencesFile = path.join(root, 'runtime/known-visual-differences.yaml');
  const differences = fs.existsSync(differencesFile) ? YAML.parse(fs.readFileSync(differencesFile, 'utf8')) : {};
  const lines = [
    '# OscarUI Runtime Parity', '',
    `- Bundle hash: \`${verification.hash}\``,
    `- Runtime payload matches normalized compile input: ${payloadMatches ? 'yes' : 'no'}`,
    `- Covered node types: ${coverage.nodes.join(', ') || 'none'}`,
    `- Conditional rendering covered: ${coverage.visibleWhen ? 'yes' : 'no'}`,
    `- Navigation covered: ${coverage.navigation ? 'yes' : 'no'}`,
    `- List binding covered: ${coverage.listBinding ? 'yes' : 'no'}`, '',
    '## Known acceptable visual differences', '',
  ];
  for (const platform of ['ios', 'android']) {
    lines.push(`### ${platform}`,'');
    const entries = differences[platform] ?? [];
    if (!entries.length) lines.push('- None recorded.');
    else for (const entry of entries) lines.push(`- ${entry}`);
    lines.push('');
  }
  const reportFile = path.join(root, '.aic/runtime-parity.md');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${lines.join('\n')}\n`);
  console.log(`→ ${path.relative(root, reportFile)}`);
  if (!payloadMatches) process.exitCode = 1;
  return { payloadMatches, coverage, reportFile };
}
