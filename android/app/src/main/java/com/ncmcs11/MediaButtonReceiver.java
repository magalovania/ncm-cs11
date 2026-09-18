package com.ncmcs11;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;

public class MediaButtonReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (!Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
    KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
    if (event == null || event.getAction() != KeyEvent.ACTION_DOWN || event.getRepeatCount() != 0) return;
    String key = MainActivity.mediaKey(event.getKeyCode());
    if (key == null) return;
    MusicService.dispatchMediaKey(key);
    abortBroadcast();
  }
}
