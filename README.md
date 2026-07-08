# OscarUI

English | [简体中文](README.zh-CN.md)

OscarUI is a prototype UI compiler that turns a single UI intent file into native iOS SwiftUI and Android Jetpack Compose screens.
The name stands for Open Source Cross Apple/Android Renderer.

The core idea is to keep AI-driven changes inside IR files such as `screens/*.ui.yaml`, then let a deterministic compiler generate native code for both platforms. The same IR input should produce repeatable, verifiable native output.

## Quick Start

Install dependencies:

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

- `screens/*.ui.yaml`: screen structure and UI intent
- `components/*.ui.yaml`: reusable UI component intent
- `theme/tokens.yaml`: design tokens such as spacing, radius, color, typography, and size
- `schema/ui-ir.schema.json`: the allowed IR contract
- `compiler/*.mjs`: deterministic templates from IR to SwiftUI / Compose

Do not edit these files by hand:

- `generated/ios/*.swift`
- `generated/android/*.kt`
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

Import a constrained Figma JSON export into a draft screen:

```sh
npm run figma:import -- path/to/figma.json screens/imported.ui.yaml
```

Validate plugin manifests:

```sh
npm run plugins:validate
```

## UI IR Example

The current login screen lives in `screens/login.ui.yaml`:

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

## The native Directory

`native/` is where handwritten native action implementations live.

For example, the IR can declare:

```yaml
action: login
```

The compiler generates:

- iOS: `LoginActions`
- Android: `LoginActions`

The actual business behavior is implemented in:

- `native/ios/LoginActionsImpl.swift`
- `native/android/LoginActionsImpl.kt`

This is the right place for login logic, navigation, API calls, token storage, and third-party SDK integration. Do not handwrite screen UI in `native/`; screen structure is still owned by `screens/*.ui.yaml`.

## Project Layout

```text
oscarui/
├── screens/                 # UI IR, the screen source of truth
├── components/              # Reusable component IR
├── schema/                  # IR schema, limits allowed UI capabilities
├── theme/                   # Design tokens
├── compiler/                # Deterministic compiler and CLI
├── native/                  # Handwritten native action implementations
├── plugins/                 # Optional deterministic pipeline extensions
├── generated/               # Generated SwiftUI / Compose code
└── .aic/                    # Local host projects, build cache, screenshots
```

## Project Progress

Phase status is tracked separately in [`ROADMAP.md`](ROADMAP.md). The README focuses on project usage and day-to-day workflow.
