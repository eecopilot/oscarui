import fs from 'node:fs';
import path from 'node:path';

export function nativeActionProblems(ir, nativeDir) {
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

export function actionNavigationProblems(ir, screenNames) {
  const problems = [];
  for (const action of ir.actions ?? []) {
    if (!action.navigation) continue;
    if (action.navigation.type === 'push' && !screenNames.has(action.navigation.screen)) {
      problems.push(`action "${action.name}" navigates to unknown screen "${action.navigation.screen}"`);
    }
  }
  return problems;
}
