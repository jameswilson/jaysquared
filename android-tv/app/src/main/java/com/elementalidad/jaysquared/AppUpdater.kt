package com.elementalidad.jaysquared

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.annotation.RequiresApi
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

internal class AppUpdater(private val activity: Activity) : AutoCloseable {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable: Runnable ->
        Thread(runnable, "jay-squared-updater")
    }
    private val mainHandler: Handler = Handler(Looper.getMainLooper())
    private val updateClient: UpdateClient = UpdateClient(activity.cacheDir)
    private val packageInstaller: UpdatePackageInstaller = UpdatePackageInstaller(activity)
    private val hasChecked: AtomicBoolean = AtomicBoolean(false)
    private val isUpdating: AtomicBoolean = AtomicBoolean(false)
    private val isClosed: AtomicBoolean = AtomicBoolean(false)
    private var pendingUpdate: UpdateMetadata? = null
    private var progressDialog: AlertDialog? = null

    fun checkForUpdate() {
        if (isDebuggable() || isClosed.get() || !hasChecked.compareAndSet(false, true)) return
        executor.execute {
            try {
                val update: UpdateMetadata = updateClient.fetchLatest()
                if (update.isNewerThan(packageInstaller.getInstalledVersionCode())) {
                    postToMain { showUpdatePrompt(update) }
                }
            } catch (exception: Exception) {
                Log.i(LOG_TAG, "Update check unavailable; continuing offline", exception)
            }
        }
    }

    fun onActivityResult(requestCode: Int) {
        if (requestCode != INSTALL_PERMISSION_REQUEST_CODE) return
        val update: UpdateMetadata = pendingUpdate ?: return
        if (canRequestPackageInstalls()) {
            downloadAndInstall(update)
        } else {
            pendingUpdate = null
            Toast.makeText(activity, R.string.update_permission_missing, Toast.LENGTH_LONG).show()
        }
    }

    override fun close() {
        if (!isClosed.compareAndSet(false, true)) return
        mainHandler.removeCallbacksAndMessages(null)
        progressDialog?.dismiss()
        progressDialog = null
        executor.shutdownNow()
    }

    private fun showUpdatePrompt(update: UpdateMetadata) {
        if (!canUseActivity()) return
        pendingUpdate = update
        val displayVersion: String = update.versionName.removePrefix("v").removeSuffix("-tv")
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_available_title)
            .setMessage(activity.getString(R.string.update_available_message, displayVersion))
            .setPositiveButton(R.string.update_now) { _, _ -> prepareUpdate(update) }
            .setNegativeButton(R.string.update_later) { _, _ -> pendingUpdate = null }
            .setOnCancelListener { pendingUpdate = null }
            .show()
    }

    private fun prepareUpdate(update: UpdateMetadata) {
        pendingUpdate = update
        if (canRequestPackageInstalls()) {
            downloadAndInstall(update)
        } else {
            requestInstallPermission()
        }
    }

    @Suppress("DEPRECATION")
    @RequiresApi(Build.VERSION_CODES.O)
    private fun requestInstallPermission() {
        Toast.makeText(activity, R.string.update_permission_required, Toast.LENGTH_LONG).show()
        val settingsIntent: Intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}"),
        )
        try {
            activity.startActivityForResult(settingsIntent, INSTALL_PERMISSION_REQUEST_CODE)
        } catch (exception: ActivityNotFoundException) {
            Log.w(LOG_TAG, "Install permission settings are unavailable", exception)
            pendingUpdate = null
            Toast.makeText(activity, R.string.update_permission_missing, Toast.LENGTH_LONG).show()
        }
    }

    private fun downloadAndInstall(update: UpdateMetadata) {
        if (!isUpdating.compareAndSet(false, true)) return
        showProgressDialog()
        executor.execute {
            var apkFile: File? = null
            try {
                apkFile = updateClient.download(update)
                packageInstaller.validateAndInstall(apkFile, update)
                postToMain(::hideProgressDialog)
            } catch (exception: Exception) {
                Log.w(LOG_TAG, "Update download or installation failed", exception)
                postToMain {
                    hideProgressDialog()
                    Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show()
                }
            } finally {
                apkFile?.delete()
                pendingUpdate = null
                isUpdating.set(false)
            }
        }
    }

    private fun showProgressDialog() {
        if (!canUseActivity()) return
        progressDialog = AlertDialog.Builder(activity)
            .setMessage(R.string.update_downloading)
            .setCancelable(false)
            .show()
    }

    private fun hideProgressDialog() {
        progressDialog?.dismiss()
        progressDialog = null
    }

    private fun canRequestPackageInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()
    }

    private fun isDebuggable(): Boolean {
        return activity.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    }

    private fun postToMain(action: () -> Unit) {
        mainHandler.post {
            if (canUseActivity()) action()
        }
    }

    private fun canUseActivity(): Boolean {
        return !isClosed.get() && !activity.isFinishing && !activity.isDestroyed
    }

    private companion object {
        const val INSTALL_PERMISSION_REQUEST_CODE: Int = 4107
        const val LOG_TAG: String = "JaySquaredUpdater"
    }
}
