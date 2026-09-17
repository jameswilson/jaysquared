# Jay Squared for Android TV

This project packages the generated `jay-squared.html` game in a fullscreen,
offline Android TV app. The WebView loads only APK-bundled content through
`WebViewAssetLoader`. A native update checker can contact GitHub at launch, but
the bundled game remains playable without a connection and cannot load remote
web content.

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

Each published release includes `jay-squared-tv.apk` and `update.json`. The
metadata records the APK version code, tag-specific URL, size, and SHA-256 hash.
Because this repository is public, both latest-release assets have stable
unauthenticated URLs:

```text
https://github.com/jameswilson/jaysquared/releases/latest/download/jay-squared-tv.apk
https://github.com/jameswilson/jaysquared/releases/latest/download/update.json
```

## Automatic update checks

Release builds check `update.json` in the background at startup. If a newer
version code is available, the app offers **Update now** and **Later**. Choosing
the update downloads the APK, verifies its size, SHA-256 hash, package name,
version code, and signing certificate, then hands it to Android's package
installer. Debug builds skip the network check.

On Android 8 and newer, allow Jay Squared to install unknown apps when the app
opens that system setting for the first update. Android may still require an
installation confirmation depending on the TV and OS version. The first release
that contains this updater must itself be installed manually; later releases
can then be discovered by the app.

## Install on a TV

Either install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
or open the release URL above with Downloader by AFTVnews. On Android 8 and
newer, allow Downloader to install unknown apps when prompted.
