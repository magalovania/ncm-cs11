package com.ncmcs11;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Foreground service holding the MediaSession + a persistent notification.
 * <ul>
 *   <li>MediaSession → steering-wheel (方控) media buttons route here + 仪表盘 reads it.</li>
 *   <li>Persistent notification → 仪表盘 displays the current track (per HYWebview t/354).</li>
 * </ul>
 * Started lazily on first playback so it satisfies API 34 foreground-service rules.
 */
public class MusicService extends Service {
  private static final String TAG = "NCMcs11";
  private static final String CHANNEL = "ncmcs11_playback";
  private static final int NOTIF_ID = 1;

  private static MediaSession session;
  // last-known state — applied once the session is created (service start is async)
  private static String curTitle = "", curArtist = "";
  private static boolean isPlaying = false;

  // ---- lifecycle ----
  @Override public IBinder onBind(Intent intent) { return null; }

  @Override
  public void onCreate() {
    super.onCreate();
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      nm.createNotificationChannel(new NotificationChannel(CHANNEL, "音乐播放", NotificationManager.IMPORTANCE_LOW));
    }
    session = new MediaSession(this, "ncmcs11");
    session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    session.setCallback(new MediaSession.Callback() {
      @Override public void onPlay() { eval("play"); }
      @Override public void onPause() { eval("pause"); }
      @Override public void onSkipToNext() { eval("next"); }
      @Override public void onSkipToPrevious() { eval("prev"); }
      @Override public void onStop() { eval("pause"); }
    });
    session.setActive(true);
    startForegroundCompat(buildNotification());
    refresh();   // apply any state pushed before the session existed
  }

  @Override public int onStartCommand(Intent i, int flags, int id) { return START_STICKY; }

  @Override
  public void onDestroy() {
    if (session != null) { try { session.setActive(false); session.release(); } catch (Throwable t) {} session = null; }
    super.onDestroy();
  }

  // ---- pushed from the web via Bridge ----
  static void updateMedia(Context ctx, String title, String artist, String artUrl) {
    curTitle = title == null ? "" : title;
    curArtist = artist == null ? "" : artist;
    ensureStarted(ctx);
    refresh();
  }

  static void updateState(Context ctx, boolean playing) {
    isPlaying = playing;
    ensureStarted(ctx);
    refresh();
  }

  private static void ensureStarted(Context ctx) {
    if (session != null) return;   // already running
    Intent i = new Intent(ctx, MusicService.class);
    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
    else ctx.startService(i);
    // onCreate will run async and call refresh() once the session is ready.
  }

  // ---- MediaSession + notification sync ----
  private static void refresh() {
    if (session == null) return;
    PlaybackState st = new PlaybackState.Builder()
      .setState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1.0f)
      .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
      .build();
    session.setPlaybackState(st);
    MediaMetadata md = new MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, curTitle.isEmpty() ? "车机网易云" : curTitle)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, curArtist)
      .build();
    session.setMetadata(md);
    if (svc() != null) {
      NotificationManager nm = (NotificationManager) svc().getSystemService(NOTIFICATION_SERVICE);
      nm.notify(NOTIF_ID, svc().buildNotification());
    }
  }

  private static void eval(String key) {
    MainActivity a = MainActivity.getInstance();
    if (a != null) a.evalJs("window.__bridge&&window.__bridge.onMediaKey('" + key + "')");
  }

  private static MusicService svc() {
    return holder;
  }
  private static MusicService holder;
  private void startForegroundCompat(Notification n) {
    holder = this;
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    } else {
      startForeground(NOTIF_ID, n);
    }
  }

  private Notification buildNotification() {
    Notification.Builder b = Build.VERSION.SDK_INT >= 26
      ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    b.setContentTitle(curTitle.isEmpty() ? "车机网易云" : curTitle)
     .setContentText(curArtist)
     .setSmallIcon(android.R.drawable.ic_media_play)
     .setOngoing(true)
     .setOnlyAlertOnce(true);
    if (Build.VERSION.SDK_INT >= 21) b.setVisibility(Notification.VISIBILITY_PUBLIC);
    return b.build();
  }
}