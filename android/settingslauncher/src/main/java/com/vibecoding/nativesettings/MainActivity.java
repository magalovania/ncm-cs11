package com.vibecoding.nativesettings;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final ComponentName AOSP_SETTINGS = new ComponentName(
            "com.android.settings",
            "com.android.settings.Settings"
    );

    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(createContentView());

        if (savedInstanceState == null) {
            openNativeSettingsHome();
        }
    }

    private View createContentView() {
        int padding = dp(20);
        int smallGap = dp(8);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(R.string.title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        content.addView(title, matchWrap());

        TextView description = new TextView(this);
        description.setText(R.string.description);
        description.setTextColor(0xffd6e4ff);
        description.setTextSize(16);
        description.setPadding(0, smallGap, 0, smallGap);
        content.addView(description, matchWrap());

        statusView = new TextView(this);
        statusView.setText(R.string.ready);
        statusView.setTextColor(0xffffd166);
        statusView.setTextSize(15);
        statusView.setPadding(0, 0, 0, smallGap);
        content.addView(statusView, matchWrap());

        addButton(content, R.string.open_native_settings, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openNativeSettingsHome();
            }
        });
        addSettingsButton(content, R.string.wireless_settings, Settings.ACTION_WIRELESS_SETTINGS);
        addSettingsButton(content, R.string.wifi_settings, Settings.ACTION_WIFI_SETTINGS);
        addSettingsButton(content, R.string.bluetooth_settings, Settings.ACTION_BLUETOOTH_SETTINGS);
        addSettingsButton(content, R.string.display_settings, Settings.ACTION_DISPLAY_SETTINGS);
        addSettingsButton(content, R.string.sound_settings, Settings.ACTION_SOUND_SETTINGS);
        addSettingsButton(content, R.string.app_settings, Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS);
        addSettingsButton(content, R.string.security_settings, Settings.ACTION_SECURITY_SETTINGS);
        addSettingsButton(content, R.string.language_settings, Settings.ACTION_INPUT_METHOD_SETTINGS);
        addSettingsButton(content, R.string.date_settings, Settings.ACTION_DATE_SETTINGS);
        addSettingsButton(content, R.string.accessibility_settings, Settings.ACTION_ACCESSIBILITY_SETTINGS);
        addSettingsButton(content, R.string.development_settings, Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(0xff17233c);
        scrollView.addView(content);
        return scrollView;
    }

    private void openNativeSettingsHome() {
        Intent explicitIntent = new Intent(Intent.ACTION_MAIN);
        explicitIntent.setComponent(AOSP_SETTINGS);
        explicitIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (startSafely(explicitIntent, R.string.native_settings_opened)) {
            return;
        }

        Intent fallbackIntent = new Intent(Settings.ACTION_SETTINGS);
        if (!startSafely(fallbackIntent, R.string.standard_settings_opened)) {
            showFailure(getString(R.string.settings_unavailable));
        }
    }

    private void openSettingsPage(String action) {
        if (!startSafely(new Intent(action), R.string.page_opened)) {
            showFailure(getString(R.string.page_unavailable));
        }
    }

    private boolean startSafely(Intent intent, int successMessage) {
        try {
            startActivity(intent);
            statusView.setText(successMessage);
            return true;
        } catch (ActivityNotFoundException exception) {
            return false;
        } catch (SecurityException exception) {
            return false;
        }
    }

    private void showFailure(String message) {
        statusView.setText(message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void addSettingsButton(LinearLayout parent, int label, final String action) {
        addButton(parent, label, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openSettingsPage(action);
            }
        });
    }

    private void addButton(LinearLayout parent, int label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(18);
        button.setMinHeight(dp(56));
        button.setAllCaps(false);
        button.setOnClickListener(listener);

        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, dp(5), 0, dp(5));
        parent.addView(button, params);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
