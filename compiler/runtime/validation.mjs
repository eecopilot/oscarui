import { RUNTIME_NODE_KEYS } from './constants.mjs';

function walkNodes(nodes, visit, parentPath = 'body') {
  for (const [index, node] of (nodes ?? []).entries()) {
    const nodePath = `${parentPath}[${index}]`;
    visit(node, nodePath);
    walkNodes(node.children, visit, `${nodePath}.children`);
    walkNodes(node.itemTemplate, visit, `${nodePath}.itemTemplate`);
  }
}

function nodeProblems(ir) {
  const problems = [];
  walkNodes(ir.body, (node, nodePath) => {
    const supportedKeys = RUNTIME_NODE_KEYS[node.type];
    if (!supportedKeys) {
      problems.push(`${nodePath} uses runtime-unsupported node type "${node.type ?? ''}"`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (!supportedKeys.has(key)) problems.push(`${nodePath}.${key} is not supported by Runtime Mode`);
    }
    if (node.type === 'component' && !node.name) {
      problems.push(`${nodePath} must contain a normalized component name`);
    }
  });
  return problems;
}

function componentDependencies(component) {
  const names = new Set();
  walkNodes(component.body, node => {
    if (node.type === 'component') names.add(node.name);
  });
  return names;
}

function componentCycleProblems(components) {
  const byName = new Map(components.map(({ ir }) => [ir.component, ir]));
  const visiting = new Set();
  const visited = new Set();
  const problems = [];

  function visit(name, trail) {
    if (visiting.has(name)) {
      const start = trail.indexOf(name);
      problems.push(`component cycle is not runtime-compatible: ${[...trail.slice(start), name].join(' -> ')}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const component = byName.get(name);
    for (const dependency of component ? componentDependencies(component) : []) visit(dependency, [...trail, name]);
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of byName.keys()) visit(name, []);
  return [...new Set(problems)];
}

export function runtimeCompatibilityProblems(screens, components) {
  const reports = [];
  for (const source of [...screens, ...components]) {
    const problems = nodeProblems(source.ir);
    if (problems.length) reports.push({ file: source.file, problems });
  }
  const cycles = componentCycleProblems(components);
  if (cycles.length) reports.push({ file: 'src/components/', problems: cycles });
  return reports;
}

export function assertRuntimeCompatible(screens, components) {
  const reports = runtimeCompatibilityProblems(screens, components);
  if (!reports.length) return;
  const lines = ['runtime validation failed:'];
  for (const report of reports) {
    lines.push(`  ${report.file}`);
    for (const problem of report.problems) lines.push(`    ${problem}`);
  }
  throw new Error(lines.join('\n'));
}
