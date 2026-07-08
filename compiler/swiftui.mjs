import { camel, indent, esc, pascal, HEADER } from './util.mjs';

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

function screenLayout(ir) {
  return {
    safeArea: ir.layout?.safeArea ?? true,
    contentPosition: ir.layout?.contentPosition ?? 'top',
    contentWidth: ir.layout?.contentWidth ?? 'fill',
  };
}

function screenAlignment(layout, fallback) {
  if (layout.contentPosition === 'center') return '.center';
  return fallback;
}

function contentWidthModifier(layout) {
  if (layout.contentWidth === 'fill') return null;
  return `.frame(maxWidth: Theme.Size.content${pascal(layout.contentWidth)})`;
}

function swiftLiteral(value, type) {
  if (type === 'string') return `"${esc(value ?? '')}"`;
  if (type === 'bool') return value === true ? 'true' : 'false';
  if (type === 'double') return value === undefined ? '0.0' : String(value);
  return value === undefined ? '0' : String(value);
}

function listItemType(state) {
  return `${pascal(state.name)}Item`;
}

function conditionExpression(condition) {
  const left = condition.state;
  if (Object.hasOwn(condition, 'equals')) return `${left} == ${swiftLiteral(condition.equals, typeof condition.equals === 'boolean' ? 'bool' : typeof condition.equals === 'number' ? 'double' : 'string')}`;
  if (Object.hasOwn(condition, 'notEquals')) return `${left} != ${swiftLiteral(condition.notEquals, typeof condition.notEquals === 'boolean' ? 'bool' : typeof condition.notEquals === 'number' ? 'double' : 'string')}`;
  return left;
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
      if (ctx.isRootContent) {
        const width = contentWidthModifier(ctx.layout);
        if (width) lines.push(width);
      }
      return lines;
    }
    case 'text': {
      const text = node.bind
        ? (node.bind.startsWith('item.') ? `item.${node.bind.slice('item.'.length)}` : `String(${node.bind})`)
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
      const action = ctx.actions.get(node.action);
      const lines = [
        'Button {',
        ...indent(actionLines(action, ctx), 1),
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
      const lines = [
        `VStack(alignment: .leading, spacing: Theme.Spacing.${node.spacing ?? 'normal'}) {`,
        `    ForEach(${node.bind}) { item in`,
      ];
      const inner = [];
      for (const child of node.itemTemplate) inner.push(...emitNode(child, { ...ctx, isRootContent: false }));
      lines.push(...indent(inner, 2));
      lines.push('    }', '}');
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

export function emitScreenSwift(ir) {
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
  const actionsByName = new Map(actions.map(action => [action.name, action]));
  const body = [];
  for (const node of ir.body) body.push(...emitNode(node, { isRootContent: ir.body.length === 1, layout, actions: actionsByName }));
  const wrapped = ir.body.length > 1 ? ['VStack {', ...indent(body, 1), '}'] : body;
  lines.push(...indent(wrapped, 2));
  if (ir.body.length > 1) {
    const width = contentWidthModifier(layout);
    if (width) lines.push(`        ${width}`);
  }
  const fallbackAlignment = rootAlignment(ir.body.length === 1 ? ir.body[0] : undefined);
  lines.push(`        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${screenAlignment(layout, fallbackAlignment)})`);
  lines.push('        .background(Theme.Colors.background)');
  if (!layout.safeArea) lines.push('        .ignoresSafeArea()');

  lines.push('    }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
