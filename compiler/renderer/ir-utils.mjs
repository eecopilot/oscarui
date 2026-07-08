import { pascal } from '../util.mjs';

export function screenLayout(ir) {
  return {
    safeArea: ir.layout?.safeArea ?? true,
    contentPosition: ir.layout?.contentPosition ?? 'top',
    contentWidth: ir.layout?.contentWidth ?? 'fill',
  };
}

export function listItemType(state) {
  return `${pascal(state.name)}Item`;
}

export function isItemBinding(value) {
  return typeof value === 'string' && /^item\.[a-z][A-Za-z0-9]*$/.test(value);
}

export function itemBindingField(value) {
  return value.slice('item.'.length);
}

export function isLocalIdentifier(value) {
  return typeof value === 'string' && /^[a-z][A-Za-z0-9]*$/.test(value);
}

export function emitsGroupedRow(node, componentsByName) {
  if (node.type === 'listRow') return true;
  if (node.type !== 'component') return false;
  const component = componentsByName.get(node.name);
  return component?.body?.length === 1 && component.body[0]?.type === 'listRow';
}

export function actionsByName(actions = []) {
  return new Map(actions.map(action => [action.name, action]));
}

export function componentsByName(components = []) {
  return new Map(components.map(component => [component.component, component]));
}

export function stateBindingNames(ir) {
  return new Set((ir.state ?? []).map(state => state.name));
}

export function propBindingNames(ir) {
  return new Set((ir.props ?? []).map(prop => prop.name));
}

export function actionPropNames(ir) {
  return new Set((ir.props ?? []).filter(prop => prop.type === 'action').map(prop => prop.name));
}
