# OscarUI

English | [简体中文](README.zh-CN.md)

OscarUI is a prototype UI compiler that turns a single UI intent file into native iOS SwiftUI and Android Jetpack Compose screens.
The name stands for Open Source Cross Apple/Android Renderer.

> **One AI. Two truly native apps: Swift for iOS, Kotlin for Android.**
>
> OscarUI has a simple goal: open one AI, describe the UI once, and build two native apps. AI edits the shared UI intent; a deterministic compiler generates verifiable Swift/SwiftUI code for iOS and Kotlin/Jetpack Compose code for Android—without turning the app into a WebView or a cross-platform runtime wrapper.

The core idea is to keep AI-driven changes inside IR files such as `src/screens/*.ui.yaml`, then let a deterministic compiler generate native code for both platforms. The same IR input should produce repeatable, verifiable native output.

## Demo

The same login-screen IR rendered as native SwiftUI on iOS and Jetpack Compose on Android:

![OscarUI login screen running on iOS and Android](docs/images/demo.png)

## Quick Start

For a clean-directory walkthrough, see [Quickstart](docs/quickstart.md).

Install and exercise the exact local npm package:

```sh
npm pack
npm install --global ./oscarui-1.0.0.tgz
oscarui init my-app
```

For repository development, install dependencies in this checkout:

```sh
npm install
```

Validate the IR:

```sh
npm run validate
```

Generate native code for both platforms:

```sh
npm run build
```

Build the optional versioned Runtime Mode bundle and both native interpreters:

```sh
npm run build:runtime
npm run runtime:parity
```

Run the lightweight test loop:

```sh
npm test
```

Generate deterministic feedback for the next AI authoring pass:

```sh
npm run author:loop
```

Build, launch, and save screenshots from both platforms:

```sh
npm run snapshots
```

Screenshots are saved under `.aic/snapshots/`.

Compare captured snapshot metadata:

```sh
npm run snapshots:diff
```

## Daily Workflow

For UI changes, edit these source files first:

- `src/screens/*.ui.yaml`: screen structure and UI intent
- `src/components/*.ui.yaml`: reusable UI component intent
- `src/app.config.yaml`: app identity, platform settings, permissions, privacy strings, links, and orientation
- `src/theme/tokens.yaml`: design tokens such as spacing, radius, color, typography, and size
- `schema/ui-ir.schema.json`: the allowed IR contract
- `compiler/*.mjs`: deterministic templates from IR to SwiftUI / Compose

Do not edit these files by hand:

- `generated/ios/*.swift`
- `generated/android/*.kt`
- `generated/runtime/`
- `.aic/ios/`
- `.aic/android/`

They are generated artifacts and may be overwritten by the next build.

Recommended change loop:

```sh
npm run validate
npm run build
npm run snapshots
```

Check local toolchains:

```sh
npm run doctor:ios
npm run doctor:android
```

Generate host projects and print command plans without launching simulators:

```sh
npm run dry-run:ios
npm run dry-run:android
```

Build, install, and launch the apps:

```sh
npm run dev:ios
npm run dev:android
```

Runtime Mode stays opt-in; Compile Mode remains the default stable path:

```sh
npm run dry-run:ios:runtime
npm run dry-run:android:runtime
npm run dev:ios:runtime
npm run dev:android:runtime
```

The portable bundle is emitted at `generated/runtime/oscarui.runtime.json`. Native runtimes verify its SHA-256 hash and compatibility range before activation, cache the current and last-known-good bundle, and can fetch an HTTPS update when enabled in `src/app.config.yaml`.

Configure route transitions globally in `src/app.config.yaml`:

```yaml
navigation:
  animation: none # none | platform
```

`none` disables push and pop transitions on both platforms. `platform` keeps the native SwiftUI and Compose transitions.

Install a freshly built bundle into an already-running debug app without rebuilding it:

```sh
npm run runtime:install:ios
npm run runtime:install:android
```

Capture Compile/Runtime screenshots, compare them per platform, and manage visual baselines:

```sh
npm run snapshots
npm run snapshots:runtime
npm run snapshots:runtime-parity
npm run snapshots:accept
npm run author:visual-review
```

Import a constrained Figma JSON export into a draft screen:

```sh
npm run figma:import -- path/to/figma.json src/screens/imported.ui.yaml
```

Validate plugin manifests:

```sh
npm run plugins:validate
```

## Documentation

- [Start from an empty directory](docs/quickstart.md)
- [Forms, navigation, lists, components, native config, and assets](docs/examples.md)
- [Xcode, Simulator, Android SDK, Gradle, and emulator troubleshooting](docs/troubleshooting.md)
- [Intentional iOS/Android and Compile/Runtime differences](docs/platform-differences.md)

## UI IR Example

The current login screen lives in `src/screens/login.ui.yaml`:

```yaml
screen: Login
title: Login

layout:
  safeArea: true
  contentPosition: top
  contentWidth: compact

state:
  - name: email
    type: string
  - name: password
    type: string

body:
  - type: column
    spacing: normal
    padding: normal
    align: center
    children:
      - type: text
        role: title
        value: Welcome back
      - type: text
        role: caption
        value: Sign in to continue
        color: textSecondary
      - type: textField
        bind: email
        placeholder: Email
        keyboard: email
      - type: textField
        bind: password
        placeholder: Password
        secure: true
      - type: button
        role: primary
        label: Sign in
        action: login
      - type: button
        role: ghost
        label: Forgot password?
        action: forgotPassword

actions:
  - name: login
    steps: [validate, call_api, save_token, navigate]
  - name: forgotPassword
    steps: [navigate]
```

IR should reference token names, such as `spacing: normal` and `contentWidth: compact`. Avoid raw numeric values in screen IR.

## Component References

Reusable components live in `src/components/*.ui.yaml`. Screens can reference them with `use`, and can combine that reference with a simple `for` loop or `if` condition:

```yaml
- use: component
  path: ../components/projectCard.ui.yaml
  for: project in projects
  title: project.name
  subtitle: project.platform
  onSelect: selectProject

- use: EmptyState
  if:
    state: isEmpty
    equals: true
```

The compiler normalizes this short form into the canonical list/component IR before generating SwiftUI and Compose output. You can also put props under a nested `props:` object when that reads better.

If the component is already known by name, `use: ProjectCard` is also valid.

## The native Directory

`src/native/` is where handwritten native action implementations live.

For example, the IR can declare:

```yaml
action: login
```

The compiler generates:

- iOS: `LoginActions`
- Android: `LoginActions`

The actual business behavior is implemented in:

- `src/native/ios/LoginActionsImpl.swift`
- `src/native/android/LoginActionsImpl.kt`

This is the right place for login logic, navigation, API calls, token storage, and third-party SDK integration. Do not handwrite screen UI in `src/native/`; screen structure is still owned by `src/screens/*.ui.yaml`.

## Project Layout

```text
oscarui/
├── src/
│   ├── screens/             # UI IR, the screen source of truth
│   ├── components/          # Reusable component IR
│   ├── app.config.yaml      # App identity, platform, permission, and link source
│   ├── theme/               # Design tokens
│   └── native/              # Handwritten native action implementations
├── schema/                  # IR schema, limits allowed UI capabilities
├── compiler/                # Deterministic compiler and CLI
├── plugins/                 # Optional deterministic pipeline extensions
├── generated/               # Generated SwiftUI / Compose code
└── .aic/                    # Local host projects, build cache, screenshots
```

## Project Progress

Phase status is tracked separately in [`ROADMAP.md`](ROADMAP.md). The README focuses on project usage and day-to-day workflow.
