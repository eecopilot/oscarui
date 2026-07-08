import { camel, indent, esc, pascal, HEADER } from './util.mjs';
import {
  actionPropNames,
  actionsByName,
  componentsByName,
  emitsGroupedRow,
  isItemBinding,
  isLocalIdentifier,
  itemBindingField,
  listItemType,
  propBindingNames,
  screenLayout,
  stateBindingNames,
} from './renderer/ir-utils.mjs';

const WEIGHT = { bold: '.bold', semibold: '.semibold', regular: '.regular' };

export function emitThemeSwift(tokens) {
  const lines = [`// ${HEADER}`, 'import SwiftUI', '', 'enum Theme {'];
  lines.push('    enum Spacing {');
  for (const [k, v] of Object.entries(tokens.spacing))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Size {');
  for (const [k, v] of Object.entries(tokens.size ?? {}))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Radius {');
  for (const [k, v] of Object.entries(tokens.radius))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Colors {');
  for (const [k, v] of Object.entries(tokens.color))
    lines.push(`        static let ${k} = Color(hex: "${v}")`);
  lines.push('    }');
  lines.push('    enum Typography {');
  for (const [k, v] of Object.entries(tokens.typography))
    lines.push(`        static let ${k} = Font.system(size: ${v.size}, weight: ${WEIGHT[v.weight]})`);
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push(...`extension Color {
    init(hex: String) {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}`.split('\n'));
  lines.push('');
  return lines.join('\n');
}

const SWIFT_TYPE = { string: 'String', bool: 'Bool', int: 'Int', double: 'Double' };
const SWIFT_PROP_TYPE = { ...SWIFT_TYPE, action: '() -> Void' };
const SWIFT_DEFAULT = { string: '""', bool: 'false', int: '0', double: '0.0' };
const KEYBOARD = { email: '.emailAddress', number: '.numberPad', phone: '.phonePad', default: '.default' };

function alignVStack(a) {
  return { start: '.leading', center: '.center', end: '.trailing' }[a ?? 'center'];
}
function alignHStack(a) {
  return { start: '.top', center: '.center', end: '.bottom' }[a ?? 'center'];
}

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

function swiftLiteral(value, type) {
  if (type === 'string') return `"${esc(value ?? '')}"`;
  if (type === 'bool') return value === true ? 'true' : 'false';
  if (type === 'double') return value === undefined ? '0.0' : String(value);
  return value === undefined ? '0' : String(value);
}

function conditionExpression(condition) {
  const left = condition.state;
  if (Object.hasOwn(condition, 'equals')) return `${left} == ${swiftLiteral(condition.equals, typeof condition.equals === 'boolean' ? 'bool' : typeof condition.equals === 'number' ? 'double' : 'string')}`;
  if (Object.hasOwn(condition, 'notEquals')) return `${left} != ${swiftLiteral(condition.notEquals, typeof condition.notEquals === 'boolean' ? 'bool' : typeof condition.notEquals === 'number' ? 'double' : 'string')}`;
  return left;
}

function propLiteral(value, type, ctx) {
  if (typeof value === 'string') {
    if (isItemBinding(value)) return `item.${itemBindingField(value)}`;
    if (isLocalIdentifier(value) && ctx.bindings?.has(value)) return value;
  }
  return swiftLiteral(value, type);
}

function textExpression(value, bind, ctx) {
  if (bind) {
    if (isItemBinding(bind)) return `item.${itemBindingField(bind)}`;
    if (ctx.bindings?.has(bind)) return bind;
    return `String(${bind})`;
  }
  return `"${esc(value ?? '')}"`;
}

function applyVisibility(lines, node) {
  if (!node.visibleWhen) return lines;
  return [`if ${conditionExpression(node.visibleWhen)} {`, ...indent(lines, 1), '}'];
}

function actionLines(action, ctx) {
  const lines = [`actions.${action.name}()`];
  if (action.navigation?.type === 'push') lines.push(`router.push(.${camel(action.navigation.screen)})`);
  if (action.navigation?.type === 'pop') lines.push('router.pop()');
  return lines;
}

function actionInvocationLines(actionName, ctx) {
  if (ctx.actionProps?.has(actionName)) return [`${actionName}()`];
  return actionLines(ctx.actions.get(actionName), ctx);
}

function emitRawNode(node, ctx) {
  switch (node.type) {
    case 'column':
    case 'row': {
      const isCol = node.type === 'column';
      const stack = isCol ? 'VStack' : 'HStack';
      const align = isCol ? `alignment: ${alignVStack(node.align)}` : `alignment: ${alignHStack(node.align)}`;
      const spacing = `spacing: Theme.Spacing.${node.spacing ?? 'normal'}`;
      const lines = [`${stack}(${align}, ${spacing}) {`];
      for (const child of node.children) lines.push(...indent(emitNode(child, { ...ctx, isRootContent: false }), 1));
      lines.push('}');
      if (node.padding && node.padding !== 'none')
        lines.push(`.padding(Theme.Spacing.${node.padding})`);
      return lines;
    }
    case 'text': {
      const text = node.bind
        ? (isItemBinding(node.bind) ? `item.${itemBindingField(node.bind)}` : `String(${node.bind})`)
        : `"${esc(node.value)}"`;
      const lines = [`Text(${text})`];
      lines.push(`    .font(Theme.Typography.${node.role ?? 'body'})`);
      lines.push(`    .foregroundStyle(Theme.Colors.${node.color ?? 'textPrimary'})`);
      return lines;
    }
    case 'image': {
      const lines = [
        `AsyncImage(url: URL(string: "${esc(node.url)}")) { image in`,
        '    image.resizable().scaledToFill()',
        '} placeholder: {',
        '    Color.gray.opacity(0.2)',
        '}',
      ];
      if (node.height) lines.push(`.frame(height: ${node.height})`);
      lines.push(`.clipShape(RoundedRectangle(cornerRadius: Theme.Radius.${node.radius ?? 'none'}))`);
      return lines;
    }
    case 'button': {
      const role = node.role ?? 'primary';
      const lines = [
        'Button {',
        ...indent(actionInvocationLines(node.action, ctx), 1),
        '} label: {',
        `    Text("${esc(node.label)}")`,
        '        .font(Theme.Typography.body)',
        '        .frame(minWidth: Theme.Size.buttonMinWidth)',
        '        .frame(height: Theme.Size.controlHeight)',
        '        .padding(.horizontal, Theme.Spacing.normal)',
        '}',
        '.buttonStyle(.plain)',
      ];
      if (role === 'primary') {
        lines.push(
          '.foregroundStyle(Theme.Colors.onPrimary)',
          '.background(Theme.Colors.primary, in: RoundedRectangle(cornerRadius: Theme.Radius.large))'
        );
      } else if (role === 'secondary') {
        lines.push(
          '.foregroundStyle(Theme.Colors.primary)',
          '.background(Theme.Colors.fieldBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.large))',
          '.overlay(RoundedRectangle(cornerRadius: Theme.Radius.large).stroke(Theme.Colors.border, lineWidth: Theme.Size.borderWidth))'
        );
      } else {
        lines.push('.foregroundStyle(Theme.Colors.primary)');
      }
      return lines;
    }
    case 'listRow': {
      const lines = [
        'Button {',
        ...indent(actionInvocationLines(node.action, ctx), 1),
        '} label: {',
        '    HStack(alignment: .center, spacing: Theme.Spacing.normal) {',
        '        VStack(alignment: .leading, spacing: Theme.Spacing.tight) {',
        `            Text(${textExpression(node.title, node.titleBind, ctx)})`,
        '                .font(Theme.Typography.body)',
        '                .foregroundStyle(Theme.Colors.textPrimary)',
      ];
      if (node.subtitle || node.subtitleBind) {
        lines.push(
          `            Text(${textExpression(node.subtitle, node.subtitleBind, ctx)})`,
          '                .font(Theme.Typography.caption)',
          '                .foregroundStyle(Theme.Colors.textSecondary)'
        );
      }
      lines.push(
        '        }',
        '        Spacer()',
        '        Image(systemName: "chevron.right")',
        '            .font(.system(size: 13, weight: .semibold))',
        '            .foregroundStyle(Theme.Colors.chevron)',
        '    }',
        '    .padding(.horizontal, Theme.Spacing.normal)',
        '    .padding(.vertical, Theme.Spacing.tight)',
        '    .frame(maxWidth: .infinity, minHeight: Theme.Size.listRowMinHeight, alignment: .leading)',
        '    .contentShape(Rectangle())',
        '}',
        '.buttonStyle(.plain)',
        '.background(Theme.Colors.listRowBackground)'
      );
      return lines;
    }
    case 'textField': {
      const ph = esc(node.placeholder ?? '');
      const field = node.secure
        ? `SecureField("", text: $${node.bind}, prompt: Text("${ph}").foregroundColor(Theme.Colors.placeholder))`
        : `TextField("", text: $${node.bind}, prompt: Text("${ph}").foregroundColor(Theme.Colors.placeholder))`;
      const lines = [
        field,
        '    .font(Theme.Typography.body)',
        '    .foregroundStyle(Theme.Colors.textPrimary)',
        '    .padding(.horizontal, Theme.Spacing.normal)',
        '    .frame(height: Theme.Size.controlHeight)',
        '    .background(Theme.Colors.fieldBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.normal))',
        '    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.normal).stroke(Theme.Colors.border, lineWidth: Theme.Size.borderWidth))',
      ];
      if (node.keyboard && node.keyboard !== 'default')
        lines.push(`    .keyboardType(${KEYBOARD[node.keyboard]})`);
      return lines;
    }
    case 'list': {
      const groupedRows = node.itemTemplate.length === 1 && emitsGroupedRow(node.itemTemplate[0], ctx.components);
      const lines = [
        `VStack(alignment: .leading, spacing: ${groupedRows ? '0' : `Theme.Spacing.${node.spacing ?? 'normal'}`}) {`,
        `    ForEach(${node.bind}) { item in`,
      ];
      const inner = [];
      for (const child of node.itemTemplate) inner.push(...emitNode(child, { ...ctx, isRootContent: false }));
      lines.push(...indent(inner, 2));
      if (groupedRows) {
        lines.push(
          `        if item.id != ${node.bind}.last?.id {`,
          '            Divider()',
          '                .padding(.leading, Theme.Spacing.normal)',
          '        }'
        );
      }
      lines.push('    }', '}');
      if (groupedRows) {
        lines.push(
          '.background(Theme.Colors.listRowBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.normal))',
          '.clipShape(RoundedRectangle(cornerRadius: Theme.Radius.normal))'
        );
      }
      return lines;
    }
    case 'component': {
      const lines = [`${node.name}View(`];
      const args = Object.entries(node.props ?? {}).map(([name, value]) => {
        const prop = ctx.components.get(node.name)?.props?.find(p => p.name === name);
        if (prop?.type === 'action') {
          if (ctx.actionProps?.has(value)) return `${name}: ${value}`;
          const action = ctx.actions.get(value);
          return `${name}: { ${actionLines(action, ctx).join('; ')} }`;
        }
        return `${name}: ${propLiteral(value, prop?.type ?? 'string', ctx)}`;
      });
      lines.push(...indent(args.map((arg, index) => `${arg}${index < args.length - 1 ? ',' : ''}`), 1));
      lines.push(')');
      return lines;
    }
    case 'spacer':
      return ['Spacer()'];
    default:
      throw new Error(`swiftui: unknown node type ${node.type}`);
  }
}

function emitNode(node, ctx) {
  return applyVisibility(emitRawNode(node, ctx), node);
}

function emitListStateTypes(ir) {
  const lines = [];
  for (const state of ir.state ?? []) {
    if (state.type !== 'list') continue;
    lines.push(`    struct ${listItemType(state)}: Identifiable, Hashable {`);
    lines.push('        let id: Int');
    for (const field of state.item.fields) {
      lines.push(`        let ${field.name}: ${SWIFT_TYPE[field.type]}`);
    }
    lines.push('    }', '');
  }
  return lines;
}

function emitStateDefault(state) {
  if (state.type !== 'list') {
    return state.default !== undefined
      ? swiftLiteral(state.default, state.type)
      : SWIFT_DEFAULT[state.type];
  }

  const itemType = listItemType(state);
  const values = state.default ?? [];
  if (!values.length) return '[]';
  const rows = values.map((item, index) => {
    const fields = state.item.fields.map(field => `${field.name}: ${swiftLiteral(item[field.name], field.type)}`);
    return `${itemType}(id: ${index}, ${fields.join(', ')})`;
  });
  return `[\n${indent(rows.map((row, index) => `${row}${index < rows.length - 1 ? ',' : ''}`), 2).join('\n')}\n    ]`;
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
