import { esc, indent } from '../util.mjs';
import { listItemType } from './ir-utils.mjs';

export const SWIFT_TYPE = { string: 'String', bool: 'Bool', int: 'Int', double: 'Double' };
export const SWIFT_PROP_TYPE = { ...SWIFT_TYPE, action: '() -> Void' };

const SWIFT_DEFAULT = { string: '""', bool: 'false', int: '0', double: '0.0' };

export function swiftLiteral(value, type) {
  if (type === 'string') return `"${esc(value ?? '')}"`;
  if (type === 'bool') return value === true ? 'true' : 'false';
  if (type === 'double') return value === undefined ? '0.0' : String(value);
  return value === undefined ? '0' : String(value);
}

export function emitListStateTypes(ir) {
  const lines = [];
  for (const state of ir.state ?? []) {
    if (state.type !== 'list') continue;
    lines.push(`    struct ${listItemType(state)}: Identifiable, Hashable {`);
    lines.push('        let id: Int');
    for (const field of state.item.fields) {
      lines.push(`        let ${field.name}: ${SWIFT_TYPE[field.type]}`);
    }
    lines.push('    }', '');
  }
  return lines;
}

export function emitStateDefault(state) {
  if (state.type !== 'list') {
    return state.default !== undefined
      ? swiftLiteral(state.default, state.type)
      : SWIFT_DEFAULT[state.type];
  }

  const itemType = listItemType(state);
  const values = state.default ?? [];
  if (!values.length) return '[]';
  const rows = values.map((item, index) => {
    const fields = state.item.fields.map(field => `${field.name}: ${swiftLiteral(item[field.name], field.type)}`);
    return `${itemType}(id: ${index}, ${fields.join(', ')})`;
  });
  return `[\n${indent(rows.map((row, index) => `${row}${index < rows.length - 1 ? ',' : ''}`), 2).join('\n')}\n    ]`;
}
