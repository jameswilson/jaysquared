package com.elementalidad.jaysquared

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

internal class UpdatePackageInstaller(private val context: Context) {
    fun getInstalledVersionCode(): Long {
        return getVersionCode(getInstalledPackageInfo(0))
    }

    fun validateAndInstall(apkFile: File, update: UpdateMetadata) {
        val archiveInfo: PackageInfo = getArchivePackageInfo(apkFile)
        require(archiveInfo.packageName == context.packageName) { "Update package name does not match" }
        require(getVersionCode(archiveInfo) == update.versionCode) { "Update version does not match" }
        val installedSigners: Set<String> = getSignerDigests(getInstalledPackageInfo(SIGNATURE_FLAGS))
        val updateSigners: Set<String> = getSignerDigests(archiveInfo)
        require(installedSigners.intersect(updateSigners).isNotEmpty()) { "Update signer does not match" }
        install(apkFile)
    }

    private fun install(apkFile: File) {
        val packageInstaller: PackageInstaller = context.packageManager.packageInstaller
        val parameters: PackageInstaller.SessionParams = createSessionParameters(apkFile.length())
        val sessionId: Int = packageInstaller.createSession(parameters)
        val session: PackageInstaller.Session = packageInstaller.openSession(sessionId)
        var hasCommitted: Boolean = false
        try {
            FileInputStream(apkFile).use { input: FileInputStream ->
                session.openWrite(APK_SESSION_NAME, 0L, apkFile.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }
            session.commit(createStatusIntentSender(sessionId))
            hasCommitted = true
        } finally {
            if (!hasCommitted) session.abandon()
            session.close()
        }
    }

    private fun createSessionParameters(apkSize: Long): PackageInstaller.SessionParams {
        return PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apkSize)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                setPackageSource(PackageInstaller.PACKAGE_SOURCE_OTHER)
            }
        }
    }

    private fun createStatusIntentSender(sessionId: Int) =
        PendingIntent.getBroadcast(
            context,
            sessionId,
            Intent(context, UpdateInstallReceiver::class.java).setAction(
                UpdateInstallReceiver.ACTION_INSTALL_STATUS,
            ),
            PendingIntent.FLAG_UPDATE_CURRENT or mutablePendingIntentFlag(),
        ).intentSender

    private fun mutablePendingIntentFlag(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    }

    @Suppress("DEPRECATION")
    private fun getInstalledPackageInfo(flags: Int): PackageInfo {
        val packageManager: PackageManager = context.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageInfo(
                context.packageName,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            packageManager.getPackageInfo(context.packageName, flags)
        }
    }

    @Suppress("DEPRECATION")
    private fun getArchivePackageInfo(apkFile: File): PackageInfo {
        val packageManager: PackageManager = context.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageArchiveInfo(
                apkFile.absolutePath,
                PackageManager.PackageInfoFlags.of(SIGNATURE_FLAGS.toLong()),
            )
        } else {
            packageManager.getPackageArchiveInfo(apkFile.absolutePath, SIGNATURE_FLAGS)
        } ?: throw IllegalArgumentException("Downloaded APK could not be inspected")
    }

    @Suppress("DEPRECATION")
    private fun getVersionCode(packageInfo: PackageInfo): Long {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            packageInfo.versionCode.toLong()
        }
    }

    @Suppress("DEPRECATION")
    private fun getSignerDigests(packageInfo: PackageInfo): Set<String> {
        val signatures: Array<Signature> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = packageInfo.signingInfo
                ?: throw IllegalArgumentException("Package signing information is missing")
            if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
        } else {
            packageInfo.signatures ?: emptyArray()
        }
        return signatures.map(::getSignatureDigest).toSet()
    }

    private fun getSignatureDigest(signature: Signature): String {
        val digest: ByteArray = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
        return digest.joinToString(separator = "") { byte: Byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    private companion object {
        const val APK_SESSION_NAME: String = "jay-squared-tv.apk"
        val SIGNATURE_FLAGS: Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
    }
}
