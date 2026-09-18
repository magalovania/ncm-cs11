package com.ncmcs11;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.MediaMetadataRetriever;
import android.media.RemoteControlClient;
import android.os.Build;
import android.os.IBinder;

/**
 * Foreground service holding the platform media controls + a persistent notification.
 * <ul>
 *   <li>MediaSession (API 21+) or RemoteControlClient (API 19) routes steering-wheel keys.</li>
 *   <li>Persistent notification → 仪表盘 displays the current track (per HYWebview t/354).</li>
 * </ul>
 * Started lazily on first playback so it satisfies API 34 foreground-service rules.
 */
public class MusicService extends Service {
  private static final String CHANNEL = "ncmcs11_playback";
  private static final int NOTIF_ID = 1;

  private Object mediaSession;
  private AudioManager audioManager;
  private ComponentName mediaButtonReceiver;
  private PendingIntent mediaButtonIntent;
  private RemoteControlClient remoteControlClient;
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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) mediaSession = MediaSessionController.create(this);
    else initRemoteControlClient();
    holder = this;
    startForegroundCompat(buildNotification());
    refresh();   // apply any state pushed before the session existed
  }

  @Override public int onStartCommand(Intent i, int flags, int id) { return START_STICKY; }

  @Override
  public void onDestroy() {
    if (mediaSession != null) MediaSessionController.release(mediaSession);
    mediaSession = null;
    releaseRemoteControlClient();
    holder = null;
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
    if (holder != null) return;   // already running
    Intent i = new Intent(ctx, MusicService.class);
    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
    else ctx.startService(i);
    // onCreate will run async and call refresh() once the session is ready.
  }

  // ---- MediaSession + notification sync ----
  private static void refresh() {
    MusicService service = svc();
    if (service == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) MediaSessionController.refresh(service.mediaSession, isPlaying, displayTitle(), curArtist);
    else service.refreshRemoteControlClient();
    NotificationManager nm = (NotificationManager) service.getSystemService(NOTIFICATION_SERVICE);
    nm.notify(NOTIF_ID, service.buildNotification());
  }

  static void dispatchMediaKey(String key) {
    MainActivity a = MainActivity.getInstance();
    if (a != null) a.evalJs("window.__bridge&&window.__bridge.onMediaKey('" + key + "')");
  }

  @SuppressWarnings("deprecation")
  private void initRemoteControlClient() {
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    mediaButtonReceiver = new ComponentName(this, MediaButtonReceiver.class);
    Intent mediaButton = new Intent(Intent.ACTION_MEDIA_BUTTON);
    mediaButton.setComponent(mediaButtonReceiver);
    mediaButtonIntent = PendingIntent.getBroadcast(this, 0, mediaButton, PendingIntent.FLAG_UPDATE_CURRENT);
    remoteControlClient = new RemoteControlClient(mediaButtonIntent);
    remoteControlClient.setTransportControlFlags(
      RemoteControlClient.FLAG_KEY_MEDIA_PLAY
        | RemoteControlClient.FLAG_KEY_MEDIA_PAUSE
        | RemoteControlClient.FLAG_KEY_MEDIA_PLAY_PAUSE
        | RemoteControlClient.FLAG_KEY_MEDIA_NEXT
        | RemoteControlClient.FLAG_KEY_MEDIA_PREVIOUS
        | RemoteControlClient.FLAG_KEY_MEDIA_STOP);
    audioManager.registerMediaButtonEventReceiver(mediaButtonReceiver);
    audioManager.registerRemoteControlClient(remoteControlClient);
  }

  @SuppressWarnings("deprecation")
  private void refreshRemoteControlClient() {
    if (remoteControlClient == null) return;
    remoteControlClient.setPlaybackState(isPlaying
      ? RemoteControlClient.PLAYSTATE_PLAYING
      : RemoteControlClient.PLAYSTATE_PAUSED);
    RemoteControlClient.MetadataEditor editor = remoteControlClient.editMetadata(true);
    editor.putString(MediaMetadataRetriever.METADATA_KEY_TITLE, displayTitle());
    editor.putString(MediaMetadataRetriever.METADATA_KEY_ARTIST, curArtist);
    editor.apply();
  }

  @SuppressWarnings("deprecation")
  private void releaseRemoteControlClient() {
    if (audioManager != null && remoteControlClient != null) {
      audioManager.unregisterRemoteControlClient(remoteControlClient);
    }
    if (audioManager != null && mediaButtonReceiver != null) {
      audioManager.unregisterMediaButtonEventReceiver(mediaButtonReceiver);
    }
    if (mediaButtonIntent != null) mediaButtonIntent.cancel();
    remoteControlClient = null;
    mediaButtonIntent = null;
    mediaButtonReceiver = null;
    audioManager = null;
  }

  private static String displayTitle() {
    return curTitle.isEmpty() ? "车机网易云" : curTitle;
  }

  private static MusicService svc() {
    return holder;
  }
  private static MusicService holder;
  private void startForegroundCompat(Notification n) {
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    } else {
      startForeground(NOTIF_ID, n);
    }
  }

  private Notification buildNotification() {
    Notification.Builder b = Build.VERSION.SDK_INT >= 26
      ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    Intent openApp = new Intent(this, MainActivity.class);
    int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp, pendingFlags);
    b.setContentTitle(displayTitle())
     .setContentText(curArtist)
     .setSmallIcon(android.R.drawable.ic_media_play)
     .setContentIntent(contentIntent)
     .setOngoing(true)
     .setOnlyAlertOnce(true);
    if (Build.VERSION.SDK_INT >= 21) b.setVisibility(Notification.VISIBILITY_PUBLIC);
    return b.build();
  }
}
