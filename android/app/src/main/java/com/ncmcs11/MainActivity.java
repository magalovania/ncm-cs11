package com.ncmcs11;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen WebView shell that loads the web UI from the gateway.
 * Owns nothing playback-related — that lives in {@link MusicService} so 方控 and the
 * persistent notification (仪表盘 display) survive activity recreation.
 */
public class MainActivity extends Activity {
  private static final String TAG = "NCMcs11";
  // Home test: the gateway on the dev PC. For driving-anywhere, repoint to the VPS URL.
  private static final String START_URL = "http://192.168.31.187:8080";

  private WebView web;
  private static volatile MainActivity instance;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    instance = this;
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    setContentView(R.layout.activity_main);

    web = findViewById(R.id.web);
    WebSettings ws = web.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);                  // localStorage (cookie/quality/uid)
    ws.setMediaPlaybackRequiresUserGesture(false);  // autoplay allowed
    ws.setJavaScriptCanOpenWindowsAutomatically(true);
    ws.setCacheMode(WebSettings.LOAD_NO_CACHE);     // dev: always fresh UI
    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new Bridge(this), "Android");
    web.loadUrl(START_URL);
  }

  /** Run JS in the WebView on the UI thread. */
  void evalJs(String js) {
    runOnUiThread(new Runnable() {
      @Override public void run() { web.evaluateJavascript(js, null); }
    });
  }

  static MainActivity getInstance() { return instance; }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    // Fallback for steering-wheel keys delivered as physical key events to the
    // foreground app. (The MediaSession in MusicService handles broadcast-style
    // media buttons; only one of the two paths fires per key delivery.)
    String k = mediaKey(keyCode);
    if (k != null) {
      evalJs("window.__bridge&&window.__bridge.onMediaKey('" + k + "')");
      return true;
    }
    if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) { web.goBack(); return true; }
    return super.onKeyDown(keyCode, event);
  }

  static String mediaKey(int keyCode) {
    switch (keyCode) {
      case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
      case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
      case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "play";   // web toggle() handles the flip
      case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
      case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "prev";
      case KeyEvent.KEYCODE_MEDIA_STOP: return "pause";
      default: return null;
    }
  }

  @Override protected void onResume() { super.onResume(); instance = this; }
  @Override protected void onDestroy() {
    super.onDestroy();
    if (instance == this) instance = null;
  }
}