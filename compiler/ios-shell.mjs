import { HEADER } from './util.mjs';

export function emitAppSwift(screens, appName = 'OscarUI') {
  const entry = screens[0]?.ir;
  if (!entry) throw new Error('ios shell: at least one screen is required');

  const lines = [
    `// ${HEADER}`,
    'import SwiftUI',
    '',
    '@main',
    `struct ${appName}: App {`,
    '    var body: some Scene {',
    '        WindowGroup {',
    `            ${entry.screen}View(actions: ${entry.screen}ActionsImpl())`,
    '        }',
    '    }',
    '}',
    '',
  ];

  return lines.join('\n');
}
