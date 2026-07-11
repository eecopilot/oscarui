function classify(message) {
  if (/must have required property|is missing prop/.test(message)) return ['missing_required_value', 'Add the required field or component prop shown in the message.'];
  if (/must NOT have additional properties|unknown prop/.test(message)) return ['unknown_field', 'Remove the unsupported field or check the UI IR reference for the allowed shape.'];
  if (/missing .* token|references missing/.test(message)) return ['missing_token', 'Use a token declared in src/theme/tokens.yaml or add the token there first.'];
  if (/undeclared|unknown screen|unknown component|unknown list item field/.test(message)) return ['unknown_reference', 'Declare the referenced state, action, screen, component, or list field before using it.'];
  if (/native action implementation is missing/.test(message)) return ['missing_native_action', 'Add the missing method to the hand-written file under src/native/ios or src/native/android.'];
  if (/duplicate/.test(message)) return ['duplicate_name', 'Rename one declaration so names remain unique within the project.'];
  if (/requires privacy\./.test(message)) return ['missing_privacy_usage', 'Add a user-facing privacy usage description in src/app.config.yaml.'];
  if (/file does not exist/.test(message)) return ['missing_asset', 'Correct the asset path or add the PNG file under src/assets/.'];
  if (/assets\..*must be/.test(message)) return ['invalid_asset', 'Use a valid PNG under src/assets/; app icons must be exactly 1024x1024.'];
  return ['validation_error', 'Check the referenced schema or source declaration and correct the value at this path.'];
}

export function createDiagnostic(file, problem, explicitPath = '') {
  const match = String(problem).match(/^((?:\/[^:]+)|(?:(?:body|state|props|actions|layout)(?:\[[0-9]+\]|\.[A-Za-z0-9]+)*))\s*:\s*(.+)$/);
  const path = explicitPath || match?.[1] || '';
  const message = match?.[2] || String(problem);
  const [code, hint] = classify(message);
  return { severity: 'error', code, file, path, message, hint };
}

export function printProblemReport(file, problems) {
  console.error(`✗ ${file}`);
  for (const problem of problems) {
    const diagnostic = createDiagnostic(file, problem);
    const location = diagnostic.path ? `${diagnostic.path}: ` : '';
    console.error(`    ${location}${diagnostic.message}`);
    console.error(`    Hint: ${diagnostic.hint}`);
  }
}

export function recoveryHint(message) {
  if (/Android SDK not found|adb not found|emulator command not found/.test(message)) {
    return 'Run `oscarui doctor:android` and set ANDROID_HOME before retrying.';
  }
  if (/Xcode|xcodebuild|simulator/i.test(message)) {
    return 'Run `oscarui doctor:ios` and verify Xcode plus an iOS Simulator runtime are installed.';
  }
  if (/bundle not found/.test(message)) return 'Run `oscarui build:runtime` before installing the Runtime bundle.';
  if (/no generated/.test(message)) return 'Run `oscarui build` before generating or launching a native host.';
  return 'Run `oscarui validate` first; use `oscarui validate --json` for structured diagnostics.';
}
