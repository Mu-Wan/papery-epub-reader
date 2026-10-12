package com.papery.reader

import android.os.Bundle
import android.os.PowerManager
import android.os.Build
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.view.ViewGroup
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Button
import android.widget.Toast
import org.json.JSONObject
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
    @JavascriptInterface fun consumeRecoveryNotice(): Boolean {
      val prefs = getSharedPreferences("reader-recovery", MODE_PRIVATE)
      val pending = prefs.getBoolean("return-to-library", false)
      if (pending) prefs.edit().putBoolean("return-to-library", false).apply()
      return pending
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    readerWebView = webView
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Wry installs its client after this creation callback. Queue the wrapper
      // until that setup finishes so both recovery and Tauri IPC remain active.
      webView.post {
      if (readerWebView !== webView) return@post
      webView.webViewClient = ReaderRecoveryClient(webView.webViewClient) { failedView, detail ->
        volumePagingEnabled = false
        consumedKeys.clear()
        readerWebView = null
        getSharedPreferences("reader-recovery", MODE_PRIVATE).edit().putBoolean("return-to-library", true).commit()
        val report = JSONObject().apply {
          put("app", BuildConfig.VERSION_NAME)
          put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
          put("android", Build.VERSION.RELEASE)
          put("webview", WebView.getCurrentWebViewPackage()?.versionName ?: "unknown")
          put("rendererCrashed", detail.didCrash())
          put("time", System.currentTimeMillis())
        }.toString(2)
        (failedView.parent as? ViewGroup)?.removeView(failedView)
        failedView.destroy()
        val padding = (28 * resources.displayMetrics.density).toInt()
        val recovery = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER
          setPadding(padding, padding, padding, padding)
          setBackgroundColor(android.graphics.Color.rgb(252, 251, 250))
        }
        recovery.addView(TextView(this).apply {
          text = "阅读页面暂时中断\n书库和已保存的数据仍在，请返回书库后重试。"
          textSize = 18f
          gravity = Gravity.CENTER
          setTextColor(android.graphics.Color.rgb(32, 33, 36))
          setPadding(0, 0, 0, padding)
        })
        recovery.addView(Button(this).apply {
          text = "返回书库"
          setOnClickListener {
            startActivity(Intent(this@MainActivity, RestartReaderActivity::class.java)
              .putExtra("readerPid", android.os.Process.myPid())
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          }
        })
        recovery.addView(Button(this).apply {
          text = "复制故障信息"
          setOnClickListener {
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Papery 故障信息", report))
            Toast.makeText(this@MainActivity, "故障信息已复制", Toast.LENGTH_SHORT).show()
          }
        })
        setContentView(recovery)
      }
      }
    }
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
