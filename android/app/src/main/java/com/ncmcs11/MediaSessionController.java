package com.ncmcs11;

import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;

final class MediaSessionController {
  private MediaSessionController() {}

  static Object create(Context context) {
    MediaSession session = new MediaSession(context, "ncmcs11");
    session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    session.setCallback(new MediaSession.Callback() {
      @Override public void onPlay() { MusicService.dispatchMediaKey("play"); }
      @Override public void onPause() { MusicService.dispatchMediaKey("pause"); }
      @Override public void onSkipToNext() { MusicService.dispatchMediaKey("next"); }
      @Override public void onSkipToPrevious() { MusicService.dispatchMediaKey("prev"); }
      @Override public void onStop() { MusicService.dispatchMediaKey("pause"); }
    });
    session.setActive(true);
    return session;
  }

  static void refresh(Object object, boolean playing, String title, String artist) {
    MediaSession session = (MediaSession) object;
    if (session == null) return;
    PlaybackState state = new PlaybackState.Builder()
      .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1.0f)
      .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
      .build();
    session.setPlaybackState(state);
    MediaMetadata metadata = new MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, title)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
      .build();
    session.setMetadata(metadata);
  }

  static void release(Object object) {
    MediaSession session = (MediaSession) object;
    if (session == null) return;
    try {
      session.setActive(false);
      session.release();
    } catch (Throwable ignored) {}
  }
}
