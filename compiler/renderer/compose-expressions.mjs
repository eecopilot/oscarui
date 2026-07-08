import { indent } from '../util.mjs';
import { kotlinLiteral } from './compose-state.mjs';

export function conditionExpression(condition) {
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

export function applyVisibility(lines, node) {
  if (!node.visibleWhen) return lines;
  return [`if (${conditionExpression(node.visibleWhen)}) {`, ...indent(lines, 1), '}'];
}

export function actionLines(action) {
  const lines = [`actions.${action.name}()`];
  if (action.navigation?.type === 'push') lines.push(`navController.navigate("${action.navigation.screen}")`);
  if (action.navigation?.type === 'pop') lines.push('navController.popBackStack()');
  return lines;
}

export function actionInvocation(actionName, ctx) {
  if (ctx.actionProps?.has(actionName)) return `${actionName}()`;
  return actionLines(ctx.actions.get(actionName)).join('; ');
}
