package com.ncmcs11;

import android.net.Uri;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

class LocalContentWebViewClient extends WebViewClient {
  private static final String ASSET_PARAM = "__ncm_asset";
  private static final Map<String, String> MIME_TYPES = new HashMap<String, String>();

  static {
    MIME_TYPES.put("html", "text/html");
    MIME_TYPES.put("js", "text/javascript");
    MIME_TYPES.put("css", "text/css");
    MIME_TYPES.put("png", "image/png");
  }

  private final MainActivity activity;

  LocalContentWebViewClient(MainActivity activity) {
    this.activity = activity;
  }

  @Override
  public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
    String asset = assetPath(url);
    if (asset == null) return super.shouldInterceptRequest(view, url);
    try {
      InputStream stream = activity.getAssets().open(asset);
      return new WebResourceResponse(mimeType(asset), "UTF-8", stream);
    } catch (IOException ignored) {
      return super.shouldInterceptRequest(view, url);
    }
  }

  private String assetPath(String url) {
    Uri uri = Uri.parse(url);
    Uri expected = Uri.parse(activity.currentUrl());
    if (!same(expected.getScheme(), uri.getScheme()) || !same(expected.getAuthority(), uri.getAuthority())) return null;
    String asset = uri.getQueryParameter(ASSET_PARAM);
    if (asset == null || asset.contains("..") || asset.startsWith("/")) return null;
    return asset;
  }

  private boolean same(String left, String right) {
    return left != null && left.equals(right);
  }

  private String mimeType(String path) {
    int dot = path.lastIndexOf('.');
    String extension = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
    String mime = MIME_TYPES.get(extension);
    return mime == null ? "application/octet-stream" : mime;
  }
}
