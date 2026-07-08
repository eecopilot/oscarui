import { indent, esc } from '../util.mjs';
import { actionInvocationLines, applyVisibility } from './swift-expressions.mjs';
import { emitComponentNode } from './swift-components.mjs';
import { emitsGroupedRow, isItemBinding, itemBindingField } from './ir-utils.mjs';

const KEYBOARD = { email: '.emailAddress', number: '.numberPad', phone: '.phonePad', default: '.default' };

function alignVStack(a) {
  return { start: '.leading', center: '.center', end: '.trailing' }[a ?? 'center'];
}

function alignHStack(a) {
  return { start: '.top', center: '.center', end: '.bottom' }[a ?? 'center'];
}

function textExpression(value, bind, ctx) {
  if (bind) {
    if (isItemBinding(bind)) return `item.${itemBindingField(bind)}`;
    if (ctx.bindings?.has(bind)) return bind;
    return `String(${bind})`;
  }
  return `"${esc(value ?? '')}"`;
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
    case 'component':
      return emitComponentNode(node, ctx);
    case 'spacer':
      return ['Spacer()'];
    default:
      throw new Error(`swiftui: unknown node type ${node.type}`);
  }
}

export function emitNode(node, ctx) {
  return applyVisibility(emitRawNode(node, ctx), node);
}
