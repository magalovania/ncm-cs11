package com.ncmcs11;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Build;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

/**
 * Full-screen WebView shell. Loads the server URL from SharedPreferences (so the car
 * can be repointed at a VPS without rebuilding). The native playback layer lives in
 * {@link MusicService}. Bridge (window.Android) handles bidirectional comms with the web UI.
 */
public class MainActivity extends Activity {
  private static final String PREF = "ncmcs11";
  private static final String KEY_URL = "server_url";
  private static final String DEFAULT_URL = "http://192.168.31.187:8080";
  private static final String APP_URL = "file:///android_asset/index.html";

  private WebView web;
  private SharedPreferences prefs;
  private boolean errorShown = false;
  private static volatile MainActivity instance;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    instance = this;
    prefs = getSharedPreferences(PREF, Context.MODE_PRIVATE);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    setContentView(R.layout.activity_main);

    web = findViewById(R.id.web);
    WebSettings ws = web.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);                  // localStorage
    ws.setMediaPlaybackRequiresUserGesture(false);  // autoplay
    ws.setJavaScriptCanOpenWindowsAutomatically(true);
    ws.setCacheMode(WebSettings.LOAD_NO_CACHE);      // dev: always fresh UI
    web.setWebViewClient(new WebViewClient() {
      @Override public void onReceivedError(WebView view, int code, String description, String failingUrl) {
        if (APP_URL.equals(failingUrl)) fail();
      }
    });
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new Bridge(this), "Android");
    loadSaved();
  }

  private void loadSaved() { errorShown = false; web.loadUrl(APP_URL); }

  String currentUrl() { return prefs.getString(KEY_URL, DEFAULT_URL); }

  private void fail() {
    if (errorShown) return;
    errorShown = true;
    runOnUiThread(new Runnable() { @Override public void run() { showServerDialog(true); } });
  }

  /** Native dialog to edit the server URL. Shown on load failure, or via window.Android.openServerDialog(). */
  void showServerDialog(final boolean fromError) {
    final EditText et = new EditText(this);
    et.setText(currentUrl());
    et.setSelection(et.getText().length());
    LinearLayout box = new LinearLayout(this);
    box.setPadding(60, 24, 60, 24);
    box.addView(et, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    new AlertDialog.Builder(this)
      .setTitle("服务器地址")
      .setMessage(fromError ? "连接失败，请确认后端地址" : "车机网易云后端地址")
      .setView(box)
      .setPositiveButton("保存并连接", new DialogInterface.OnClickListener() {
        @Override public void onClick(DialogInterface d, int w) { setServer(et.getText().toString().trim()); }
      })
      .setNegativeButton("取消", null)
      .show();
  }

  void setServer(String url) {
    if (url == null || url.isEmpty()) return;
    if (!url.startsWith("http")) url = "http://" + url;
    prefs.edit().putString(KEY_URL, url).apply();
    Toast.makeText(this, "连接 " + url, Toast.LENGTH_SHORT).show();
    loadSaved();
  }

  void evalJs(final String js) {
    runOnUiThread(new Runnable() {
      @Override public void run() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) WebViewScriptEvaluator.evaluate(web, js);
        else web.loadUrl("javascript:" + js);
      }
    });
  }

  static MainActivity getInstance() { return instance; }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
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
      case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "play";
      case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
      case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "prev";
      case KeyEvent.KEYCODE_MEDIA_STOP: return "pause";
      default: return null;
    }
  }

  @Override protected void onResume() { super.onResume(); instance = this; }
  @Override protected void onDestroy() { super.onDestroy(); if (instance == this) instance = null; }
}
