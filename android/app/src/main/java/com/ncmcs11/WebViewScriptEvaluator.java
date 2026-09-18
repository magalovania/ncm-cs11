package com.ncmcs11;

import android.webkit.WebView;

final class WebViewScriptEvaluator {
  private WebViewScriptEvaluator() {}

  static void evaluate(WebView webView, String script) {
    webView.evaluateJavascript(script, null);
  }
}
