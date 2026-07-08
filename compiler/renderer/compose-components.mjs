import { indent } from '../util.mjs';
import { actionLines } from './compose-expressions.mjs';
import { kotlinLiteral } from './compose-state.mjs';
import { isItemBinding, isLocalIdentifier, itemBindingField } from './ir-utils.mjs';

function propLiteral(value, type, ctx) {
  if (typeof value === 'string') {
    if (isItemBinding(value)) return `item.${itemBindingField(value)}`;
    if (isLocalIdentifier(value) && ctx.bindings?.has(value)) return value;
  }
  return kotlinLiteral(value, type);
}

export function emitComponentNode(node, ctx) {
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
