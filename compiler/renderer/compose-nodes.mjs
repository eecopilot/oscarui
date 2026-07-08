import { indent, esc, pascal } from '../util.mjs';
import { actionInvocation, applyVisibility } from './compose-expressions.mjs';
import { emitComponentNode } from './compose-components.mjs';
import { emitsGroupedRow, isItemBinding, itemBindingField } from './ir-utils.mjs';

const KEYBOARD = { email: 'KeyboardType.Email', number: 'KeyboardType.Number', phone: 'KeyboardType.Phone' };

function alignColumn(a) {
  return { start: 'Alignment.Start', center: 'Alignment.CenterHorizontally', end: 'Alignment.End' }[a ?? 'center'];
}

function alignRow(a) {
  return { start: 'Alignment.Top', center: 'Alignment.CenterVertically', end: 'Alignment.Bottom' }[a ?? 'center'];
}

function addRootContentSize(modifiers, layout) {
  if (layout.contentWidth === 'fill') {
    modifiers.push('.fillMaxWidth()');
    return;
  }
  modifiers.push(`.widthIn(max = Theme.Size.content${pascal(layout.contentWidth)})`, '.fillMaxWidth()');
}

function textExpression(value, bind, ctx) {
  if (bind) {
    if (isItemBinding(bind)) return `item.${itemBindingField(bind)}`;
    if (ctx.bindings?.has(bind)) return bind;
    return `${bind}.toString()`;
  }
  return `"${esc(value ?? '')}"`;
}

function emitRawNode(node, ctx) {
  switch (node.type) {
    case 'column':
    case 'row': {
      const isCol = node.type === 'column';
      const args = [];
      const modifiers = ['Modifier'];
      if (ctx.isRootContent) addRootContentSize(modifiers, ctx.layout);
      if (node.padding && node.padding !== 'none') modifiers.push(`.padding(Theme.Spacing.${node.padding})`);
      if (modifiers.length > 1) args.push(`modifier = ${modifiers.join('')}`);
      args.push(
        isCol
          ? `verticalArrangement = Arrangement.spacedBy(Theme.Spacing.${node.spacing ?? 'normal'})`
          : `horizontalArrangement = Arrangement.spacedBy(Theme.Spacing.${node.spacing ?? 'normal'})`
      );
      args.push(
        isCol
          ? `horizontalAlignment = ${alignColumn(node.align)}`
          : `verticalAlignment = ${alignRow(node.align)}`
      );
      const lines = [`${isCol ? 'Column' : 'Row'}(`, ...indent(args.map((a, i) => a + (i < args.length - 1 ? ',' : '')), 1), ') {'];
      for (const child of node.children) lines.push(...indent(emitNode(child, { ...ctx, isRootContent: false }), 1));
      lines.push('}');
      return lines;
    }
    case 'text':
      return [
        'Text(',
        `    text = ${node.bind ? (isItemBinding(node.bind) ? `item.${itemBindingField(node.bind)}` : `${node.bind}.toString()`) : `"${esc(node.value)}"`},`,
        `    style = Theme.Typography.${node.role ?? 'body'},`,
        `    color = Theme.Colors.${node.color ?? 'textPrimary'}`,
        ')',
      ];
    case 'image': {
      const mods = ['Modifier', '.fillMaxWidth()'];
      if (node.height) mods.push(`.height(${node.height}.dp)`);
      mods.push(`.clip(RoundedCornerShape(Theme.Radius.${node.radius ?? 'none'}))`);
      return [
        'AsyncImage(',
        `    model = "${esc(node.url)}",`,
        '    contentDescription = null,',
        '    contentScale = ContentScale.Crop,',
        `    modifier = ${mods.join('')}`,
        ')',
      ];
    }
    case 'button': {
      const role = node.role ?? 'primary';
      const call = actionInvocation(node.action, ctx);
      const commonArgs = [
        `onClick = { ${call} }`,
        'modifier = Modifier.height(Theme.Size.controlHeight).widthIn(min = Theme.Size.buttonMinWidth)',
        'contentPadding = PaddingValues(horizontal = Theme.Spacing.normal)',
        'shape = RoundedCornerShape(Theme.Radius.large)',
      ];
      const label = [
        `    Text(`,
        `        text = "${esc(node.label)}",`,
        '        style = Theme.Typography.body',
        '    )',
      ];
      if (role === 'primary') {
        return [
          'Button(',
          ...indent([
            ...commonArgs,
            'colors = ButtonDefaults.buttonColors(containerColor = Theme.Colors.primary, contentColor = Theme.Colors.onPrimary)',
          ].map((a, i, arr) => a + (i < arr.length - 1 ? ',' : '')), 1),
          ') {',
          ...label,
          '}',
        ];
      }
      if (role === 'secondary') {
        return [
          'OutlinedButton(',
          ...indent([
            ...commonArgs,
            'colors = ButtonDefaults.outlinedButtonColors(contentColor = Theme.Colors.primary)',
            'border = BorderStroke(Theme.Size.borderWidth, Theme.Colors.border)',
          ].map((a, i, arr) => a + (i < arr.length - 1 ? ',' : '')), 1),
          ') {',
          ...label,
          '}',
        ];
      }
      return [
        'TextButton(',
        ...indent([
          ...commonArgs,
          'colors = ButtonDefaults.textButtonColors(contentColor = Theme.Colors.primary)',
        ].map((a, i, arr) => a + (i < arr.length - 1 ? ',' : '')), 1),
        ') {',
        ...label,
        '}',
      ];
    }
    case 'listRow': {
      const call = actionInvocation(node.action, ctx);
      const modifier = [
        'Modifier.fillMaxWidth()',
        '.background(Theme.Colors.listRowBackground)',
        `.clickable { ${call} }`,
        '.heightIn(min = Theme.Size.listRowMinHeight)',
        '.padding(horizontal = Theme.Spacing.normal, vertical = Theme.Spacing.tight)',
      ].join('');
      const lines = [
        'Row(',
        ...indent([
          `modifier = ${modifier}`,
          'verticalAlignment = Alignment.CenterVertically',
          'horizontalArrangement = Arrangement.spacedBy(Theme.Spacing.normal)',
        ].map((a, i, arr) => a + (i < arr.length - 1 ? ',' : '')), 1),
        ') {',
        '    Column(',
        '        modifier = Modifier.weight(1f),',
        '        verticalArrangement = Arrangement.spacedBy(Theme.Spacing.tight)',
        '    ) {',
        '        Text(',
        `            text = ${textExpression(node.title, node.titleBind, ctx)},`,
        '            style = Theme.Typography.body,',
        '            color = Theme.Colors.textPrimary',
        '        )',
      ];
      if (node.subtitle || node.subtitleBind) {
        lines.push(
          '        Text(',
          `            text = ${textExpression(node.subtitle, node.subtitleBind, ctx)},`,
          '            style = Theme.Typography.caption,',
          '            color = Theme.Colors.textSecondary',
          '        )'
        );
      }
      lines.push(
        '    }',
        '    Text(',
        '        text = "›",',
        '        style = Theme.Typography.heading,',
        '        color = Theme.Colors.chevron',
        '    )',
        '}'
      );
      return lines;
    }
    case 'component':
      return emitComponentNode(node, ctx);
    case 'textField': {
      const args = [
        `value = ${node.bind}`,
        `onValueChange = { ${node.bind} = it }`,
      ];
      if (node.placeholder)
        args.push(`placeholder = { Text("${esc(node.placeholder)}", style = Theme.Typography.body, color = Theme.Colors.placeholder) }`);
      if (node.secure) args.push('visualTransformation = PasswordVisualTransformation()');
      if (node.keyboard && node.keyboard !== 'default')
        args.push(`keyboardOptions = KeyboardOptions(keyboardType = ${KEYBOARD[node.keyboard]})`);
      args.push('singleLine = true');
      args.push('textStyle = Theme.Typography.body');
      args.push('shape = RoundedCornerShape(Theme.Radius.normal)');
      args.push('colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Theme.Colors.textPrimary, unfocusedTextColor = Theme.Colors.textPrimary, focusedBorderColor = Theme.Colors.primary, unfocusedBorderColor = Theme.Colors.border, focusedContainerColor = Theme.Colors.fieldBackground, unfocusedContainerColor = Theme.Colors.fieldBackground, focusedPlaceholderColor = Theme.Colors.placeholder, unfocusedPlaceholderColor = Theme.Colors.placeholder)');
      args.push('modifier = Modifier.fillMaxWidth().height(Theme.Size.controlHeight)');
      return [
        'OutlinedTextField(',
        ...indent(args.map((a, i) => a + (i < args.length - 1 ? ',' : '')), 1),
        ')',
      ];
    }
    case 'list': {
      const groupedRows = node.itemTemplate.length === 1 && emitsGroupedRow(node.itemTemplate[0], ctx.components);
      const lines = [
        'LazyColumn(',
        ...indent([
          `verticalArrangement = Arrangement.spacedBy(${groupedRows ? '0.dp' : `Theme.Spacing.${node.spacing ?? 'normal'}`})`,
          ...(groupedRows ? ['modifier = Modifier.clip(RoundedCornerShape(Theme.Radius.normal)).background(Theme.Colors.listRowBackground)'] : []),
        ].map((a, i, arr) => a + (i < arr.length - 1 ? ',' : '')), 1),
        ') {',
        `    itemsIndexed(${node.bind}) { index, item ->`,
      ];
      const inner = [];
      for (const child of node.itemTemplate) inner.push(...emitNode(child, { ...ctx, isRootContent: false }));
      lines.push(...indent(inner, 2));
      if (groupedRows) {
        lines.push(
          `        if (index < ${node.bind}.lastIndex) {`,
          '            HorizontalDivider(',
          '                modifier = Modifier.padding(start = Theme.Spacing.normal),',
          '                color = Theme.Colors.border,',
          '                thickness = Theme.Size.borderWidth',
          '            )',
          '        }'
        );
      }
      lines.push('    }', '}');
      return lines;
    }
    case 'spacer':
      return ['Spacer(modifier = Modifier.weight(1f))'];
    default:
      throw new Error(`compose: unknown node type ${node.type}`);
  }
}

export function emitNode(node, ctx) {
  return applyVisibility(emitRawNode(node, ctx), node);
}
