import { indent, HEADER } from './util.mjs';
export { emitThemeKotlin } from './renderer/compose-theme.mjs';
import { emitNode } from './renderer/compose-nodes.mjs';
import { KT_PROP_TYPE, KT_TYPE, emitListStateTypes, emitStateDefault } from './renderer/compose-state.mjs';
import {
  actionPropNames,
  actionsByName,
  componentsByName,
  propBindingNames,
  screenLayout,
  stateBindingNames,
} from './renderer/ir-utils.mjs';

function screenAlignment(layout) {
  return layout.contentPosition === 'center' ? 'Alignment.Center' : 'Alignment.TopCenter';
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
  lines.push(`fun ${name}Screen(actions: ${name}Actions, navigator: OscarNavigator) {`);
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
