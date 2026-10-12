package com.papery.reader

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.view.Gravity
import android.widget.TextView

/** A failed Wry runtime cannot recreate its last window in the same process. */
class RestartReaderActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(TextView(this).apply {
      text = "正在返回书库…"
      textSize = 18f
      gravity = Gravity.CENTER
      setTextColor(android.graphics.Color.rgb(32, 33, 36))
      setBackgroundColor(android.graphics.Color.rgb(252, 251, 250))
    })
    val readerPid = intent.getIntExtra("readerPid", -1)
    if (readerPid > 0 && readerPid != Process.myPid()) Process.killProcess(readerPid)
    Handler(Looper.getMainLooper()).postDelayed({
      startActivity(Intent(this, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
      finishAndRemoveTask()
    }, 300)
  }
}
