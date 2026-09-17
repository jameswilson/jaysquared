# Jay Squared for Android TV

This project packages the generated `jay-squared.html` game in a fullscreen,
offline Android TV app. The WebView loads only APK-bundled content through
`WebViewAssetLoader`; the manifest deliberately requests no internet permission.

## Build a test APK

Install JDK 17 and the Android SDK, then run:

```sh
../build.sh
./gradlew lintDebug testDebugUnitTest assembleDebug
```

The installable test APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is suitable for device testing. Publicly hosted builds must be
release-signed with a preserved private signing key so future versions can
update the installed app.

## Publish a release APK

Publishing a GitHub Release runs `.github/workflows/release-assets.yml`. The
workflow builds an unsigned release APK without access to signing secrets, then
signs it in a separate step using these repository Actions secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`

The signing key alias is `jay-squared-release`. Keep an independent, secure
backup of the PKCS12 keystore and its password; Android updates must use the
same signing key for the lifetime of the app. The workflow also pins the
certificate fingerprint and refuses to publish an APK signed by another key.

Each published release includes `jay-squared-tv.apk`. Because this repository
is public, the latest APK has a stable unauthenticated URL:

```text
https://github.com/jameswilson/jaysquared/releases/latest/download/jay-squared-tv.apk
```

## Install on a TV

Either install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
or open the release URL above with Downloader by AFTVnews. On Android 8 and
newer, allow Downloader to install unknown apps when prompted.
