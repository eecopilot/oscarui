import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function normalizeNode(node, root, sourceDir, srcRoot) {
  if (node.use) return normalizeComponentRef(node, root, sourceDir, srcRoot);
  const next = { ...node };
  if (node.if) {
    next.visibleWhen = node.if;
    delete next.if;
  }
  if (node.children) next.children = node.children.map(child => normalizeNode(child, root, sourceDir, srcRoot));
  if (node.itemTemplate) next.itemTemplate = node.itemTemplate.map(child => normalizeNode(child, root, sourceDir, srcRoot));
  return next;
}

export function normalizeIr(ir, root, sourceFile, srcRoot) {
  return {
    ...ir,
    body: (ir.body ?? []).map(node => normalizeNode(node, root, path.dirname(sourceFile), srcRoot)),
  };
}

function normalizeComponentRef(node, root, sourceDir, srcRoot) {
  const props = normalizePropsForAlias(componentRefProps(node), node.for ? node.for.match(/^([a-z][A-Za-z0-9]*)\s+in\s+([a-z][A-Za-z0-9]*)$/)?.[1] : '');
  const component = {
    type: 'component',
    name: componentNameForRef(node, root, sourceDir, srcRoot),
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

function componentNameForRef(node, root, sourceDir, srcRoot) {
  if (node.use !== 'component') return node.use;
  const file = resolveComponentRefPath(node, root, sourceDir, srcRoot);
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

function resolveComponentRefPath(node, root, sourceDir, srcRoot) {
  if (!node.path) return '';
  const candidates = path.isAbsolute(node.path)
    ? [node.path]
    : [
        path.resolve(sourceDir, node.path),
        path.resolve(root, node.path),
        path.resolve(srcRoot, node.path),
      ];
  const insideCandidates = candidates.filter(file => isInsideRoot(root, file));
  return insideCandidates.find(file => fs.existsSync(file)) ?? insideCandidates[0] ?? '';
}

export function componentRefProblems(raw, root, sourceFile, srcRoot) {
  const errors = [];
  const sourceDir = path.dirname(sourceFile);
  function walk(node) {
    if (node.use === 'component') {
      const file = resolveComponentRefPath(node, root, sourceDir, srcRoot);
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

