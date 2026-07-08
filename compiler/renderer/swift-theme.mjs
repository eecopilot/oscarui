import { HEADER } from '../util.mjs';

const WEIGHT = { bold: '.bold', semibold: '.semibold', regular: '.regular' };

export function emitThemeSwift(tokens) {
  const lines = [`// ${HEADER}`, 'import SwiftUI', '', 'enum Theme {'];
  lines.push('    enum Spacing {');
  for (const [k, v] of Object.entries(tokens.spacing))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Size {');
  for (const [k, v] of Object.entries(tokens.size ?? {}))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Radius {');
  for (const [k, v] of Object.entries(tokens.radius))
    lines.push(`        static let ${k}: CGFloat = ${v}`);
  lines.push('    }');
  lines.push('    enum Colors {');
  for (const [k, v] of Object.entries(tokens.color))
    lines.push(`        static let ${k} = Color(hex: "${v}")`);
  lines.push('    }');
  lines.push('    enum Typography {');
  for (const [k, v] of Object.entries(tokens.typography))
    lines.push(`        static let ${k} = Font.system(size: ${v.size}, weight: ${WEIGHT[v.weight]})`);
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push(...`extension Color {
    init(hex: String) {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}`.split('\n'));
  lines.push('');
  return lines.join('\n');
}
