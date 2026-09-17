package com.elementalidad.jaysquared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateMetadataTest {
    @Test
    fun parseReadsTrustedMetadata() {
        val update: UpdateMetadata = UpdateMetadata.parse(createJson())
        assertEquals(1, update.schemaVersion)
        assertEquals(1_000_123L, update.versionCode)
        assertEquals("v1.2.3-tv", update.versionName)
        assertEquals(4_096L, update.apkSize)
        assertEquals("a".repeat(64), update.sha256)
    }

    @Test
    fun isNewerThanRequiresHigherVersionCode() {
        val update: UpdateMetadata = UpdateMetadata.parse(createJson())
        assertTrue(update.isNewerThan(1_000_122L))
        assertFalse(update.isNewerThan(1_000_123L))
        assertFalse(update.isNewerThan(1_000_124L))
    }

    @Test
    fun parseRejectsUntrustedApkUrl() {
        assertThrows(IllegalArgumentException::class.java) {
            UpdateMetadata.parse(createJson(apkUrl = "https://example.com/jay-squared-tv.apk"))
        }
    }

    @Test
    fun parseRejectsUnsupportedSchema() {
        assertThrows(IllegalArgumentException::class.java) {
            UpdateMetadata.parse(createJson(schemaVersion = 2))
        }
    }

    @Test
    fun parseRejectsInvalidChecksum() {
        assertThrows(IllegalArgumentException::class.java) {
            UpdateMetadata.parse(createJson(sha256 = "not-a-checksum"))
        }
    }

    private fun createJson(
        schemaVersion: Int = 1,
        apkUrl: String =
            "https://github.com/jameswilson/jaysquared/releases/download/v1.2.3/jay-squared-tv.apk",
        sha256: String = "a".repeat(64),
    ): String {
        return """
            {
              "schemaVersion": $schemaVersion,
              "versionCode": 1000123,
              "versionName": "v1.2.3-tv",
              "apkUrl": "$apkUrl",
              "sha256": "$sha256",
              "apkSize": 4096
            }
        """.trimIndent()
    }
}
