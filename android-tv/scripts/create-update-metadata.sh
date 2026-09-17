#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "usage: $0 VERSION_CODE VERSION_NAME APK_URL APK_PATH OUTPUT_PATH" >&2
  exit 2
fi

version_code="$1"
version_name="$2"
apk_url="$3"
apk_path="$4"
output_path="$5"

if [[ ! "$version_code" =~ ^[1-9][0-9]*$ ]]; then
  echo "version code must be a positive integer" >&2
  exit 2
fi
if [[ -z "$version_name" ]]; then
  echo "version name must not be empty" >&2
  exit 2
fi
case "$apk_url" in
  https://github.com/jameswilson/jaysquared/releases/download/*/jay-squared-tv.apk) ;;
  *)
    echo "APK URL must point to a tagged Jay Squared GitHub release" >&2
    exit 2
    ;;
esac
if [[ ! -s "$apk_path" ]]; then
  echo "APK does not exist or is empty: $apk_path" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to create update metadata" >&2
  exit 2
fi

if command -v sha256sum >/dev/null 2>&1; then
  apk_sha256="$(sha256sum "$apk_path" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  apk_sha256="$(shasum -a 256 "$apk_path" | awk '{print $1}')"
else
  echo "sha256sum or shasum is required to create update metadata" >&2
  exit 2
fi

apk_size="$(wc -c < "$apk_path" | tr -d '[:space:]')"
output_directory="$(dirname "$output_path")"
if [[ ! -d "$output_directory" ]]; then
  echo "output directory does not exist: $output_directory" >&2
  exit 2
fi

temporary_path="$(mktemp "${output_path}.tmp.XXXXXX")"
cleanup() {
  rm -f "$temporary_path"
}
trap cleanup EXIT

jq --null-input \
  --argjson schemaVersion 1 \
  --argjson versionCode "$version_code" \
  --arg versionName "$version_name" \
  --arg apkUrl "$apk_url" \
  --arg sha256 "$apk_sha256" \
  --argjson apkSize "$apk_size" \
  '{
    schemaVersion: $schemaVersion,
    versionCode: $versionCode,
    versionName: $versionName,
    apkUrl: $apkUrl,
    sha256: $sha256,
    apkSize: $apkSize
  }' > "$temporary_path"

mv "$temporary_path" "$output_path"
trap - EXIT
