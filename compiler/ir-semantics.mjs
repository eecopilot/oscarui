import fs from 'node:fs';
import path from 'node:path';

function duplicateNames(items, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items ?? []) {
    if (seen.has(item.name)) duplicates.add(item.name);
    seen.add(item.name);
  }
  return [...duplicates].map(name => `duplicate ${label} name "${name}"`);
}

function duplicateFieldNames(fields, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const field of fields ?? []) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return [...duplicates].map(name => `duplicate ${label} field name "${name}"`);
}

function hasToken(tokens, group, name) {
  return Boolean(name && tokens?.[group] && Object.hasOwn(tokens[group], name));
}

export function themeProblems(tokens) {
  const required = {
    spacing: ['none', 'tight', 'normal', 'loose'],
    size: ['contentCompact', 'contentNormal', 'contentWide', 'controlHeight', 'listRowMinHeight', 'buttonMinWidth', 'borderWidth'],
    radius: ['none', 'small', 'normal', 'large'],
    color: ['primary', 'background', 'fieldBackground', 'listRowBackground', 'border', 'textPrimary', 'textSecondary', 'chevron', 'placeholder', 'onPrimary'],
    typography: ['title', 'heading', 'body', 'caption'],
  };
  const problems = [];
  for (const [group, names] of Object.entries(required)) {
    for (const name of names) {
      if (!hasToken(tokens, group, name)) problems.push(`src/theme/tokens.yaml is missing ${group} token "${name}"`);
    }
  }
  return problems;
}

function nativeActionProblems(ir, nativeDir) {
  if (!ir.screen) return [];
  const problems = [];
  const platforms = [
    { label: 'iOS', file: path.join(nativeDir, 'ios', `${ir.screen}ActionsImpl.swift`), pattern: action => new RegExp(`\\bfunc\\s+${action}\\s*\\(`) },
    { label: 'Android', file: path.join(nativeDir, 'android', `${ir.screen}ActionsImpl.kt`), pattern: action => new RegExp(`\\bfun\\s+${action}\\s*\\(`) },
  ];

  for (const platform of platforms) {
    if (!fs.existsSync(platform.file)) continue;
    const source = fs.readFileSync(platform.file, 'utf8');
    for (const action of ir.actions ?? []) {
      if (!platform.pattern(action.name).test(source)) {
        problems.push(`${platform.label} native action implementation is missing "${action.name}"`);
      }
    }
  }

  return problems;
}

function actionNavigationProblems(ir, screenNames) {
  const problems = [];
  for (const action of ir.actions ?? []) {
    if (!action.navigation) continue;
    if (action.navigation.type === 'push' && !screenNames.has(action.navigation.screen)) {
      problems.push(`action "${action.name}" navigates to unknown screen "${action.navigation.screen}"`);
    }
  }
  return problems;
}

export function semanticCheck(ir, tokens, screenNames, componentNames, componentsByName, nativeDir) {
  const errors = [];
  const stateNames = new Map((ir.state ?? []).map(s => [s.name, s]));
  const propNames = new Map((ir.props ?? []).map(p => [p.name, p]));
  const actionNames = new Set((ir.actions ?? []).map(a => a.name));

  errors.push(...duplicateNames(ir.state, 'state'));
  errors.push(...duplicateNames(ir.props, 'prop'));
  errors.push(...duplicateNames(ir.actions, 'action'));
  errors.push(...actionNavigationProblems(ir, screenNames));

  for (const state of ir.state ?? []) {
    if (state.type === 'list') {
      errors.push(...duplicateFieldNames(state.item?.fields, `state "${state.name}" item`));
    }
  }

  if (ir.layout?.contentWidth && ir.layout.contentWidth !== 'fill') {
    const token = `content${ir.layout.contentWidth.charAt(0).toUpperCase()}${ir.layout.contentWidth.slice(1)}`;
    if (!hasToken(tokens, 'size', token)) errors.push(`layout contentWidth references missing size token "${token}"`);
  }

  function checkCondition(node) {
    if (!node.visibleWhen) return;
    const conditionValue = stateNames.get(node.visibleWhen.state) ?? propNames.get(node.visibleWhen.state);
    if (!conditionValue) {
      errors.push(`${node.type} visibleWhen references undeclared state or prop "${node.visibleWhen.state}"`);
    } else if (conditionValue.type === 'list' || conditionValue.type === 'action') {
      errors.push(`${node.type} visibleWhen "${node.visibleWhen.state}" must reference scalar state or prop`);
    }
  }

  function listFieldProblem(binding, listContext, label) {
    if (!binding.startsWith('item.')) return false;
    const field = binding.slice('item.'.length);
    if (!listContext) {
      errors.push(`${label} "${binding}" can only be used inside list itemTemplate`);
      return true;
    }
    const fields = new Set((listContext.item?.fields ?? []).map(f => f.name));
    if (!fields.has(field)) errors.push(`${label} "${binding}" references unknown list item field`);
    return true;
  }

  function checkTextBinding(node, listContext) {
    if (node.type !== 'text' || !node.bind) return;
    if (listFieldProblem(node.bind, listContext, 'text bind')) return;
    const value = stateNames.get(node.bind) ?? propNames.get(node.bind);
    if (!value) errors.push(`text binds to undeclared state or prop "${node.bind}"`);
    else if (value.type === 'list' || value.type === 'action') errors.push(`text bind "${node.bind}" must reference scalar state or prop`);
  }

  function checkListRowBinding(node, listContext, key) {
    const binding = node[key];
    if (node.type !== 'listRow' || !binding) return;
    if (listFieldProblem(binding, listContext, `listRow ${key}`)) return;
    const value = stateNames.get(binding) ?? propNames.get(binding);
    if (!value) errors.push(`listRow ${key} references undeclared state or prop "${binding}"`);
    else if (value.type === 'list' || value.type === 'action') errors.push(`listRow ${key} "${binding}" must reference scalar state or prop`);
  }

  function checkActionReference(node) {
    if (node.type !== 'button' && node.type !== 'listRow') return;
    if (actionNames.has(node.action)) return;
    const prop = propNames.get(node.action);
    if (!prop) {
      errors.push(`${node.type} references undeclared action or action prop "${node.action}"`);
    } else if (prop.type !== 'action') {
      errors.push(`${node.type} action "${node.action}" must reference action prop`);
    }
  }

  function checkComponentCall(node, listContext) {
    if (node.type !== 'component') return;
    const component = componentsByName.get(node.name);
    if (!component) {
      if (node.name) errors.push(`component node references unknown component "${node.name}"`);
      return;
    }

    const expectedProps = new Map((component.props ?? []).map(prop => [prop.name, prop]));
    const actualProps = node.props ?? {};
    for (const prop of component.props ?? []) {
      if (!Object.hasOwn(actualProps, prop.name)) errors.push(`component "${node.name}" is missing prop "${prop.name}"`);
    }
    for (const propName of Object.keys(actualProps)) {
      const expected = expectedProps.get(propName);
      if (!expected) {
        errors.push(`component "${node.name}" received unknown prop "${propName}"`);
        continue;
      }
      const value = actualProps[propName];
      if (expected.type === 'action') {
        if (typeof value !== 'string') {
          errors.push(`component "${node.name}" action prop "${propName}" must be an action name`);
        } else if (!actionNames.has(value) && propNames.get(value)?.type !== 'action') {
          errors.push(`component "${node.name}" action prop "${propName}" references undeclared action or action prop "${value}"`);
        }
        continue;
      }
      if (typeof value === 'string' && listFieldProblem(value, listContext, `component "${node.name}" prop "${propName}"`)) continue;
      if (typeof value === 'string' && /^[a-z][A-Za-z0-9]*$/.test(value)) {
        const referenced = stateNames.get(value) ?? propNames.get(value);
        if (referenced && referenced.type !== expected.type) {
          errors.push(`component "${node.name}" prop "${propName}" expects ${expected.type} but "${value}" is ${referenced.type}`);
        }
      }
    }
  }

  function walk(node, listContext = null) {
    checkCondition(node);
    if (node.spacing && !hasToken(tokens, 'spacing', node.spacing))
      errors.push(`${node.type} references missing spacing token "${node.spacing}"`);
    if (node.padding && !hasToken(tokens, 'spacing', node.padding))
      errors.push(`${node.type} references missing padding token "${node.padding}"`);
    if (node.radius && !hasToken(tokens, 'radius', node.radius))
      errors.push(`${node.type} references missing radius token "${node.radius}"`);
    if (node.type === 'text' && node.color && !hasToken(tokens, 'color', node.color))
      errors.push(`text references missing color token "${node.color}"`);
    if (node.type === 'text' && node.role && !hasToken(tokens, 'typography', node.role))
      errors.push(`text references missing typography token "${node.role}"`);
    checkTextBinding(node, listContext);
    checkListRowBinding(node, listContext, 'titleBind');
    checkListRowBinding(node, listContext, 'subtitleBind');
    checkComponentCall(node, listContext);

    if (node.type === 'textField' && !stateNames.has(node.bind)) {
      errors.push(`textField binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'textField' && stateNames.get(node.bind)?.type !== 'string') {
      errors.push(`textField bind "${node.bind}" must reference string state`);
    }
    checkActionReference(node);
    let nextListContext = listContext;
    if (node.type === 'list' && node.bind && !stateNames.has(node.bind)) {
      errors.push(`list binds to undeclared state "${node.bind}"`);
    } else if (node.type === 'list' && node.bind && stateNames.get(node.bind)?.type !== 'list') {
      errors.push(`list bind "${node.bind}" must reference list state`);
    } else if (node.type === 'list' && node.bind) {
      nextListContext = stateNames.get(node.bind);
    }
    for (const child of node.children ?? []) walk(child, listContext);
    for (const child of node.itemTemplate ?? []) walk(child, nextListContext);
  }
  for (const node of ir.body) walk(node);
  errors.push(...nativeActionProblems(ir, nativeDir));
  return errors;
}

