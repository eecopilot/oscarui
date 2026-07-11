# Troubleshooting

Start with validation, then run the doctor command for the failing platform:

```sh
oscarui validate
oscarui validate --json
oscarui doctor:ios
oscarui doctor:android
```

## Xcode or iOS Simulator is unavailable

- Install the full Xcode application, not only Command Line Tools.
- Select it with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- Open Xcode once to accept its license and install a Simulator runtime.
- Re-run `oscarui doctor:ios`.

If no simulator is booted, `oscarui dev:ios` selects and boots an available device automatically.

## Android SDK or adb is unavailable

- Set `ANDROID_HOME` to the Android SDK directory.
- Ensure `platform-tools`, `emulator`, and an API platform matching `compileSdk` are installed.
- Ensure Java 17 is installed.
- Re-run `oscarui doctor:android`.

## No Android Virtual Device exists

Create an AVD with Android Studio's Device Manager or `avdmanager`. The default expected name is `oscarui_api35`; override it with:

```sh
AIC_ANDROID_AVD=my_device oscarui dev:android
```

## Gradle download or dependency resolution fails

- Verify network access to Google Maven and Maven Central.
- Check `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` if a proxy is required.
- Delete `.aic/android` and run the command again; the host project is reproducible.

## Runtime Mode loads an older bundle

Use the runtime development command, which rebuilds the APK/app and synchronizes the current bundle cache:

```sh
oscarui dev:ios:runtime
oscarui dev:android:runtime
```

For an already running debug app:

```sh
oscarui build:runtime
oscarui runtime:install:ios
oscarui runtime:install:android
```

## Validation output is too noisy for automation

Use JSON diagnostics:

```sh
oscarui validate --json
```

Each diagnostic includes `file`, `path`, `code`, `message`, and `hint`.

## Generated files appear stale

Delete the generated host cache and rebuild:

```sh
rm -rf .aic/ios .aic/android
oscarui build
```

Do not patch files inside `generated/` or `.aic/`; fix the IR, schema, app config, assets, or compiler source instead.
