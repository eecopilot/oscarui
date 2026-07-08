import fs from 'node:fs';
import path from 'node:path';
import { Api as FigmaApi } from 'figma-api';
import YAML from 'yaml';

function isFigmaUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'figma.com' || url.hostname.endsWith('.figma.com');
  } catch {
    return false;
  }
}

function parseFigmaSource(value) {
  if (isFigmaUrl(value)) {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const fileKey = parts.find((part, index) => ['file', 'design'].includes(parts[index - 1])) ?? '';
    const nodeId = normalizeNodeId(url.searchParams.get('node-id') ?? url.searchParams.get('node_id') ?? '');
    return { type: 'remote', fileKey, nodeId };
  }

  if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !fs.existsSync(value)) {
    return { type: 'remote', fileKey: value, nodeId: '' };
  }

  return { type: 'local', file: value };
}

function normalizeNodeId(value) {
  return value && !value.includes(':') ? value.replace(/-/g, ':') : value;
}

function figmaToken() {
  return process.env.FIGMA_TOKEN ?? process.env.FIGMA_PERSONAL_ACCESS_TOKEN ?? process.env.FIGMA_ACCESS_TOKEN ?? '';
}

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

async function loadRemoteFigmaSource(source) {
  if (!source.fileKey) throw new Error('figma import: could not find a Figma file key in the input URL');
  const token = figmaToken();
  if (!token) {
    throw new Error('figma import: set FIGMA_TOKEN to import from a Figma URL or file key');
  }

  const api = new FigmaApi({ personalAccessToken: token });
  if (source.nodeId) {
    const result = await api.getFileNodes(
      { file_key: source.fileKey },
      { ids: source.nodeId }
    );
    const node = result.nodes?.[source.nodeId]?.document;
    if (!node) throw new Error(`figma import: node "${source.nodeId}" was not found in file "${source.fileKey}"`);
    return node;
  }

  const file = await api.getFile({ file_key: source.fileKey });
  return file.document;
}

async function loadFigmaSource(root, inputFile) {
  const source = parseFigmaSource(inputFile);
  if (source.type === 'remote') return loadRemoteFigmaSource(source);

  const absoluteInput = path.resolve(root, source.file);
  const json = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  return json.document ?? json;
}

export async function importFigma(root, inputFile, outputFile) {
  if (!inputFile) throw new Error('figma import: missing input JSON file, Figma URL, or Figma file key');
  const rootNode = await loadFigmaSource(root, inputFile);
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
