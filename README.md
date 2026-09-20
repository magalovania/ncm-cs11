# ncm-cs11 — 领克 CS11 车机网易云音乐

为领克 CS11 老款安卓车机（32 位 ARM，Android 4.4+）自建的网易云音乐客户端。

车机太老、装不了官方 App，于是自搭一套：**约 92KB 的 WebView 壳 APK** 内置 UI，
音乐数据由一台车能访问的服务器提供，音频直连网易云 CDN，不经服务器。

## 架构

```
车机 APK（内置 Web UI + 原生媒体控制/前台服务）
        │  HTTP
        ▼
配置的服务器 origin
        ├── APK 本地拦截内置 UI 资源
        └── gateway :8080 代理 /api/* → NeteaseCloudMusicApi :3000
        ▼
网易云音乐接口（音频直走网易云 CDN）
```

| 目录 | 说明 |
|------|------|
| `web/` | 移动优先播放器 Web UI。零框架、XHR + 原生 JS，兼容老车机 WebView |
| `server/` | VPS 端：第三方 API（gitignore 不入库）+ 零依赖 Node 网关 + Docker 部署件 |
| `android/` | 车机 APK：纯 Android framework，零外部依赖，minSdk 19 |

## 功能

- QR 扫码登录（手机网易云 App「扫一扫」）
- 我的歌单 / 歌单详情 / 搜索歌曲和歌手
- FM 推荐页：私人 FM 固定在第一张，后接随机歌单并支持换一换
- 当前播放全屏页：大封面 + 歌词 + 播放队列（YesPlayMusic 风格暗色 UI）
- 车机适配：100% 默认缩放、无上下限缩放调节、底部安全留白、大触控目标
- 可选反馈版：单独构建 feedback APK 后可截图并压缩上传 VPS；公开标准版不包含可用的截图反馈入口
- APK 原生能力：服务器地址可改、MediaSession/RemoteControlClient 接管方控与仪表盘显示、常驻通知

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

公网必配访问口令：服务器上创建 `server/.env` 写 `GATE_KEY=<口令>`，无口令请求一律 403（防扫描白嫖）。

要点：海外服务器必须设 `ENABLE_RANDOM_CN_IP=true`（docker-compose.yml 已配好），
否则网易对非大陆 IP 的请求返回 `460 cheating`，取歌登录全挂。

## 车机 APK

`android/` — 纯 framework 实现（无 androidx），minSdk 19 / targetSdk 34。Web UI 内置在 APK 中，并以配置的服务器地址作为同源页面加载，既降低 Android 4.4 WebView 白屏风险，也保持 API、cookie 和媒体请求兼容。

- 前置：JDK 17+ 与 Android SDK（`android/local.properties` 写 `sdk.dir=<SDK 路径>`，或设 `ANDROID_HOME` 环境变量）
- 构建：`cd android && gradlew assembleDebug`（macOS/Linux 用 `./gradlew`；已带 wrapper，首次运行自动下载 Gradle 8.0.1）→ `app/build/outputs/apk/debug/`
- 不想自己构建：直接下载 [v1.2.2 标准无反馈版](https://github.com/magalovania/ncm-cs11/releases/tag/v1.2.2)（debug 签名）
- 核心类：
  - `MainActivity` / `LocalContentWebViewClient` — 全屏 WebView 壳；服务器地址持久化，并在服务器 origin 下拦截加载 APK 内置页面资源
  - `MusicService` — Android 5.0+ 使用 MediaSession，Android 4.4 使用 RemoteControlClient；两者均配合常驻前台通知接管方控与仪表盘显示
  - `MediaButtonReceiver` / `MediaSessionController` — 分别承接 Android 4.4 媒体按键和 Android 5.0+ 媒体会话
  - `Bridge` — 暴露 `window.Android`（setMedia/setPlaying/setServer 等），媒体键经 `window.__bridge.onMediaKey()` 回调进 Web

## 设计要点

- **访问口令（公网必配）**：设 `GATE_KEY` 环境变量后，网关对无口令请求一律 403（页面返回口令输入页），扫描器/白嫖者只能看到 403；每台设备输一次后 localStorage + cookie 双存储记住，车机熄火重启无感
- **APK 零输入接入**：服务器设置把“后端地址”和可选“访问口令”分开保存；口令经专用 `gate_key` 参数或网关 cookie 校验，不会再与二维码接口自身的 `key` 参数冲突
- **下一首预取**：每首歌起播时后台预取下一首直链（直链有效期约 20 分钟，命中即瞬时起播）；切歌/方控/自动连播不再付跨洋往返，只有点播第一首仍有一次 RTT
- **同源免 CORS**：网关单进程同时托管页面与代理 API；登录接口把 `Set-Cookie` 注入 JSON body——车机 http 非 localhost 环境浏览器 cookie 不可靠，前端存 localStorage 显式回放
- **缓存破坏戳**：API 的 GET 缓存 2 分钟，前端所有请求带 `_t` 时间戳（QR 登录尤其必须，否则拿到旧 key 扫不出）
- **流量友好**：音频直连网易云 CDN，VPS 只出页面与 JSON，1G/月流量用不完
- **歌词归一化**：网易云歌词用弯引号/全角撇号（U+2019/FF07），渲染时替换回 ASCII
- **真车截图调试**：仅 feedback 构建开放；还需 VPS 显式设置 `DEBUG_UPLOAD_ENABLED=true`。标准 APK 默认关闭截图反馈，详见 [`server/DEPLOY.md`](server/DEPLOY.md#车机截图调试)
- **历史反馈版已撤下**：v1.1.8、v1.1.9、v1.2.0 的 APK 资产已删除；这些 Release 页面只保留变更记录和安全通知

## 注意

- 自部署私用：不公开服务器地址、不用别人的公共 API 实例（会泄露账号）
- `server/api/` 为第三方 [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced) v4.40.1，gitignore 不入库
- `docs/`、`CLAUDE.md` 为本地开发记录，gitignore

## License

[MIT](LICENSE)。仅供学习交流，请尊重网易云音乐版权；API 依赖的第三方项目版权归原作者所有。
