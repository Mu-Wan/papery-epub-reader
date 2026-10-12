package com.papery.reader

import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Build
import android.webkit.*
import androidx.annotation.RequiresApi

/** Keep Tauri's navigation, assets and IPC callbacks on their original client. */
@RequiresApi(Build.VERSION_CODES.O)
@Suppress("DEPRECATION")
class ReaderRecoveryClient(
  private val delegate: WebViewClient,
  private val recover: (WebView, RenderProcessGoneDetail) -> Unit
) : WebViewClient() {
  override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = delegate.shouldInterceptRequest(view, request)
  override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? = delegate.shouldInterceptRequest(view, url)
  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = delegate.shouldOverrideUrlLoading(view, request)
  override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = delegate.shouldOverrideUrlLoading(view, url)
  override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) = delegate.onPageStarted(view, url, favicon)
  override fun onPageFinished(view: WebView, url: String) = delegate.onPageFinished(view, url)
  override fun onPageCommitVisible(view: WebView, url: String) = delegate.onPageCommitVisible(view, url)
  override fun onLoadResource(view: WebView, url: String) = delegate.onLoadResource(view, url)
  override fun doUpdateVisitedHistory(view: WebView, url: String, reload: Boolean) = delegate.doUpdateVisitedHistory(view, url, reload)
  override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) = delegate.onReceivedError(view, request, error)
  override fun onReceivedError(view: WebView, code: Int, description: String, url: String) = delegate.onReceivedError(view, code, description, url)
  override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) = delegate.onReceivedHttpError(view, request, response)
  override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) = delegate.onReceivedSslError(view, handler, error)
  override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, host: String, realm: String) = delegate.onReceivedHttpAuthRequest(view, handler, host, realm)
  override fun onReceivedClientCertRequest(view: WebView, request: ClientCertRequest) = delegate.onReceivedClientCertRequest(view, request)
  override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) = delegate.onScaleChanged(view, oldScale, newScale)
  override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
    recover(view, detail)
    return true
  }
}
