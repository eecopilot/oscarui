# Agent Workflow

This project is OscarUI, a prototype open-source cross-platform UI renderer/compiler. The source of truth for UI is the IR in `screens/*.ui.yaml` and `components/*.ui.yaml`; the source of truth for native app metadata is `app.config.yaml`; generated native code and host config are build output.

## Core Rules

- Do not edit files under `generated/` by hand.
- Do not create or modify SwiftUI or Jetpack Compose output directly.
- For UI changes, edit the smallest possible diff in `screens/*.ui.yaml` or `components/*.ui.yaml`.
- If a requested UI capability is not expressible by the schema, update `schema/ui-ir.schema.json` and the deterministic compiler templates before using it in IR.
- Keep design values tokenized. Use names from `theme/tokens.yaml` instead of raw spacing, radius, color, or typography values in IR.
- Keep native app metadata centralized in `app.config.yaml`; do not patch generated Info.plist, AndroidManifest.xml, Gradle app ids, versions, or permissions by hand.

## Required Loop

After changing `app.config.yaml`, any `screens/*.ui.yaml`, `components/*.ui.yaml`, `schema/*.schema.json`, `theme/tokens.yaml`, or compiler file:

1. Run `npm run validate`.
2. Fix schema or semantic errors in the source files, not in generated output.
3. Run `npm run build`.
4. Review the IR and compiler diff first; generated files should only reflect deterministic rebuild output.

## Development CLI

- Use `npm run doctor:ios` to check whether the local machine can build and launch iOS simulator apps.
- Use `npm run dry-run:ios` to generate the local iOS host skeleton and print the planned build/run commands without requiring Xcode.
- Use `npm run dev:ios` as the intended one-command iOS development entrypoint.
- Use `npm run doctor:android` to check whether the local machine can build and launch Android apps.
- Use `npm run dry-run:android` to generate the local Android host skeleton and print the planned build/run commands without requiring Android Studio.
- Use `npm run dev:android` as the intended one-command Android development entrypoint.
- The iOS CLI may call Apple tools such as `xcodebuild` and `xcrun simctl`, but agents should not require a human to open Xcode for normal build/run loops.
- The generated iOS host skeleton is owned by `compiler/ios-host.mjs`. Keep Xcode project template changes centralized there (for example the `IOS_HOST_TEMPLATE` and `emitProject` block), then regenerate `.aic/ios/`; do not patch `.aic/ios/` by hand.
- The generated Android host skeleton is owned by `compiler/android-host.mjs`. Keep Gradle/Compose project template changes centralized there, then regenerate `.aic/android/`; do not patch `.aic/android/` by hand.

## File Ownership

- `screens/*.ui.yaml`: editable UI intent source.
- `components/*.ui.yaml`: editable reusable component IR source.
- `app.config.yaml`: editable app identity, version, platform, permission, privacy, link, and orientation source.
- `schema/ui-ir.schema.json`: editable schema contract for allowed UI concepts.
- `schema/app-config.schema.json`: editable schema contract for allowed native app manifest concepts.
- `theme/tokens.yaml`: editable design token source.
- `compiler/*.mjs`: editable deterministic compiler implementation.
- `native/ios/*.swift`: editable hand-written iOS action implementations and other native code copied into the generated host.
- `native/android/*.kt`: editable hand-written Android action implementations and other native code copied into the generated host.
- `generated/ios/*.swift`: generated SwiftUI screen, theme, and app shell output; do not hand edit.
- `generated/android/*.kt`: generated output, do not hand edit.
- `.aic/ios/`: generated local iOS host project and build cache; safe to delete and regenerate.
- `.aic/android/`: generated local Android host project and build cache; safe to delete and regenerate.

## Naming And Scope

- Screen names are PascalCase and become native type names.
- Component names are PascalCase and become reusable native type names.
- State, prop, and action names are lower camelCase.
- Actions declared in IR are only call sites; platform-specific action behavior belongs outside generated files.
- Prefer extending the closed component set deliberately over adding one-off escape hatches.
