import fs from 'node:fs';
import path from 'node:path';
import { esc } from './util.mjs';

function writeIfMissing(file, contents) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

function emitIosActions(ir) {
  const lines = [
    '// Native action implementation. This file is scaffolded once and is safe to edit.',
    'import Foundation',
    '',
    `final class ${ir.screen}ActionsImpl: ${ir.screen}Actions {`,
  ];

  for (const action of ir.actions ?? []) {
    lines.push(`    func ${action.name}() {`);
    lines.push(`        print("${esc(ir.screen)}.${esc(action.name)}")`);
    lines.push('    }');
  }

  lines.push('}', '');
  return lines.join('\n');
}

function emitAndroidActions(ir) {
  const lines = [
    '// Native action implementation. This file is scaffolded once and is safe to edit.',
    'package app.generated',
    '',
    'import android.util.Log',
    '',
    `class ${ir.screen}ActionsImpl : ${ir.screen}Actions {`,
  ];

  for (const action of ir.actions ?? []) {
    lines.push(`    override fun ${action.name}() {`);
    lines.push(`        Log.d("OscarUI", "${esc(ir.screen)}.${esc(action.name)}")`);
    lines.push('    }');
  }

  lines.push('}', '');
  return lines.join('\n');
}

export function ensureNativeActionStubs(root, screens) {
  const created = [];

  for (const { ir } of screens) {
    const iosFile = path.join(root, 'native/ios', `${ir.screen}ActionsImpl.swift`);
    const androidFile = path.join(root, 'native/android', `${ir.screen}ActionsImpl.kt`);

    if (writeIfMissing(iosFile, emitIosActions(ir))) {
      created.push(path.relative(root, iosFile));
    }
    if (writeIfMissing(androidFile, emitAndroidActions(ir))) {
      created.push(path.relative(root, androidFile));
    }
  }

  return created;
}
