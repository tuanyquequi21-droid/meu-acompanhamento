package com.meuacompanhamento.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JavascriptInterface
import android.content.pm.PackageManager
import android.Manifest
import org.json.JSONObject
import android.graphics.Color
import android.view.WindowManager

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileRequestCode = 4102
    private val appUrl = "https://tuanyquequi21-droid.github.io/meu-acompanhamento/"
    private val notificationPermissionRequest = 4201
    private var pendingRestSeconds: Int? = null

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(48, 56, 63)
        window.navigationBarColor = Color.BLACK
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(242, 244, 245))
        webView.clipToPadding = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            webView.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        } else {
            @Suppress("DEPRECATION")
            webView.setOnApplyWindowInsetsListener { view, insets ->
                view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                insets
            }
        }
        webView.settings.javaScriptEnabled = true
        webView.addJavascriptInterface(RestTimerBridge(), "AndroidRestTimer")
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setSupportMultipleWindows(false)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                return if (uri.scheme == "https" && uri.host == "tuanyquequi21-droid.github.io") {
                    false
                } else {
                    try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) {}
                    true
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), fileRequestCode)
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) webView.loadUrl(appUrl) else webView.restoreState(savedInstanceState)
    }


    private inner class RestTimerBridge {
        @JavascriptInterface fun start(seconds: Int) {
            val safeSeconds = seconds.coerceIn(1, 7200)
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    pendingRestSeconds = safeSeconds
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), notificationPermissionRequest)
                } else {
                    launchRestService(RestTimerService.ACTION_START, safeSeconds)
                }
            }
        }
        @JavascriptInterface fun pause() { runOnUiThread { launchRestService(RestTimerService.ACTION_PAUSE) } }
        @JavascriptInterface fun resume(seconds: Int) { runOnUiThread { launchRestService(RestTimerService.ACTION_RESUME, seconds.coerceIn(1, 7200)) } }
        @JavascriptInterface fun stop() { runOnUiThread { pendingRestSeconds = null; launchRestService(RestTimerService.ACTION_STOP) } }
        @JavascriptInterface fun getState(): String {
            val prefs = getSharedPreferences(RestTimerService.PREFS, MODE_PRIVATE)
            val state = prefs.getString("state", "none") ?: "none"
            val endAt = prefs.getLong("endAt", 0L)
            val remaining = if (state == "running") ((endAt - System.currentTimeMillis() + 999L) / 1000L).coerceAtLeast(0L) else prefs.getLong("remaining", 0L)
            return JSONObject().put("state", state).put("remaining", remaining).toString()
        }
    }

    private fun launchRestService(action: String, seconds: Int = 0) {
        val intent = Intent(this, RestTimerService::class.java).setAction(action).putExtra(RestTimerService.EXTRA_SECONDS, seconds)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == notificationPermissionRequest) {
            val seconds = pendingRestSeconds
            pendingRestSeconds = null
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED && seconds != null) {
                launchRestService(RestTimerService.ACTION_START, seconds)
            } else {
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('ma:notification-permission-denied'))", null)
            }
        }
    }

    @Deprecated("Deprecated in Android API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileRequestCode) {
            val result = if (resultCode == Activity.RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
        }
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }
}
