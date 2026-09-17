package com.elementalidad.jaysquared

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import android.widget.Toast

class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_INSTALL_STATUS) return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> showInstallerConfirmation(context, intent)
            PackageInstaller.STATUS_SUCCESS -> restartUpdatedApp(context)
            else -> showInstallFailure(context, intent)
        }
    }

    private fun showInstallerConfirmation(context: Context, statusIntent: Intent) {
        val confirmationIntent: Intent? = getConfirmationIntent(statusIntent)
        if (confirmationIntent == null) {
            showInstallFailure(context, statusIntent)
            return
        }
        confirmationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(confirmationIntent)
    }

    private fun restartUpdatedApp(context: Context) {
        Toast.makeText(context, R.string.update_installed, Toast.LENGTH_LONG).show()
        val launchIntent: Intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        try {
            context.startActivity(launchIntent)
        } catch (exception: RuntimeException) {
            Log.w(LOG_TAG, "The updated app could not restart automatically", exception)
        }
    }

    private fun showInstallFailure(context: Context, statusIntent: Intent) {
        val message: String? = statusIntent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        Log.w(LOG_TAG, "Update installation failed: ${message.orEmpty()}")
        Toast.makeText(context, R.string.update_failed, Toast.LENGTH_LONG).show()
    }

    @Suppress("DEPRECATION")
    private fun getConfirmationIntent(statusIntent: Intent): Intent? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            statusIntent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
            statusIntent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
    }

    companion object {
        const val ACTION_INSTALL_STATUS: String =
            "com.elementalidad.jaysquared.action.UPDATE_INSTALL_STATUS"
        private const val LOG_TAG: String = "JaySquaredUpdater"
    }
}
