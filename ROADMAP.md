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

- [ ] Runtime IR package format
  - [ ] Define a versioned runtime bundle manifest
  - [ ] Include screens, components, tokens, app config, and metadata in one portable package
  - [ ] Add deterministic bundle hashing for cache keys and update checks
  - [ ] Add runtime compatibility fields for schema/compiler versions
- [ ] Runtime IR validation path
  - [ ] Reuse schema validation before packaging runtime IR
  - [ ] Add runtime-specific semantic checks for unsupported nodes, props, actions, and tokens
  - [ ] Emit clear diagnostics for runtime-incompatible UI files
- [ ] iOS runtime renderer
  - [ ] Load bundled runtime IR from app resources
  - [ ] Interpret core layout nodes: `column`, `row`, `spacer`
  - [ ] Interpret display/control nodes: `text`, `image`, `button`, `textField`
  - [ ] Interpret data nodes: `list`, `listRow`, `component`
  - [ ] Support `visibleWhen`, state defaults, list item binding, and component props
  - [ ] Bridge declarative actions to native action implementations
  - [ ] Bridge declarative navigation to the runtime router
- [ ] Android runtime renderer
  - [ ] Load bundled runtime IR from app assets
  - [ ] Interpret core layout nodes: `column`, `row`, `spacer`
  - [ ] Interpret display/control nodes: `text`, `image`, `button`, `textField`
  - [ ] Interpret data nodes: `list`, `listRow`, `component`
  - [ ] Support `visibleWhen`, state defaults, list item binding, and component props
  - [ ] Bridge declarative actions to native action implementations
  - [ ] Bridge declarative navigation to the runtime router
- [ ] Hot update path
  - [ ] Add local runtime bundle cache
  - [ ] Add remote bundle fetch contract
  - [ ] Verify bundle hash and compatibility before activation
  - [ ] Fall back to the last known good bundle when activation fails
  - [ ] Expose a dev-only command to install a runtime bundle into simulator/emulator
- [ ] Runtime mode CLI
  - [ ] Add `npm run build:runtime` to emit runtime bundles
  - [ ] Add `npm run dev:ios:runtime`
  - [ ] Add `npm run dev:android:runtime`
  - [ ] Keep compile mode as the default stable path
- [ ] Runtime parity checks
  - [ ] Compare compile-mode and runtime-mode screenshots for the same IR
  - [ ] Track known acceptable visual differences per platform
  - [ ] Add runtime smoke screens for navigation, forms, lists, components, and conditional rendering
- [ ] AI agent visual-regression self-review
  - [ ] Capture fresh iOS and Android screenshots after AI-authored UI changes
  - [ ] Compare screenshots against the last accepted baseline
  - [ ] Generate a concise visual diff report with likely causes
  - [ ] Feed visual diff findings into `.aic/ai-feedback.md`
  - [ ] Gate high-risk UI changes on screenshot review before commit

## Phase 4: Production Hardening & Developer Experience

- [ ] CLI packaging and distribution
  - [ ] Publish a usable npm CLI entrypoint
  - [ ] Support project initialization from a clean directory
  - [ ] Add version, help, and command discovery output
  - [ ] Keep local `.aic/` build artifacts outside source control
- [ ] CI and release workflow
  - [ ] Add GitHub Actions for validate, plugin validation, and build
  - [ ] Add platform doctor checks that can run safely in CI where possible
  - [ ] Add release tagging and changelog generation
  - [ ] Add npm publish dry-run checks
- [ ] Renderer stability and parity
  - [ ] Expand golden generated-code fixtures for SwiftUI and Compose
  - [ ] Track renderer output changes with readable diffs
  - [ ] Add parity smoke tests for navigation, lists, forms, components, and app config
  - [ ] Document intentional platform differences
- [ ] Native host customization
  - [ ] Support project display name, bundle id, app id, version, and orientation overrides end to end
  - [ ] Support app icons and launch assets in generated host projects
  - [ ] Add clear extension points for hand-written native action implementations
  - [ ] Keep generated host skeletons reproducible and safe to delete
- [ ] Error reporting and diagnostics
  - [ ] Improve validation messages with file paths and node context
  - [ ] Add actionable hints for common schema, token, component, and native action errors
  - [ ] Make dev command failures easier to recover from
  - [ ] Add structured diagnostic output for AI tooling
- [ ] Documentation and examples
  - [ ] Add a quickstart from empty repo to running iOS and Android apps
  - [ ] Add examples for forms, navigation, lists, components, and native config
  - [ ] Add troubleshooting docs for Xcode, simulators, Android SDK, Gradle, and emulators
  - [ ] Keep README focused on daily usage and link deeper docs out

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
