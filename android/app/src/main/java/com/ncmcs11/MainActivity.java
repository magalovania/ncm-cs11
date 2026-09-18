package com.ncmcs11;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.CookieManager;
import android.webkit.CookieSyncManager;
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
  private static final String KEY_GATE = "gate_key";
  private static final String DEFAULT_URL = "http://:8080";
  private static final String APP_PATH = "index.html";

  private WebView web;
  private SharedPreferences prefs;
  private boolean errorShown = false;
  private static volatile MainActivity instance;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    instance = this;
    prefs = getSharedPreferences(PREF, Context.MODE_PRIVATE);
    migrateLegacyServerConfig();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    setContentView(R.layout.activity_main);

    web = findViewById(R.id.web);
    WebSettings ws = web.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);                  // localStorage
    ws.setMediaPlaybackRequiresUserGesture(false);  // autoplay
    ws.setJavaScriptCanOpenWindowsAutomatically(true);
    ws.setCacheMode(WebSettings.LOAD_NO_CACHE);      // dev: always fresh UI
    web.setWebViewClient(new LocalContentWebViewClient(this) {
      @Override public void onReceivedError(WebView view, int code, String description, String failingUrl) {
        if (localUrl(APP_PATH).equals(failingUrl)) fail();
      }
    });
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new Bridge(this), "Android");
    loadSaved();
  }

  private void loadSaved() {
    errorShown = false;
    syncGateCookie();
    web.loadUrl(localUrl(APP_PATH));
  }

  @SuppressWarnings("deprecation")
  private void syncGateCookie() {
    Uri server = Uri.parse(currentUrl());
    if (server.getScheme() == null || server.getAuthority() == null) return;
    CookieSyncManager.createInstance(this);
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    String origin = server.getScheme() + "://" + server.getAuthority() + "/";
    if (!currentGateKey().isEmpty()) {
      cookies.setCookie(origin, "ncm_gate=" + Uri.encode(currentGateKey()) + "; Path=/; Max-Age=31536000");
    } else if (prefs.getBoolean(KEY_GATE + "_configured", false)) {
      cookies.setCookie(origin, "ncm_gate=; Path=/; Max-Age=0");
    }
    CookieSyncManager.getInstance().sync();
  }

  String localUrl(String path) {
    return currentUrl() + (currentUrl().contains("?") ? "&" : "?") + "__ncm_asset=" + path;
  }

  String currentUrl() { return prefs.getString(KEY_URL, DEFAULT_URL); }

  String currentGateKey() { return prefs.getString(KEY_GATE, ""); }

  private void migrateLegacyServerConfig() {
    String savedUrl = prefs.getString(KEY_URL, DEFAULT_URL);
    String legacyKey = queryParameter(savedUrl, "key");
    if (legacyKey == null) return;
    SharedPreferences.Editor editor = prefs.edit()
      .putString(KEY_URL, withoutQueryParameter(savedUrl, "key"))
      .putBoolean(KEY_GATE + "_configured", true);
    if (!prefs.contains(KEY_GATE)) editor.putString(KEY_GATE, legacyKey);
    editor.apply();
  }

  private void fail() {
    if (errorShown) return;
    errorShown = true;
    runOnUiThread(new Runnable() { @Override public void run() { showServerDialog(true); } });
  }

  /** Native dialog to edit the server URL. Shown on load failure, or via window.Android.openServerDialog(). */
  void showServerDialog(final boolean fromError) {
    final EditText serverInput = new EditText(this);
    serverInput.setHint("http://服务器地址:端口");
    serverInput.setSingleLine(true);
    serverInput.setText(currentUrl());
    serverInput.setSelection(serverInput.getText().length());
    final EditText gateInput = new EditText(this);
    gateInput.setHint("访问口令（可选）");
    gateInput.setSingleLine(true);
    gateInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    gateInput.setText(currentGateKey());
    gateInput.setSelection(gateInput.getText().length());
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(60, 24, 60, 24);
    box.addView(serverInput, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    LinearLayout.LayoutParams gateParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    gateParams.topMargin = 16;
    box.addView(gateInput, gateParams);
    new AlertDialog.Builder(this)
      .setTitle("服务器设置")
      .setMessage(fromError ? "连接失败，请检查地址和访问口令" : "访问口令仅在后端启用 GATE_KEY 时填写")
      .setView(box)
      .setPositiveButton("保存并连接", new DialogInterface.OnClickListener() {
        @Override public void onClick(DialogInterface dialog, int which) {
          setServerConfig(serverInput.getText().toString().trim(), gateInput.getText().toString());
        }
      })
      .setNegativeButton("取消", null)
      .show();
  }

  void setServer(String url) {
    setServerConfig(url, currentGateKey());
  }

  void setServerConfig(String url, String gateKey) {
    if (url == null || url.isEmpty()) return;
    if (!url.startsWith("http")) url = "http://" + url;
    String legacyKey = queryParameter(url, "key");
    if ((gateKey == null || gateKey.isEmpty()) && legacyKey != null) gateKey = legacyKey;
    url = withoutQueryParameter(url, "key");
    prefs.edit()
      .putString(KEY_URL, url)
      .putString(KEY_GATE, gateKey == null ? "" : gateKey)
      .putBoolean(KEY_GATE + "_configured", true)
      .apply();
    Toast.makeText(this, "连接 " + url, Toast.LENGTH_SHORT).show();
    loadSaved();
  }

  private static String queryParameter(String url, String name) {
    try { return Uri.parse(url).getQueryParameter(name); }
    catch (Throwable ignored) { return null; }
  }

  private static String withoutQueryParameter(String url, String excludedName) {
    try {
      Uri source = Uri.parse(url);
      String encodedQuery = source.getEncodedQuery();
      if (encodedQuery == null || encodedQuery.isEmpty()) return url;
      Uri.Builder builder = source.buildUpon().encodedQuery(null);
      for (String part : encodedQuery.split("&")) {
        if (part.isEmpty()) continue;
        int separator = part.indexOf('=');
        String encodedName = separator >= 0 ? part.substring(0, separator) : part;
        if (excludedName.equals(Uri.decode(encodedName))) continue;
        String encodedValue = separator >= 0 ? part.substring(separator + 1) : "";
        builder.appendQueryParameter(Uri.decode(encodedName), Uri.decode(encodedValue));
      }
      return builder.build().toString();
    } catch (Throwable ignored) {
      return url;
    }
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
