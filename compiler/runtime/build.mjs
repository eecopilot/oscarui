import fs from 'node:fs';
import path from 'node:path';

import { emitRuntimeBundle } from './bundle.mjs';
import { assertRuntimeCompatible } from './validation.mjs';
import { emitRuntimeActionBridgeSwift, emitRuntimeAppSwift, emitRuntimeRendererSwift } from './ios-runtime.mjs';
import { emitRuntimeActionBridgeKotlin, emitRuntimeMainActivityKotlin, emitRuntimeRendererKotlin } from './android-runtime.mjs';

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

export function buildRuntime(root, project) {
  assertRuntimeCompatible(project.screens, project.components);
  const emitted = emitRuntimeBundle(root, project);
  const iosDir = path.join(root, 'generated/runtime/ios');
  const androidDir = path.join(root, 'generated/runtime/android');
  resetDirectory(iosDir);
  resetDirectory(androidDir);

  fs.writeFileSync(path.join(iosDir, 'RuntimeApp.swift'), emitRuntimeAppSwift(project.appConfig.app.name));
  fs.writeFileSync(path.join(iosDir, 'RuntimeRenderer.swift'), emitRuntimeRendererSwift());
  fs.writeFileSync(path.join(iosDir, 'RuntimeNativeActions.swift'), emitRuntimeActionBridgeSwift(project.screens));
  fs.writeFileSync(path.join(androidDir, 'MainActivity.kt'), emitRuntimeMainActivityKotlin());
  fs.writeFileSync(path.join(androidDir, 'RuntimeRenderer.kt'), emitRuntimeRendererKotlin());
  fs.writeFileSync(path.join(androidDir, 'RuntimeNativeActions.kt'), emitRuntimeActionBridgeKotlin(project.screens));

  return {
    ...emitted,
    iosFiles: fs.readdirSync(iosDir).sort().map(file => path.join(iosDir, file)),
    androidFiles: fs.readdirSync(androidDir).sort().map(file => path.join(androidDir, file)),
  };
}
