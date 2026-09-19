package com.ncmcs11;

import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * Exposed to the web UI as window.Android. The web app pushes playback state and
 * server-URL changes up here; the native side calls back into the web via
 * window.__bridge.onMediaKey(...) for 方控.
 */
public class Bridge {
  private static final String TAG = "NCMcs11";
  private final MainActivity activity;

  Bridge(MainActivity a) { this.activity = a; }

  @JavascriptInterface
  public void setMedia(String title, String artist, String artUrl) {
    MusicService.updateMedia(activity.getApplicationContext(), title, artist, artUrl);
  }

  @JavascriptInterface
  public void setPlaying(boolean playing) {
    MusicService.updateState(activity.getApplicationContext(), playing);
  }

  @JavascriptInterface
  public String getServer() {
    return activity.currentUrl();
  }

  @JavascriptInterface
  public String getGateKey() {
    return activity.currentGateKey();
  }

  @JavascriptInterface
  public void setServer(final String url) {
    activity.runOnUiThread(new Runnable() { @Override public void run() { activity.setServer(url); } });
  }

  @JavascriptInterface
  public void setServerConfig(final String url, final String gateKey) {
    activity.runOnUiThread(new Runnable() {
      @Override public void run() { activity.setServerConfig(url, gateKey); }
    });
  }

  @JavascriptInterface
  public void openServerDialog() {
    activity.runOnUiThread(new Runnable() { @Override public void run() { activity.showServerDialog(false); } });
  }

  @JavascriptInterface
  public void captureScreenshot(String viewName, String zoom) {
    activity.captureScreenshot(viewName, zoom);
  }

  @JavascriptInterface
  public void log(String msg) { Log.d(TAG, "web: " + msg); }
}
