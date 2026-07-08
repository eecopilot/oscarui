import { camel, indent } from '../util.mjs';
import { swiftLiteral } from './swift-state.mjs';

export function conditionExpression(condition) {
  const left = condition.state;
  if (Object.hasOwn(condition, 'equals')) {
    const type = typeof condition.equals === 'boolean' ? 'bool' : typeof condition.equals === 'number' ? 'double' : 'string';
    return `${left} == ${swiftLiteral(condition.equals, type)}`;
  }
  if (Object.hasOwn(condition, 'notEquals')) {
    const type = typeof condition.notEquals === 'boolean' ? 'bool' : typeof condition.notEquals === 'number' ? 'double' : 'string';
    return `${left} != ${swiftLiteral(condition.notEquals, type)}`;
  }
  return left;
}

export function applyVisibility(lines, node) {
  if (!node.visibleWhen) return lines;
  return [`if ${conditionExpression(node.visibleWhen)} {`, ...indent(lines, 1), '}'];
}

export function actionLines(action) {
  const lines = [`actions.${action.name}()`];
  if (action.navigation?.type === 'push') lines.push(`router.push(.${camel(action.navigation.screen)})`);
  if (action.navigation?.type === 'pop') lines.push('router.pop()');
  return lines;
}

export function actionInvocationLines(actionName, ctx) {
  if (ctx.actionProps?.has(actionName)) return [`${actionName}()`];
  return actionLines(ctx.actions.get(actionName));
}
