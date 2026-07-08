import { esc, indent } from '../util.mjs';
import { listItemType } from './ir-utils.mjs';

export const KT_TYPE = { string: 'String', bool: 'Boolean', int: 'Int', double: 'Double' };
export const KT_PROP_TYPE = { ...KT_TYPE, action: '() -> Unit' };

const KT_DEFAULT = { string: '""', bool: 'false', int: '0', double: '0.0' };

export function kotlinLiteral(value, type) {
  if (type === 'string') return `"${esc(value ?? '')}"`;
  if (type === 'bool') return value === true ? 'true' : 'false';
  if (type === 'double') return value === undefined ? '0.0' : String(value);
  return value === undefined ? '0' : String(value);
}

export function emitListStateTypes(ir) {
  const lines = [];
  for (const state of ir.state ?? []) {
    if (state.type !== 'list') continue;
    const fields = [
      'val id: Int',
      ...state.item.fields.map(field => `val ${field.name}: ${KT_TYPE[field.type]}`),
    ];
    lines.push(`data class ${listItemType(state)}(`);
    lines.push(...indent(fields.map((field, index) => `${field}${index < fields.length - 1 ? ',' : ''}`), 1));
    lines.push(')', '');
  }
  return lines;
}

export function emitStateDefault(state) {
  if (state.type !== 'list') {
    return state.default !== undefined
      ? kotlinLiteral(state.default, state.type)
      : KT_DEFAULT[state.type];
  }

  const itemType = listItemType(state);
  const values = state.default ?? [];
  if (!values.length) return 'emptyList()';
  const rows = values.map((item, index) => {
    const fields = state.item.fields.map(field => `${field.name} = ${kotlinLiteral(item[field.name], field.type)}`);
    return `${itemType}(id = ${index}, ${fields.join(', ')})`;
  });
  return `listOf(\n${indent(rows.map((row, index) => `${row}${index < rows.length - 1 ? ',' : ''}`), 2).join('\n')}\n    )`;
}
