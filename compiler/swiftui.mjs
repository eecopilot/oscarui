import { indent, pascal, HEADER } from './util.mjs';
export { emitThemeSwift } from './renderer/swift-theme.mjs';
import { emitNode } from './renderer/swift-nodes.mjs';
import { SWIFT_PROP_TYPE, SWIFT_TYPE, emitListStateTypes, emitStateDefault } from './renderer/swift-state.mjs';
import {
  actionPropNames,
  actionsByName,
  componentsByName,
  listItemType,
  propBindingNames,
  screenLayout,
  stateBindingNames,
} from './renderer/ir-utils.mjs';

function rootAlignment(node) {
  if (node?.type === 'column') {
    return { start: '.topLeading', center: '.top', end: '.topTrailing' }[node.align ?? 'center'];
  }
  if (node?.type === 'row') {
    return { start: '.topLeading', center: '.leading', end: '.bottomLeading' }[node.align ?? 'center'];
  }
  return '.top';
}

function screenAlignment(layout, fallback) {
  if (layout.contentPosition === 'center') return '.center';
  return fallback;
}

function horizontalFrameAlignment(node) {
  if (node?.type === 'column' || node?.type === 'row') {
    return { start: '.leading', center: '.center', end: '.trailing' }[node.align ?? 'center'];
  }
  return '.center';
}

function contentWidthModifier(layout, alignment = '.center') {
  if (layout.contentWidth === 'fill') return null;
  return `.frame(maxWidth: Theme.Size.content${pascal(layout.contentWidth)}, alignment: ${alignment})`;
}

export function emitScreenSwift(ir, components = []) {
  const name = ir.screen;
  const lines = [`// ${HEADER}`, 'import SwiftUI', ''];

  const actions = ir.actions ?? [];
  lines.push(`protocol ${name}Actions {`);
  for (const a of actions) lines.push(`    func ${a.name}()`);
  lines.push('}', '');

  lines.push(`struct ${name}View: View {`);
  lines.push(...emitListStateTypes(ir));
  for (const s of ir.state ?? []) {
    if (s.type === 'list') {
      lines.push(`    @State private var ${s.name}: [${listItemType(s)}] = ${emitStateDefault(s)}`);
    } else {
      lines.push(`    @State private var ${s.name}: ${SWIFT_TYPE[s.type]} = ${emitStateDefault(s)}`);
    }
  }
  lines.push(`    let actions: ${name}Actions`);
  lines.push('    @ObservedObject var router: OscarRouter', '');
  lines.push('    var body: some View {');

  const layout = screenLayout(ir);
  const actionsMap = actionsByName(actions);
  const componentsMap = componentsByName(components);
  const bindings = stateBindingNames(ir);
  const body = [];
  for (const node of ir.body) body.push(...emitNode(node, { isRootContent: false, layout, actions: actionsMap, components: componentsMap, bindings }));
  const content = ir.body.length > 1 ? ['VStack {', ...indent(body, 1), '}'] : body;
  const fallbackAlignment = rootAlignment(ir.body.length === 1 ? ir.body[0] : undefined);
  const alignment = screenAlignment(layout, fallbackAlignment);
  const frameAlignment = horizontalFrameAlignment(ir.body.length === 1 ? ir.body[0] : undefined);
  lines.push('        GeometryReader { proxy in');
  lines.push(`            ZStack(alignment: ${alignment}) {`);
  lines.push('                Theme.Colors.background');
  lines.push('                    .ignoresSafeArea()');
  lines.push(...indent(content, 4));
  const width = contentWidthModifier(layout, frameAlignment);
  if (width) lines.push(`                    ${width}`);
  lines.push('            }');
  lines.push('            .frame(width: proxy.size.width, height: proxy.size.height)');
  lines.push('        }');
  lines.push('        .background(Theme.Colors.background)');
  if (!layout.safeArea) lines.push('        .ignoresSafeArea()');

  lines.push('    }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

export function emitComponentSwift(ir, components = []) {
  const name = ir.component;
  const lines = [`// ${HEADER}`, 'import SwiftUI', ''];

  lines.push(`struct ${name}View: View {`);
  for (const prop of ir.props ?? []) {
    lines.push(`    let ${prop.name}: ${SWIFT_PROP_TYPE[prop.type]}`);
  }
  lines.push('');
  lines.push('    var body: some View {');

  const propActions = actionPropNames(ir);
  const componentsMap = componentsByName(components);
  const bindings = propBindingNames(ir);
  const body = [];
  for (const node of ir.body) {
    body.push(...emitNode(node, {
      isRootContent: false,
      layout: screenLayout({}),
      actions: new Map(),
      actionProps: propActions,
      components: componentsMap,
      bindings,
    }));
  }
  const wrapped = ir.body.length > 1 ? ['VStack {', ...indent(body, 1), '}'] : body;
  lines.push(...indent(wrapped, 2));
  lines.push('    }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
