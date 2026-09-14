package com.ncmcs11;

import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * Exposed to the web UI as window.Android. The web app calls these to push playback
 * state up to the native MediaSession + foreground notification (方控 routing +
 * 仪表盘 display). The native side calls back into the web via window.__bridge.
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
  public void log(String msg) { Log.d(TAG, "web: " + msg); }
}