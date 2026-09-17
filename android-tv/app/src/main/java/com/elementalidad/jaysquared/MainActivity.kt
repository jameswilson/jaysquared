package com.elementalidad.jaysquared

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.ByteArrayInputStream

class MainActivity : Activity() {
    private lateinit var gameView: WebView
    private var hasDestroyedGameView: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enableImmersiveMode()
        gameView = createGameView()
        setContentView(gameView)
        gameView.loadUrl(GAME_URL)
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveMode()
        gameView.onResume()
        gameView.requestFocus()
    }

    override fun onPause() {
        gameView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (::gameView.isInitialized && !hasDestroyedGameView) {
            gameView.destroy()
            hasDestroyedGameView = true
        }
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createGameView(): WebView {
        val assetLoader: WebViewAssetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_ASSET_DOMAIN)
            .addPathHandler(APP_ASSET_PATH, WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        return WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            overScrollMode = View.OVER_SCROLL_NEVER
            webChromeClient = WebChromeClient()
            webViewClient = LocalContentWebViewClient(assetLoader, ::recoverFromRendererLoss)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = WebSettings.LOAD_NO_CACHE
                setGeolocationEnabled(false)
                setSupportMultipleWindows(false)
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            requestFocus()
        }
    }

    @Suppress("DEPRECATION")
    private fun enableImmersiveMode() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    private fun recoverFromRendererLoss(webView: WebView) {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        hasDestroyedGameView = true
        recreate()
    }

    // The callback below handles renderer termination; suppress the detector at class scope.
    @SuppressLint("MissingOnRenderProcessGone")
    private class LocalContentWebViewClient(
        private val assetLoader: WebViewAssetLoader,
        private val handleRendererGone: (WebView) -> Unit,
    ) : WebViewClientCompat() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse {
            return assetLoader.shouldInterceptRequest(request.url) ?: createBlockedResponse()
        }

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean {
            return request.url.host != APP_ASSET_DOMAIN
        }

        override fun onRenderProcessGone(
            view: WebView,
            detail: RenderProcessGoneDetail,
        ): Boolean {
            handleRendererGone(view)
            return true
        }

        private fun createBlockedResponse(): WebResourceResponse {
            return WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                emptyMap(),
                ByteArrayInputStream(ByteArray(0)),
            )
        }
    }

    private companion object {
        const val APP_ASSET_DOMAIN: String = "appassets.androidplatform.net"
        const val APP_ASSET_PATH: String = "/assets/"
        const val GAME_URL: String = "https://$APP_ASSET_DOMAIN$APP_ASSET_PATH/jay-squared.html"
    }
}
