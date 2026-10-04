package com.papery.reader

import android.os.Bundle
import android.os.PowerManager
import android.app.ActivityManager
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.Keep
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var readerWebView: WebView? = null
  @Volatile private var volumePagingEnabled = false
  @Volatile private var insetJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"
  private val consumedKeys = mutableSetOf<Int>()
  private val lowMemory by lazy {
    val manager = getSystemService(ACTIVITY_SERVICE) as ActivityManager
    manager.isLowRamDevice || manager.memoryClass <= 128
  }

  // No file, network or account access is exposed to document frames.
  @Keep inner class ReaderBridge {
    @JavascriptInterface fun getWindowInsets(): String = insetJson
    @JavascriptInterface fun setVolumePagingEnabled(enabled: Boolean) {
      volumePagingEnabled = enabled
    }
    @JavascriptInterface fun getPerformanceProfile(): String = "{\"lowMemory\":$lowMemory}"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    readerWebView = webView
    webView.addJavascriptInterface(ReaderBridge(), "PaperyReader")
    // The WebView fills the window. CSS applies these insets exactly once;
    // native view padding would otherwise add a second safe area.
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = resources.displayMetrics.density
      val next = "{\"top\":${bars.top/density},\"right\":${bars.right/density},\"bottom\":${bars.bottom/density},\"left\":${bars.left/density}}"
      if (next != insetJson) {
        insetJson = next
        webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('papery-window-insets'))", null) }
      }
      insets
    }
    ViewCompat.requestApplyInsets(webView)
    // Performance optimizations for low-end devices
    webView.settings.apply {
      // Enable hardware-accelerated rendering
      allowFileAccess = false
      allowContentAccess = true
      // Cache optimization
      cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
      // Disable unnecessary features for reader app
      setSupportZoom(false)
      builtInZoomControls = false
      displayZoomControls = false
      // Text rendering optimization
      textZoom = 100
    }
    // Keep the accelerated window pipeline without pinning the entire WebView
    // in an extra GPU texture layer, which costs memory on low-end phones.
    webView.setLayerType(WebView.LAYER_TYPE_NONE, null)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val key = event.keyCode
    if (key == KeyEvent.KEYCODE_VOLUME_UP || key == KeyEvent.KEYCODE_VOLUME_DOWN) {
      if (event.action == KeyEvent.ACTION_UP && consumedKeys.remove(key)) return true
      if (event.action == KeyEvent.ACTION_DOWN && volumePagingEnabled && hasWindowFocus()) {
        consumedKeys.add(key)
        // Holding a key must not queue a burst of uninterruptible page turns.
        if (event.repeatCount == 0) {
          val direction = if (key == KeyEvent.KEYCODE_VOLUME_DOWN) "next" else "prev"
          readerWebView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('papery-volume-page',{detail:{direction:'$direction'}}))", null)
        }
        return true
      }
    }
    return super.dispatchKeyEvent(event)
  }

  override fun onPause() {
    volumePagingEnabled = false
    consumedKeys.clear()
    super.onPause()
  }

  @Suppress("DEPRECATION")
  override fun onResume() {
    super.onResume()
    val power = getSystemService(POWER_SERVICE) as PowerManager
    val screen = windowManager.defaultDisplay
    val current = screen.mode
    // Request refresh only, not another resolution. Android retains the final
    // choice (battery saver/user settings); old 60 Hz devices request 60 Hz.
    val preferred = screen.supportedModes.filter {
      it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
    }.maxOfOrNull { it.refreshRate } ?: current.refreshRate
    window.attributes = window.attributes.apply {
      preferredRefreshRate = if (power.isPowerSaveMode) 0f else preferred
    }
  }
}
