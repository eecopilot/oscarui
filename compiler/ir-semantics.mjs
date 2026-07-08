import { actionNavigationProblems, nativeActionProblems } from './validation/actions.mjs';
import { duplicateFieldNames, duplicateNames } from './validation/names.mjs';
import { nodeSemanticProblems } from './validation/nodes.mjs';
import { hasToken, themeProblems } from './validation/tokens.mjs';

export { themeProblems };

export function semanticCheck(ir, tokens, screenNames, componentNames, componentsByName, nativeDir) {
  const errors = [];

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

  errors.push(...nodeSemanticProblems(ir, tokens, componentsByName));
  errors.push(...nativeActionProblems(ir, nativeDir));
  return errors;
}
