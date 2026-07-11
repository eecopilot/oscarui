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

- [x] Reusable component IR in `src/components/*.ui.yaml`
- [x] Component props for scalar values and action callbacks
- [x] Component call nodes inside screens and list templates
- [x] SwiftUI reusable `View` generation
- [x] Compose reusable `@Composable` generation
- [x] Semantic validation for component names, required props, unknown props, and callback mapping

## Phase 2.6: Native App Manifest

- [x] Unified native app config in `src/app.config.yaml`
- [x] App config schema and semantic validation
- [x] iOS Info.plist and build setting generation
- [x] Android Manifest and Gradle config generation
- [x] Typed permission declarations with iOS privacy usage checks
- [x] URL scheme, app link, orientation, version, and app id config hooks

## Phase 3: Runtime

- [x] Runtime IR package format
  - [x] Define a versioned runtime bundle manifest
  - [x] Include screens, components, tokens, app config, and metadata in one portable package
  - [x] Add deterministic bundle hashing for cache keys and update checks
  - [x] Add runtime compatibility fields for schema/compiler versions
- [x] Runtime IR validation path
  - [x] Reuse schema validation before packaging runtime IR
  - [x] Add runtime-specific semantic checks for unsupported nodes, props, actions, and tokens
  - [x] Emit clear diagnostics for runtime-incompatible UI files
- [x] iOS runtime renderer
  - [x] Load bundled runtime IR from app resources
  - [x] Interpret core layout nodes: `column`, `row`, `spacer`
  - [x] Interpret display/control nodes: `text`, `image`, `button`, `textField`
  - [x] Interpret data nodes: `list`, `listRow`, `component`
  - [x] Support `visibleWhen`, state defaults, list item binding, and component props
  - [x] Bridge declarative actions to native action implementations
  - [x] Bridge declarative navigation to the runtime router
- [x] Android runtime renderer
  - [x] Load bundled runtime IR from app assets
  - [x] Interpret core layout nodes: `column`, `row`, `spacer`
  - [x] Interpret display/control nodes: `text`, `image`, `button`, `textField`
  - [x] Interpret data nodes: `list`, `listRow`, `component`
  - [x] Support `visibleWhen`, state defaults, list item binding, and component props
  - [x] Bridge declarative actions to native action implementations
  - [x] Bridge declarative navigation to the runtime router
- [x] Hot update path
  - [x] Add local runtime bundle cache
  - [x] Add remote bundle fetch contract
  - [x] Verify bundle hash and compatibility before activation
  - [x] Fall back to the last known good bundle when activation fails
  - [x] Expose a dev-only command to install a runtime bundle into simulator/emulator
- [x] Runtime mode CLI
  - [x] Add `npm run build:runtime` to emit runtime bundles
  - [x] Add `npm run dev:ios:runtime`
  - [x] Add `npm run dev:android:runtime`
  - [x] Keep compile mode as the default stable path
- [x] Runtime parity checks
  - [x] Compare compile-mode and runtime-mode screenshots for the same IR
  - [x] Track known acceptable visual differences per platform
  - [x] Add runtime smoke coverage for navigation, forms, lists, components, conditional rendering, and core node types
- [x] AI agent visual-regression self-review
  - [x] Capture fresh iOS and Android screenshots after AI-authored UI changes
  - [x] Compare screenshots against the last accepted baseline
  - [x] Generate a concise visual diff report with likely causes
  - [x] Feed visual diff findings into `.aic/ai-feedback.md`
  - [x] Gate high-risk UI changes on screenshot review before commit

## Phase 4: Production Hardening & Developer Experience

- [x] Installable CLI package
  - [x] Add a publishable `oscarui` npm binary with explicit package files and Node.js version requirements
  - [x] Support `oscarui init` from an empty directory without copying local build artifacts
  - [x] Add `--version`, `--help`, and command discovery output
  - [x] Verify the packed tarball by installing and running it in a temporary clean project
  - [x] Keep local `.aic/` build artifacts outside source control
- [x] CI and release automation
  - [x] Add GitHub Actions for validation, plugin validation, compile/runtime builds, and deterministic tests
  - [x] Add non-interactive platform environment reports that are safe on hosted CI runners
  - [x] Add a release workflow that validates a version tag and creates release notes from `CHANGELOG.md`
  - [x] Add `npm pack` and publish dry-run gates without requiring registry credentials
- [x] Renderer stability and parity
  - [x] Add committed golden output for SwiftUI, Compose, and Runtime Mode
  - [x] Add a deterministic golden verification command with readable file diffs
  - [x] Add parity fixtures covering navigation, lists, forms, components, conditions, and native app config
  - [x] Document intentional compile/runtime and iOS/Android differences
- [x] Native host customization
  - [x] Support project display name, bundle id, app id, version, and orientation overrides end to end
  - [x] Support app icons and launch assets in generated host projects
  - [x] Preserve hand-written Swift and Kotlin native action implementations outside generated output
  - [x] Add reproducibility checks proving generated host skeletons are safe to delete and rebuild
- [x] Error reporting and diagnostics
  - [x] Improve validation messages with file paths and node context
  - [x] Add actionable hints for common schema, token, component, and native action errors
  - [x] Make dev command failures easier to recover from
  - [x] Add stable JSON diagnostic output for CI and AI tooling
- [x] Documentation and examples
  - [x] Add a quickstart from empty repo to running iOS and Android apps
  - [x] Add copyable examples for forms, navigation, lists, components, and native config
  - [x] Add troubleshooting docs for Xcode, simulators, Android SDK, Gradle, and emulators
  - [x] Keep README focused on daily usage and link deeper docs out

## Phase 5: Component Catalog & AI Authoring Kit

- [ ] Standard component catalog
  - [ ] Define catalog structure under `src/components/`
  - [ ] Add common app components: card, section, form row, toolbar, empty state, loading state, error state
  - [ ] Keep catalog components tokenized and schema-valid
  - [ ] Provide example screens that compose catalog components
- [ ] Component reference conventions
  - [ ] Document canonical `type: component` usage
  - [ ] Document file-based component reference usage such as `use: component`
  - [ ] Validate component path resolution and duplicate component names
  - [ ] Prefer short screen files that compose reusable components
- [ ] Component props contract
  - [ ] Document scalar props and action callback props
  - [ ] Validate required props, unknown props, and prop type mismatches
  - [ ] Document list item bindings such as `item.title`
  - [ ] Add examples for action props inside list templates
- [ ] AI authoring reference
  - [ ] Add `docs/ui-yaml-reference.md` for model-readable DSL rules
  - [ ] Add `docs/ai-authoring-guide.md` with preferred layout and component patterns
  - [ ] Include allowed nodes, fields, token names, and component catalog summaries
  - [ ] Include bad/good examples for long YAML vs component composition
- [ ] Component catalog tooling
  - [ ] Add a command to generate component documentation from `src/components/*.ui.yaml`
  - [ ] Add catalog validation to catch undocumented or unused props
  - [ ] Add snapshots for catalog components where useful
  - [ ] Keep generated docs deterministic for review
