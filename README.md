# ncm-cs11 — 领克 CS11 车机网易云音乐

为领克 CS11 老款安卓车机（32 位 ARM，Android ≈ 5.0+）自建的网易云音乐客户端。

车机太老、装不了官方 App，于是自搭一套：**约 22KB 的 WebView 壳 APK** 承载 UI，
音乐数据与页面托管在一台车能访问的服务器上，音频直连网易云 CDN，不经服务器。

## 架构

```
车机 APK（WebView 壳 + 原生 MediaSession/前台服务）
        │  HTTP
        ▼
gateway :8080 ── 同源托管 web/ 静态页面
        │      代理 /api/* → NeteaseCloudMusicApi :3000
        ▼
网易云音乐接口（音频直走网易云 CDN）
```

| 目录 | 说明 |
|------|------|
| `web/` | 移动优先播放器 Web UI。零框架、XHR + 原生 JS，兼容老车机 WebView |
| `server/` | VPS 端：第三方 API（gitignore 不入库）+ 零依赖 Node 网关 + Docker 部署件 |
| `android/` | 车机 APK：纯 Android framework，零外部依赖，minSdk 21 |

## 功能

- QR 扫码登录（手机网易云 App「扫一扫」）
- 我的歌单 / 歌单详情 / 私人 FM / 搜索 / 推荐歌单（换一换）
- 当前播放全屏页：大封面 + 歌词 + 播放队列（YesPlayMusic 风格暗色 UI）
- 车机适配：界面缩放、底部安全留白（避开系统底栏）、大触控目标
- APK 原生能力：服务器地址可改、MediaSession 接管方控与仪表盘显示、常驻通知

## 快速开始（本地）

前置：Node 18+、pnpm。手机/车机与 PC 同一局域网。

```bash
# 1. API：第三方项目，gitignore，需单独克隆
git clone https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced server/api
pnpm --dir server/api install
pnpm --dir server/api start        # → :3000

# 2. 网关：静态托管 + API 代理（同源，免 CORS）
node server/gateway.js             # → :8080

# 3. 手机/车机浏览器打开 http://<PC IP>:8080 → QR 登录 → 点歌
```

## VPS 部署（车机 4G 可用）

详见 `server/DEPLOY.md`：Docker Compose 一键部署、防火墙放行、流量与合规说明。

要点：海外服务器必须设 `ENABLE_RANDOM_CN_IP=true`（docker-compose.yml 已配好），
否则网易对非大陆 IP 的请求返回 `460 cheating`，取歌登录全挂。

## 车机 APK

`android/` — 纯 framework 实现（无 androidx），minSdk 21 / targetSdk 34，debug APK ≈ 22KB。

- 无 gradle wrapper：需本机 Gradle 8.x + Android SDK（`local.properties` 配置 `sdk.dir`）
- 构建：`cd android && gradle assembleDebug` → `app/build/outputs/apk/debug/`
- 仅三个类：
  - `MainActivity` — 全屏 WebView 壳；服务器地址存 SharedPreferences，连接失败自动弹原生对话框改地址
  - `MusicService` — MediaSession + 常驻前台通知；CS11 默认把方控映射到媒体键，据此接管方控与仪表盘显示
  - `Bridge` — 暴露 `window.Android`（setMedia/setPlaying/setServer 等），媒体键经 `window.__bridge.onMediaKey()` 回调进 Web

## 设计要点

- **访问口令（公网必配）**：设 `GATE_KEY` 环境变量后，网关对无口令请求一律 403（页面返回口令输入页），扫描器/白嫖者只能看到 403；每台设备输一次后 localStorage + cookie 双存储记住，车机熄火重启无感
- **下一首预取**：每首歌起播时后台预取下一首直链（直链有效期约 20 分钟，命中即瞬时起播）；切歌/方控/自动连播不再付跨洋往返，只有点播第一首仍有一次 RTT
- **同源免 CORS**：网关单进程同时托管页面与代理 API；登录接口把 `Set-Cookie` 注入 JSON body——车机 http 非 localhost 环境浏览器 cookie 不可靠，前端存 localStorage 显式回放
- **缓存破坏戳**：API 的 GET 缓存 2 分钟，前端所有请求带 `_t` 时间戳（QR 登录尤其必须，否则拿到旧 key 扫不出）
- **流量友好**：音频直连网易云 CDN，VPS 只出页面与 JSON，1G/月流量用不完
- **歌词归一化**：网易云歌词用弯引号/全角撇号（U+2019/FF07），渲染时替换回 ASCII

## 注意

- 自部署私用：不公开服务器地址、不用别人的公共 API 实例（会泄露账号）
- `server/api/` 为第三方 [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced) v4.40.1，gitignore 不入库
- `docs/`、`CLAUDE.md` 为本地开发记录，gitignore