package com.papery.reader

import android.os.Bundle
import android.graphics.Color
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val content = findViewById<android.view.View>(android.R.id.content)
    val appColor = Color.rgb(243, 241, 236)
    content.setBackgroundColor(appColor)
    window.statusBarColor = appColor
    window.navigationBarColor = appColor
    WindowInsetsControllerCompat(window, content).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      // Android 15 起强制贴边显示，这里把网页内容约束在系统栏安全区内。
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
