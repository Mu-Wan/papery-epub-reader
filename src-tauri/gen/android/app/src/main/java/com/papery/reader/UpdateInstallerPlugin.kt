package com.papery.reader

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File
import java.security.MessageDigest

@InvokeArg
class InstallerArgs { lateinit var fileName: String; lateinit var sha256: String }
@TauriPlugin
class UpdateInstallerPlugin(private val activity: Activity): Plugin(activity) {
  @Command fun install(invoke: Invoke) {
    val args = invoke.parseArgs(InstallerArgs::class.java)
    Thread {
      try {
        require(Regex("Papery-(?:Reader-)?[0-9]+\\.[0-9]+\\.[0-9]+-Android-arm64\\.apk").matches(args.fileName)) { "安装包名称无效" }
        require(Regex("[0-9a-f]{64}").matches(args.sha256)) { "安装包校验值无效" }
        val file = File(File(activity.cacheDir, "papery-updates"), args.fileName)
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream -> val bytes = ByteArray(65536); while(true) { val count = stream.read(bytes); if(count < 0) break; hash.update(bytes,0,count) } }
        require(hash.digest().joinToString("") { (it.toInt() and 255).toString(16).padStart(2,'0') } == args.sha256) { "安装包已变化，请重新下载" }
        val pm = activity.packageManager
        @Suppress("DEPRECATION")
        val flags = if(Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        @Suppress("DEPRECATION")
        val target = pm.getPackageArchiveInfo(file.absolutePath, flags) ?: error("安装包无法读取")
        @Suppress("DEPRECATION")
        val current = pm.getPackageInfo(activity.packageName, flags)
        require(target.versionName == args.fileName.removePrefix("Papery-").removePrefix("Reader-").substringBefore("-Android")) { "安装包版本与更新信息不一致，请重新下载" }
        require(target.packageName == activity.packageName) { "安装包与当前应用不匹配" }
        val targetVersion = if(Build.VERSION.SDK_INT >= 28) target.longVersionCode else @Suppress("DEPRECATION") target.versionCode.toLong()
        val currentVersion = if(Build.VERSION.SDK_INT >= 28) current.longVersionCode else @Suppress("DEPRECATION") current.versionCode.toLong()
        require(targetVersion >= currentVersion) { "这是较旧的安装包，请重新检查更新" }
        @Suppress("DEPRECATION")
        val signatures = if(Build.VERSION.SDK_INT >= 28) target.signingInfo?.apkContentsSigners else target.signatures
        @Suppress("DEPRECATION")
        val installed = if(Build.VERSION.SDK_INT >= 28) current.signingInfo?.apkContentsSigners else current.signatures
        require(!signatures.isNullOrEmpty() && !installed.isNullOrEmpty() && signatures.size == installed.size && signatures.all { s -> installed.any { it == s } }) { "安装包签名与当前应用不一致" }
        activity.runOnUiThread {
          try {
            if(Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
              activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:${activity.packageName}")))
              val result = JSObject(); result.put("status", "permission"); invoke.resolve(result)
            } else {
              val uri = FileProvider.getUriForFile(activity,"${activity.packageName}.fileprovider",file)
              activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
              val result = JSObject(); result.put("status", "opened"); invoke.resolve(result)
            }
          } catch(error: Exception) { invoke.reject(error.message ?: "无法打开安装界面") }
        }
      } catch(error: Exception) { invoke.reject(error.message ?: "无法安装更新") }
    }.start()
  }
}
