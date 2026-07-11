import { hasToken } from './tokens.mjs';

export function nodeSemanticProblems(ir, tokens, componentsByName) {
  const errors = [];
  const stateNames = new Map((ir.state ?? []).map(s => [s.name, s]));
  const propNames = new Map((ir.props ?? []).map(p => [p.name, p]));
  const actionNames = new Set((ir.actions ?? []).map(a => a.name));

  function checkCondition(node, add) {
    if (!node.visibleWhen) return;
    const conditionValue = stateNames.get(node.visibleWhen.state) ?? propNames.get(node.visibleWhen.state);
    if (!conditionValue) {
      add(`${node.type} visibleWhen references undeclared state or prop "${node.visibleWhen.state}"`);
    } else if (conditionValue.type === 'list' || conditionValue.type === 'action') {
      add(`${node.type} visibleWhen "${node.visibleWhen.state}" must reference scalar state or prop`);
    }
  }

  function listFieldProblem(binding, listContext, label, add) {
    if (!binding.startsWith('item.')) return false;
    const field = binding.slice('item.'.length);
    if (!listContext) {
      add(`${label} "${binding}" can only be used inside list itemTemplate`);
      return true;
    }
    const fields = new Set((listContext.item?.fields ?? []).map(f => f.name));
    if (!fields.has(field)) add(`${label} "${binding}" references unknown list item field`);
    return true;
  }

  function checkTextBinding(node, listContext, add) {
    if (node.type !== 'text' || !node.bind) return;
    if (listFieldProblem(node.bind, listContext, 'text bind', add)) return;
    const value = stateNames.get(node.bind) ?? propNames.get(node.bind);
    if (!value) add(`text binds to undeclared state or prop "${node.bind}"`);
    else if (value.type === 'list' || value.type === 'action') add(`text bind "${node.bind}" must reference scalar state or prop`);
  }

  function checkListRowBinding(node, listContext, key, add) {
    const binding = node[key];
    if (node.type !== 'listRow' || !binding) return;
    if (listFieldProblem(binding, listContext, `listRow ${key}`, add)) return;
    const value = stateNames.get(binding) ?? propNames.get(binding);
    if (!value) add(`listRow ${key} references undeclared state or prop "${binding}"`);
    else if (value.type === 'list' || value.type === 'action') add(`listRow ${key} "${binding}" must reference scalar state or prop`);
  }

  function checkActionReference(node, add) {
    if (node.type !== 'button' && node.type !== 'listRow') return;
    if (actionNames.has(node.action)) return;
    const prop = propNames.get(node.action);
    if (!prop) {
      add(`${node.type} references undeclared action or action prop "${node.action}"`);
    } else if (prop.type !== 'action') {
      add(`${node.type} action "${node.action}" must reference action prop`);
    }
  }

  function checkComponentCall(node, listContext, add) {
    if (node.type !== 'component') return;
    const component = componentsByName.get(node.name);
    if (!component) {
      if (node.name) add(`component node references unknown component "${node.name}"`);
      return;
    }

    const expectedProps = new Map((component.props ?? []).map(prop => [prop.name, prop]));
    const actualProps = node.props ?? {};
    for (const prop of component.props ?? []) {
      if (!Object.hasOwn(actualProps, prop.name)) add(`component "${node.name}" is missing prop "${prop.name}"`);
    }
    for (const propName of Object.keys(actualProps)) {
      const expected = expectedProps.get(propName);
      if (!expected) {
        add(`component "${node.name}" received unknown prop "${propName}"`);
        continue;
      }
      const value = actualProps[propName];
      if (expected.type === 'action') {
        if (typeof value !== 'string') {
          add(`component "${node.name}" action prop "${propName}" must be an action name`);
        } else if (!actionNames.has(value) && propNames.get(value)?.type !== 'action') {
          add(`component "${node.name}" action prop "${propName}" references undeclared action or action prop "${value}"`);
        }
        continue;
      }
      if (typeof value === 'string' && listFieldProblem(value, listContext, `component "${node.name}" prop "${propName}"`, add)) continue;
      if (typeof value === 'string' && /^[a-z][A-Za-z0-9]*$/.test(value)) {
        const referenced = stateNames.get(value) ?? propNames.get(value);
        if (referenced && referenced.type !== expected.type) {
          add(`component "${node.name}" prop "${propName}" expects ${expected.type} but "${value}" is ${referenced.type}`);
        }
      }
    }
  }

  function walk(node, listContext = null, nodePath = 'body') {
    const add = message => errors.push(`${nodePath}: ${message}`);
    checkCondition(node, add);
    if (node.spacing && !hasToken(tokens, 'spacing', node.spacing))
      add(`${node.type} references missing spacing token "${node.spacing}"`);
    if (node.padding && !hasToken(tokens, 'spacing', node.padding))
      add(`${node.type} references missing padding token "${node.padding}"`);
    if (node.radius && !hasToken(tokens, 'radius', node.radius))
      add(`${node.type} references missing radius token "${node.radius}"`);
    if (node.type === 'text' && node.color && !hasToken(tokens, 'color', node.color))
      add(`text references missing color token "${node.color}"`);
    if (node.type === 'text' && node.role && !hasToken(tokens, 'typography', node.role))
      add(`text references missing typography token "${node.role}"`);
    checkTextBinding(node, listContext, add);
    checkListRowBinding(node, listContext, 'titleBind', add);
    checkListRowBinding(node, listContext, 'subtitleBind', add);
    checkComponentCall(node, listContext, add);

    if (node.type === 'textField' && !stateNames.has(node.bind)) {
      add(`textField binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'textField' && stateNames.get(node.bind)?.type !== 'string') {
      add(`textField bind "${node.bind}" must reference string state`);
    }
    checkActionReference(node, add);
    let nextListContext = listContext;
    if (node.type === 'list' && node.bind && !stateNames.has(node.bind)) {
      add(`list binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'list' && node.bind && stateNames.get(node.bind)?.type !== 'list') {
      add(`list bind "${node.bind}" must reference list state`);
    } else if (node.type === 'list' && node.bind) {
      nextListContext = stateNames.get(node.bind);
    }
    for (const [index, child] of (node.children ?? []).entries()) walk(child, listContext, `${nodePath}.children[${index}]`);
    for (const [index, child] of (node.itemTemplate ?? []).entries()) walk(child, nextListContext, `${nodePath}.itemTemplate[${index}]`);
  }

  for (const [index, node] of (ir.body ?? []).entries()) walk(node, null, `body[${index}]`);
  return errors;
}
