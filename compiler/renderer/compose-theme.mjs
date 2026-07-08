import { HEADER } from '../util.mjs';

const WEIGHT = { bold: 'FontWeight.Bold', semibold: 'FontWeight.SemiBold', regular: 'FontWeight.Normal' };

export function emitThemeKotlin(tokens) {
  const lines = [
    `// ${HEADER}`,
    'package app.generated',
    '',
    'import androidx.compose.ui.graphics.Color',
    'import androidx.compose.ui.text.TextStyle',
    'import androidx.compose.ui.text.font.FontWeight',
    'import androidx.compose.ui.unit.dp',
    'import androidx.compose.ui.unit.sp',
    '',
    'object Theme {',
    '    object Spacing {',
  ];
  for (const [k, v] of Object.entries(tokens.spacing))
    lines.push(`        val ${k} = ${v}.dp`);
  lines.push('    }');
  lines.push('    object Size {');
  for (const [k, v] of Object.entries(tokens.size ?? {}))
    lines.push(`        val ${k} = ${v}.dp`);
  lines.push('    }');
  lines.push('    object Radius {');
  for (const [k, v] of Object.entries(tokens.radius))
    lines.push(`        val ${k} = ${v}.dp`);
  lines.push('    }');
  lines.push('    object Colors {');
  for (const [k, v] of Object.entries(tokens.color))
    lines.push(`        val ${k} = Color(0xFF${v.slice(1)})`);
  lines.push('    }');
  lines.push('    object Typography {');
  for (const [k, v] of Object.entries(tokens.typography))
    lines.push(`        val ${k} = TextStyle(fontSize = ${v.size}.sp, fontWeight = ${WEIGHT[v.weight]})`);
  lines.push('    }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
