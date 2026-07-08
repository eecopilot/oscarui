import { camel, HEADER } from './util.mjs';

export function emitAppSwift(screens, appName = 'OscarUI') {
  const entry = screens.find(({ ir }) => ir.entry)?.ir ?? screens[0]?.ir;
  if (!entry) throw new Error('ios shell: at least one screen is required');
  const routes = screens.map(({ ir }) => ir.screen);

  const lines = [
    `// ${HEADER}`,
    'import SwiftUI',
    '',
    'enum OscarRoute: Hashable {',
    ...routes.map(screen => `    case ${camel(screen)}`),
    '}',
    '',
    '@MainActor',
    'final class OscarRouter: ObservableObject {',
    '    @Published var path: [OscarRoute] = []',
    '',
    '    func push(_ route: OscarRoute) {',
    '        path.append(route)',
    '    }',
    '',
    '    func pop() {',
    '        if !path.isEmpty {',
    '            path.removeLast()',
    '        }',
    '    }',
    '}',
    '',
    '@main',
    `struct ${appName}: App {`,
    '    @StateObject private var router = OscarRouter()',
    '',
    '    var body: some Scene {',
    '        WindowGroup {',
    '            NavigationStack(path: $router.path) {',
    `                ${entry.screen}View(actions: ${entry.screen}ActionsImpl(), router: router)`,
    '                    .navigationDestination(for: OscarRoute.self) { route in',
    '                        switch route {',
    ...routes.map(screen => `                        case .${camel(screen)}:\n                            ${screen}View(actions: ${screen}ActionsImpl(), router: router)`).flatMap(value => value.split('\n')),
    '                        }',
    '                    }',
    '            }',
    '        }',
    '    }',
    '}',
    '',
  ];

  return lines.join('\n');
}
