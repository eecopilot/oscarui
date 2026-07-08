import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function toScreenName(value) {
  return String(value ?? 'Imported')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'Imported';
}

function textRole(node) {
  const size = Number(node.fontSize ?? node.style?.fontSize ?? 16);
  if (size >= 28) return 'title';
  if (size >= 20) return 'heading';
  if (size <= 13) return 'caption';
  return 'body';
}

function convertNode(node) {
  const type = String(node.type ?? '').toUpperCase();
  if (type === 'TEXT') {
    return {
      type: 'text',
      role: textRole(node),
      value: node.characters ?? node.name ?? 'Text',
    };
  }

  const children = (node.children ?? []).map(convertNode).filter(Boolean);
  if (!children.length) return null;

  return {
    type: 'column',
    spacing: 'normal',
    align: 'start',
    children,
  };
}

export function importFigma(root, inputFile, outputFile) {
  if (!inputFile) throw new Error('figma import: missing input JSON file');
  const absoluteInput = path.resolve(root, inputFile);
  const source = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  const rootNode = source.document ?? source;
  const screen = toScreenName(rootNode.name);
  const children = (rootNode.children ?? []).map(convertNode).filter(Boolean);

  const ir = {
    screen,
    title: rootNode.name ?? screen,
    layout: {
      safeArea: true,
      contentPosition: 'top',
      contentWidth: 'normal',
    },
    body: children.length
      ? children
      : [{ type: 'text', role: 'body', value: rootNode.name ?? screen }],
    actions: [],
  };

  const target = path.resolve(root, outputFile ?? path.join('screens', `${screen.charAt(0).toLowerCase()}${screen.slice(1)}.ui.yaml`));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, YAML.stringify(ir));
  console.log(`→ ${path.relative(root, target)}`);
  return target;
}
