# Intentional platform differences

OscarUI generates native Swift/SwiftUI and Kotlin/Jetpack Compose applications. It aligns layout intent and design tokens, but does not force both platforms to use identical operating-system behavior.

## iOS and Android

- Text rasterization, font metrics, cursor rendering, and keyboard behavior come from each native platform.
- Accessibility services use native SwiftUI and Compose semantics.
- Remote images use SwiftUI `AsyncImage` on iOS and Coil on Android, so loading placeholders and completion frames can differ.
- With `navigation.animation: platform`, each platform retains its native navigation transition. Use `none` when deterministic no-animation routing is required.
- Back navigation uses an iOS navigation bar affordance and Android's system/back affordance according to platform convention.

## Compile Mode and Runtime Mode

- Compile Mode generates screen-specific Swift and Kotlin source and remains the default stable path.
- Runtime Mode interprets a signed, versioned JSON bundle with generic native renderers.
- Both modes use the same normalized IR and tokens. Screenshot parity is checked per platform.
- A small iOS pixel difference can occur because SwiftUI evaluates generic runtime view composition differently; accepted differences must be recorded and reviewed rather than silently ignored.

## What is not an intentional difference

Missing controls, different text, incorrect spacing tokens, broken navigation, stale Runtime bundles, canvas-size changes, or high pixel-diff ratios are defects. Run:

```sh
npm run snapshots
npm run snapshots:runtime
npm run snapshots:runtime-parity
npm run visual:review
```
