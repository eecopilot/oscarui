# Quickstart

OscarUI uses one shared UI intent to generate a native Swift/SwiftUI iOS app and a native Kotlin/Jetpack Compose Android app.

## Prerequisites

- Node.js 20 or newer
- For iOS: macOS, full Xcode, and an installed iOS Simulator runtime
- For Android: Android SDK, a Java 17 runtime, and at least one Android Virtual Device

## Start from an empty directory

After installing the OscarUI npm package, initialize a project:

```sh
oscarui init my-app
cd my-app
npm install
npm run validate
npm run build
```

When developing OscarUI itself, test the exact package tarball without publishing it:

```sh
git clone https://github.com/eecopilot/oscarui.git
cd oscarui
npm ci
npm run pack:check
```

`pack:check` packs the CLI, installs it into a temporary clean environment, initializes a second project, then validates, builds, and tests that project.

## Run the native apps

Check the platform toolchains first:

```sh
npm run doctor:ios
npm run doctor:android
```

Then build, install, and launch either native app:

```sh
npm run dev:ios
npm run dev:android
```

You do not need to open Xcode or Android Studio for the normal development loop.

## Edit the application

- `src/screens/*.ui.yaml`: screens and state
- `src/components/*.ui.yaml`: reusable components
- `src/theme/tokens.yaml`: visual tokens
- `src/app.config.yaml`: app identity, native metadata, permissions, links, assets, and platform settings
- `src/native/ios/*.swift`: hand-written iOS actions
- `src/native/android/*.kt`: hand-written Android actions

After each source change:

```sh
npm run validate
npm run build
npm test
```

Do not edit `generated/` or `.aic/` by hand. Both directories are reproducible build output.
