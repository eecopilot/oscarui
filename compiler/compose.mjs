import { indent, esc, HEADER } from './util.mjs';
import { pascal } from './util.mjs';
export { emitThemeKotlin } from './renderer/compose-theme.mjs';
import { KT_PROP_TYPE, KT_TYPE, emitListStateTypes, emitStateDefault, kotlinLiteral } from './renderer/compose-state.mjs';
import {
  actionPropNames,
  actionsByName,
  componentsByName,
  emitsGroupedRow,
  isItemBinding,
  isLocalIdentifier,
  itemBindingField,
  propBindingNames,
  screenLayout,
  stateBindingNames,
} from './renderer/ir-utils.mjs';

const KEYBOARD = { email: 'KeyboardType.Email', number: 'KeyboardType.Number', phone: 'KeyboardType.Phone' };

function alignColumn(a) {
  return { start: 'Alignment.Start', center: 'Alignment.CenterHorizontally', end: 'Alignment.End' }[a ?? 'center'];
}
function alignRow(a) {
  return { start: 'Alignment.Top', center: 'Alignment.CenterVertically', end: 'Alignment.Bottom' }[a ?? 'center'];
}

function screenAlignment(layout) {
  return layout.contentPosition === 'center' ? 'Alignment.Center' : 'Alignment.TopCenter';
}

function addRootContentSize(modifiers, layout) {
  if (layout.contentWidth === 'fill') {
    modifiers.push('.fillMaxWidth()');
    return;
  }
  modifiers.push(`.widthIn(max = Theme.Size.content${pascal(layout.contentWidth)})`, '.fillMaxWidth()');
}

function propLiteral(value, type, ctx) {
  if (typeof value === 'string') {
    if (isItemBinding(value)) return `item.${itemBindingField(value)}`;
    if (isLocalIdentifier(value) && ctx.bindings?.has(value)) return value;
  }
  return kotlinLiteral(value, type);
}

function textExpression(value, bind, ctx) {
  if (bind) {
    if (isItemBinding(bind)) return `item.${itemBindingField(bind)}`;
    if (ctx.bindings?.has(bind)) return bind;
    return `${bind}.toString()`;
  }
  return `"${esc(value ?? '')}"`;
}

function conditionExpression(condition) {
  const left = condition.state;
  const valueType = typeof condition.equals === 'boolean' || typeof condition.notEquals === 'boolean'
    ? 'bool'
    : typeof condition.equals === 'number' || typeof condition.notEquals === 'number'
      ? 'double'
      : 'string';
  if (Object.hasOwn(condition, 'equals')) return `${left} == ${kotlinLiteral(condition.equals, valueType)}`;
  if (Object.hasOwn(condition, 'notEquals')) return `${left} != ${kotlinLiteral(condition.notEquals, valueType)}`;
  return left;
}

function applyVisibility(lines, node) {
  if (!node.visibleWhen) return lines;
  return [`if (${conditionExpression(node.visibleWhen)}) {`, ...indent(lines, 1), '}'];
}

function actionLines(action) {
  const lines = [`actions.${action.name}()`];
  if (action.navigation?.type === 'push') lines.push(`navController.navigate("${action.navigation.screen}")`);
  if (action.navigation?.type === 'pop') lines.push('navController.popBackStack()');
  return lines;
}

function actionInvocation(actionName, ctx) {
  if (ctx.actionProps?.has(actionName)) return `${actionName}()`;
  return actionLines(ctx.actions.get(actionName)).join('; ');
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
    case 'component': {
      const lines = [`${node.name}(`];
      const args = Object.entries(node.props ?? {}).map(([name, value]) => {
        const prop = ctx.components.get(node.name)?.props?.find(p => p.name === name);
        if (prop?.type === 'action') {
          if (ctx.actionProps?.has(value)) return `${name} = ${value}`;
          const action = ctx.actions.get(value);
          return `${name} = { ${actionLines(action).join('; ')} }`;
        }
        return `${name} = ${propLiteral(value, prop?.type ?? 'string', ctx)}`;
      });
      lines.push(...indent(args.map((arg, index) => `${arg}${index < args.length - 1 ? ',' : ''}`), 1));
      lines.push(')');
      return lines;
    }
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

function emitNode(node, ctx) {
  return applyVisibility(emitRawNode(node, ctx), node);
}

function componentImports() {
  return [
    `// ${HEADER}`,
    'package app.generated',
    '',
    'import androidx.compose.foundation.BorderStroke',
    'import androidx.compose.foundation.background',
    'import androidx.compose.foundation.clickable',
    'import androidx.compose.foundation.layout.*',
    'import androidx.compose.foundation.lazy.LazyColumn',
    'import androidx.compose.foundation.lazy.itemsIndexed',
    'import androidx.compose.foundation.shape.RoundedCornerShape',
    'import androidx.compose.material3.*',
    'import androidx.compose.runtime.*',
    'import androidx.compose.ui.Alignment',
    'import androidx.compose.ui.Modifier',
    'import androidx.compose.ui.draw.clip',
    'import androidx.compose.ui.layout.ContentScale',
    'import androidx.compose.foundation.text.KeyboardOptions',
    'import androidx.compose.ui.text.input.KeyboardType',
    'import androidx.compose.ui.text.input.PasswordVisualTransformation',
    'import androidx.compose.ui.unit.dp',
    'import androidx.navigation.NavHostController',
    'import coil.compose.AsyncImage',
    '',
  ];
}

export function emitScreenKotlin(ir, components = []) {
  const name = ir.screen;
  const lines = componentImports();

  lines.push(...emitListStateTypes(ir));

  const actions = ir.actions ?? [];
  lines.push(`interface ${name}Actions {`);
  for (const a of actions) lines.push(`    fun ${a.name}()`);
  lines.push('}', '');

  lines.push('@Composable');
  lines.push(`fun ${name}Screen(actions: ${name}Actions, navController: NavHostController) {`);
  for (const s of ir.state ?? []) {
    const def = emitStateDefault(s);
    if (s.type === 'list') {
      lines.push(`    val ${s.name} = remember { ${def} }`);
    } else {
      lines.push(`    var ${s.name} by remember { mutableStateOf${s.type === 'string' ? '' : `<${KT_TYPE[s.type]}>`}(${def}) }`);
    }
  }
  if ((ir.state ?? []).length) lines.push('');

  const layout = screenLayout(ir);
  const actionsMap = actionsByName(actions);
  const componentsMap = componentsByName(components);
  const bindings = stateBindingNames(ir);
  const rootModifiers = ['Modifier', '.fillMaxSize()', '.background(Theme.Colors.background)'];
  if (layout.safeArea) rootModifiers.push('.safeDrawingPadding()');

  const body = [];
  for (const node of ir.body) body.push(...emitNode(node, { isRootContent: ir.body.length === 1, layout, actions: actionsMap, components: componentsMap, bindings }));
  const wrapped = ir.body.length > 1
    ? ['Column(modifier = Modifier.fillMaxWidth()) {', ...indent(body, 1), '}']
    : body;
  lines.push('    Box(');
  lines.push(`        modifier = ${rootModifiers.join('')},`);
  lines.push(`        contentAlignment = ${screenAlignment(layout)}`);
  lines.push('    ) {');
  lines.push(...indent(wrapped, 2));
  lines.push('    }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

export function emitComponentKotlin(ir, components = []) {
  const lines = componentImports();
  const componentsMap = componentsByName(components);
  const propActions = actionPropNames(ir);
  const bindings = propBindingNames(ir);

  lines.push('@Composable');
  lines.push(`fun ${ir.component}(`);
  lines.push(...indent((ir.props ?? []).map((prop, index, all) => `${prop.name}: ${KT_PROP_TYPE[prop.type]}${index < all.length - 1 ? ',' : ''}`), 1));
  lines.push(') {');

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
  const wrapped = ir.body.length > 1 ? ['Column {', ...indent(body, 1), '}'] : body;
  lines.push(...indent(wrapped, 1));
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
