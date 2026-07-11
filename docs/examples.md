# OscarUI examples

These snippets are designed to be copied into `src/screens/*.ui.yaml`, `src/components/*.ui.yaml`, or `src/app.config.yaml`.

## Form state

```yaml
state:
  - name: email
    type: string

body:
  - type: textField
    bind: email
    placeholder: Email
    keyboard: email
  - type: button
    label: Continue
    action: submit

actions:
  - name: submit
    steps: [validate, submit]
```

## Native navigation

```yaml
actions:
  - name: openDashboard
    steps: [navigate]
    navigation:
      type: push
      screen: Dashboard
```

Configure platform transitions in `src/app.config.yaml`:

```yaml
navigation:
  animation: none # none | platform
```

## Lists and item binding

```yaml
state:
  - name: projects
    type: list
    item:
      fields:
        - name: title
          type: string
    default:
      - title: iOS app
      - title: Android app

body:
  - type: list
    bind: projects
    itemTemplate:
      - type: listRow
        titleBind: item.title
        action: selectProject
```

## Reusable components

Component definition:

```yaml
component: ProjectRow

props:
  - name: title
    type: string
  - name: onSelect
    type: action

body:
  - type: listRow
    titleBind: title
    action: onSelect
```

Component use inside a list:

```yaml
- use: ProjectRow
  for: project in projects
  title: project.title
  onSelect: selectProject
```

## Conditional rendering

```yaml
- type: text
  value: No projects yet
  visibleWhen:
    state: isEmpty
    equals: true
```

## Native application configuration

```yaml
app:
  name: ExampleApp
  displayName: Example App
  bundleId: dev.example.ExampleApp
  applicationId: dev.example.app
  versionName: "1.2.0"
  versionCode: 12

orientation:
  phone: portrait
  tablet: all

assets:
  appIcon: src/assets/app-icon.png
  launchImage: src/assets/launch.png
```

Both asset paths must point to PNG files inside `src/assets/`; the app icon must be 1024x1024. OscarUI copies them into the generated Xcode asset catalog and Android resources.

## Hand-written native actions

An action declared in IR becomes a Swift and Kotlin interface method. Implement platform behavior outside generated output:

```swift
// src/native/ios/LoginActionsImpl.swift
final class LoginActionsImpl: LoginActions {
    func login() {
        // Native Swift implementation
    }
}
```

```kotlin
// src/native/android/LoginActionsImpl.kt
class LoginActionsImpl : LoginActions {
    override fun login() {
        // Native Kotlin implementation
    }
}
```
