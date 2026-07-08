# OscarUI Roadmap

This file tracks project phases. README files should describe the project and day-to-day usage, not duplicate phase status.

## Phase 1: MVP

- [x] IR schema + token system
- [x] SwiftUI / Compose generation
- [x] Login screen example
- [x] iOS / Android CLI host projects

## Phase 1.5: Cross-Platform Consistency

- [x] Screen-level layout contract: `safeArea`, `contentPosition`, `contentWidth`
- [x] Control visual tokens: content width, control height, border, placeholder, primary text color
- [x] Deterministic `textField` / `button` styling
- [x] Stronger semantic validation
- [x] Two-platform screenshot command

## Phase 2: Multi-Screen UI Flow

- [x] Entry screen selection
- [x] Declarative navigation actions
- [x] SwiftUI `NavigationStack` generation
- [x] Compose `NavHost` generation
- [x] Conditional rendering with `visibleWhen`
- [x] List state and item field binding
- [x] AI edit loop tooling: feed validate/build results into `.aic/ai-feedback.md`
- [x] Basic constrained Figma JSON import to draft IR
- [x] Snapshot diff report for captured platform screenshots
- [x] Plugin manifest schema and validation command

## Phase 2.5: Component System

- [x] Reusable component IR in `components/*.ui.yaml`
- [x] Component props for scalar values and action callbacks
- [x] Component call nodes inside screens and list templates
- [x] SwiftUI reusable `View` generation
- [x] Compose reusable `@Composable` generation
- [x] Semantic validation for component names, required props, unknown props, and callback mapping

## Phase 2.6: Native App Manifest

- [x] Unified native app config in `app.config.yaml`
- [x] App config schema and semantic validation
- [x] iOS Info.plist and build setting generation
- [x] Android Manifest and Gradle config generation
- [x] Typed permission declarations with iOS privacy usage checks
- [x] URL scheme, app link, orientation, version, and app id config hooks

## Phase 3: Runtime

- [ ] Runtime IR interpreter + hot update path
- [ ] AI agent visual-regression self-review
