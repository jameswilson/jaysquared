package com.elementalidad.jaysquared

import org.json.JSONException
import org.json.JSONObject
import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

internal data class UpdateMetadata(
    val schemaVersion: Int,
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val apkSize: Long,
) {
    init {
        require(schemaVersion == CURRENT_SCHEMA_VERSION) { "Unsupported update metadata schema" }
        require(versionCode > 0L) { "Update version code must be positive" }
        require(versionName.isNotBlank()) { "Update version name must not be blank" }
        require(isTrustedApkUrl(apkUrl)) { "Update APK URL is not trusted" }
        require(SHA256_PATTERN.matches(sha256)) { "Update SHA-256 is invalid" }
        require(apkSize in 1L..MAX_APK_SIZE_BYTES) { "Update APK size is invalid" }
    }

    fun isNewerThan(installedVersionCode: Long): Boolean {
        return versionCode > installedVersionCode
    }

    companion object {
        const val CURRENT_SCHEMA_VERSION: Int = 1
        const val MAX_APK_SIZE_BYTES: Long = 100L * 1024L * 1024L
        private const val TRUSTED_HOST: String = "github.com"
        private val APK_PATH_PATTERN: Regex =
            Regex("^/jameswilson/jaysquared/releases/download/.+/jay-squared-tv\\.apk$")
        private val SHA256_PATTERN: Regex = Regex("^[0-9a-f]{64}$")

        fun parse(jsonText: String): UpdateMetadata {
            try {
                val json: JSONObject = JSONObject(jsonText)
                return UpdateMetadata(
                    schemaVersion = json.getInt("schemaVersion"),
                    versionCode = json.getLong("versionCode"),
                    versionName = json.getString("versionName"),
                    apkUrl = json.getString("apkUrl"),
                    sha256 = json.getString("sha256").lowercase(Locale.ROOT),
                    apkSize = json.getLong("apkSize"),
                )
            } catch (exception: JSONException) {
                throw IllegalArgumentException("Invalid update metadata", exception)
            }
        }

        private fun isTrustedApkUrl(value: String): Boolean {
            val uri: URI = try {
                URI(value)
            } catch (_: URISyntaxException) {
                return false
            }
            return uri.scheme == "https" &&
                uri.host.equals(TRUSTED_HOST, ignoreCase = true) &&
                uri.port == -1 &&
                uri.query == null &&
                uri.fragment == null &&
                APK_PATH_PATTERN.matches(uri.path.orEmpty())
        }
    }
}
