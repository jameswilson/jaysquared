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

## Install on a TV

Either install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
or host a release-signed APK at a direct HTTPS URL and open it with Downloader
by AFTVnews. On Android 8 and newer, allow Downloader to install unknown apps
when prompted.
