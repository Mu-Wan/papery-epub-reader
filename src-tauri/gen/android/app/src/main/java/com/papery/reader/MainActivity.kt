package com.papery.reader

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
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
    // Enable hardware acceleration at view level
    webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)
  }
}
