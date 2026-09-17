package com.elementalidad.jaysquared

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets
import java.security.DigestInputStream
import java.security.MessageDigest

internal class UpdateClient(private val cacheDirectory: File) {
    fun fetchLatest(): UpdateMetadata {
        val connection: HttpURLConnection = openConnection(
            url = UPDATE_METADATA_URL,
            accept = "application/json",
            readTimeoutMilliseconds = METADATA_READ_TIMEOUT_MILLISECONDS,
        )
        return try {
            ensureSuccessfulResponse(connection)
            val jsonText: String = connection.inputStream.use(::readMetadataText)
            UpdateMetadata.parse(jsonText)
        } finally {
            connection.disconnect()
        }
    }

    fun download(update: UpdateMetadata): File {
        val targetFile: File = File.createTempFile("jay-squared-update-", ".apk", cacheDirectory)
        try {
            downloadToFile(update, targetFile)
            return targetFile
        } catch (exception: Exception) {
            targetFile.delete()
            throw exception
        }
    }

    private fun downloadToFile(update: UpdateMetadata, targetFile: File) {
        val connection: HttpURLConnection = openConnection(
            url = update.apkUrl,
            accept = "application/vnd.android.package-archive",
            readTimeoutMilliseconds = APK_READ_TIMEOUT_MILLISECONDS,
        )
        try {
            ensureSuccessfulResponse(connection)
            validateReportedSize(connection.contentLengthLong, update.apkSize)
            val digest: MessageDigest = MessageDigest.getInstance("SHA-256")
            val downloadedSize: Long = copyAndDigest(connection.inputStream, targetFile, digest)
            require(downloadedSize == update.apkSize) { "Downloaded APK size does not match metadata" }
            require(MessageDigest.isEqual(digest.digest(), decodeHex(update.sha256))) {
                "Downloaded APK checksum does not match metadata"
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun copyAndDigest(inputStream: InputStream, targetFile: File, digest: MessageDigest): Long {
        var totalBytes: Long = 0L
        DigestInputStream(inputStream, digest).use { input: DigestInputStream ->
            FileOutputStream(targetFile).use { output: FileOutputStream ->
                val buffer: ByteArray = ByteArray(DOWNLOAD_BUFFER_BYTES)
                while (true) {
                    if (Thread.currentThread().isInterrupted) throw InterruptedIOException()
                    val count: Int = input.read(buffer)
                    if (count == -1) break
                    totalBytes += count.toLong()
                    if (totalBytes > UpdateMetadata.MAX_APK_SIZE_BYTES) {
                        throw IOException("Downloaded APK exceeds the size limit")
                    }
                    output.write(buffer, 0, count)
                }
                output.fd.sync()
            }
        }
        return totalBytes
    }

    private fun openConnection(
        url: String,
        accept: String,
        readTimeoutMilliseconds: Int,
    ): HttpURLConnection {
        return (URI(url).toURL().openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = CONNECT_TIMEOUT_MILLISECONDS
            readTimeout = readTimeoutMilliseconds
            instanceFollowRedirects = true
            useCaches = false
            setRequestProperty("Accept", accept)
            setRequestProperty("Accept-Encoding", "identity")
            setRequestProperty("Cache-Control", "no-cache")
            setRequestProperty("User-Agent", USER_AGENT)
        }
    }

    private fun ensureSuccessfulResponse(connection: HttpURLConnection) {
        val responseCode: Int = connection.responseCode
        if (responseCode !in 200..299) throw IOException("Update server returned HTTP $responseCode")
        if (connection.url.protocol != "https") throw IOException("Update server redirected to an insecure URL")
    }

    private fun readMetadataText(inputStream: InputStream): String {
        val output: ByteArrayOutputStream = ByteArrayOutputStream()
        val buffer: ByteArray = ByteArray(METADATA_BUFFER_BYTES)
        while (true) {
            val count: Int = inputStream.read(buffer)
            if (count == -1) break
            if (output.size() + count > MAX_METADATA_BYTES) throw IOException("Update metadata is too large")
            output.write(buffer, 0, count)
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    private fun validateReportedSize(reportedSize: Long, expectedSize: Long) {
        if (reportedSize > UpdateMetadata.MAX_APK_SIZE_BYTES) throw IOException("Update APK is too large")
        if (reportedSize >= 0L && reportedSize != expectedSize) {
            throw IOException("Update server reported an unexpected APK size")
        }
    }

    private fun decodeHex(value: String): ByteArray {
        return ByteArray(value.length / 2) { index: Int ->
            value.substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }

    private companion object {
        const val UPDATE_METADATA_URL: String =
            "https://github.com/jameswilson/jaysquared/releases/latest/download/update.json"
        const val USER_AGENT: String = "Jay-Squared-Android-TV-Updater"
        const val CONNECT_TIMEOUT_MILLISECONDS: Int = 5_000
        const val METADATA_READ_TIMEOUT_MILLISECONDS: Int = 10_000
        const val APK_READ_TIMEOUT_MILLISECONDS: Int = 30_000
        const val MAX_METADATA_BYTES: Int = 64 * 1024
        const val METADATA_BUFFER_BYTES: Int = 4 * 1024
        const val DOWNLOAD_BUFFER_BYTES: Int = 32 * 1024
    }
}
