# 部署到 VPS（GCP 免费档 / 港或东京 VPS 通用）

## 先看作者须知（已对照）
- **只自己部署、自己用，别用别人的公开服务**（会泄露账号）。我们是自部署，OK。
- 自己的实例也别公网裸奔：别把地址公开/被搜索引擎收录；GCP 可用防火墙规则限制来源 IP。
- **必配访问口令**（见下节）：公网 IP 上的 8080 会被扫描器持续扫到，不设口令等于给全网一个免费音乐 API（实测匿名即可解析歌曲直链）。
- API 的 GET 会被缓存 2 分钟 → 前端已给每次请求加 `_t` 时间戳规避（**二维码登录必须带**，否则拿到旧 key 扫不出）。
- cookie：前端只用 `MUSIC_U`，走同源 `/api` 代理 + `?cookie=` 回放，跨域问题已规避。

## 访问口令（GATE_KEY，公网必配）

设置后，网关对不带口令的请求一律 403（页面请求返回一个口令输入页，API 请求返回 403 JSON），扫描器和白嫖者只能看到 403。

1. 服务器上创建 `server/.env`（gitignore，**口令不要写进任何入库文件**）：
   ```
   GATE_KEY=你的口令
   ```
2. `docker compose up -d` 自动读取该文件并注入网关容器。
3. 每台设备（车机/手机/PC）第一次访问时输入一次口令，之后 localStorage + cookie 双存储记住，车机熄火重启不用重输。
4. 车机端可零输入：APK 的“服务器设置”中，后端地址填 `http://<IP>:8080`，访问口令单独填写；两项会分别保存。
5. 改口令后：各设备访问会重新弹口令页，输一次新口令即可（老 cookie 自动作废）。
6. 本地开发不带 `GATE_KEY` 启动网关 = 开放模式，控制台会提示 `gate: OFF`。

## 步骤（Docker）
1. 服务器装好 Docker + Docker Compose（GCP e2-micro 用 Debian/Ubuntu 一键脚本即可）。
2. 把仓库传上去：`git clone <你的仓库>`，或把 `server/ web/ .dockerignore` scp 过去。
3. `cd server && docker compose up -d --build`
4. 放行 8080：
   - GCP：控制台「VPC 网络 → 防火墙」加一条入站规则，来源 `0.0.0.0/0`、协议端口 TCP 8080。
   - 港 VPS：一般默认开；若不开就放行。
5. 车机 APK：未登录页点「服务器设置」或进入设置页修改地址：
   - 未启用 `GATE_KEY`：填 `http://<服务器IP>:8080`
   - 已启用 `GATE_KEY`：后端地址仍填 `http://<服务器IP>:8080`，并在旁边的“访问口令（可选）”填写口令

## 官方镜像 vs 自己构建
- 默认用作者官方镜像 `moefurina/ncm-api:latest`，`docker compose up -d` 直拉（省去构建）。
- 想更透明（自己审代码构建）：把 docker-compose.yml 里 `api` 服务的 `image:` 改成
  `build: { context: .., dockerfile: server/Dockerfile.api }`，Dockerfile.api 会 git clone 源码自建。

## 车机截图调试

截图调试是可选能力，默认关闭：

1. 使用 feedback 变体构建 APK：`cd android && gradlew assembleFeedback`。
2. VPS `server/.env` 增加 `DEBUG_UPLOAD_ENABLED=true`，再重建 Web 容器。
3. APK 设置页开启「Debug 模式」。
4. 各页面右上角会显示「截图」按钮；点击后由原生 WebView 截图并上传到当前网关。
5. Docker 部署的截图保存在服务器仓库的 `server/debug-screenshots/`，每次上传生成同名 `.jpg` 和 `.json` 元数据文件。
6. APK 会先把长边压到不超过 1280×720，再以 JPEG 72% 质量上传；网关限制为 JPEG 且单张不超过 2MB。
7. 截图上传沿用 `GATE_KEY` 鉴权；该目录应保持私有，不要公开托管。

构建产物：

- 标准无反馈版：`android/app/build/outputs/apk/debug/app-debug.apk`
- 私有反馈版：`android/app/build/outputs/apk/feedback/app-feedback.apk`

公开发布建议使用标准 `assembleDebug`/`assembleRelease` 产物：其中不显示 Debug 模式入口，原生截图接口也会拒绝执行。即使有人自行构造请求，VPS 未设置 `DEBUG_UPLOAD_ENABLED=true` 时截图端点也返回 404。

检查最近上传的文件：

```bash
cd ~/ncm-cs11/server
find debug-screenshots -maxdepth 1 -type f -printf '%T@ %f %s bytes\n' \
  | sort -nr | head
```

下载最新截图到本机查看：

```bash
gcloud compute ssh <实例名> --zone <区域> \
  --command "cd ~/ncm-cs11/server && find debug-screenshots -type f -name '*.jpg' -printf '%T@ %f\n' | sort -nr | head -1"
gcloud compute scp <实例名>:~/ncm-cs11/server/debug-screenshots/<文件名>.jpg . --zone <区域>
```

若车机提示“截图上传失败”，依次检查：

1. VPS 是否已部署 v1.1.9 对应网关：`grep -n 'image/jpeg' ~/ncm-cs11/server/gateway.js`。
2. Web 容器是否已重建：`cd ~/ncm-cs11/server && sudo docker compose up -d --build web`。
3. `server/debug-screenshots/` 是否存在且 Docker 可写；Compose 会自动挂载该目录。
4. APK 中的后端地址与访问口令是否和 VPS 当前 `GATE_KEY` 一致。

已验证样例：真机 `JAD-AL50`、Android 12、页面 `settings`、缩放 70%、原始尺寸 2597×1118，压缩后 JPEG 约 29KB，公网上传成功。

## 460 cheating（海外部署必看）
网易对「非中国大陆 IP」的请求返回 `460 cheating`。本地（国内 IP）没事；**部署到 GCP 美区 / 港 VPS 必撞**，取歌登录全挂。
解法：docker-compose 已给 api 开 `ENABLE_RANDOM_CN_IP=true`，自动给每个请求套随机国内 IP（设 `X-Real-IP`），网易当作国内放行。无需手动传 `?realIP=`。

## 流量 & 侵权
- **音频直走网易云 CDN**（m801.music.126.net），不经服务器；VPS 只扛 Web UI(~18KB)+API JSON(每次几 KB)，1G/月用不完。
- 单用户私用风险低；海外 VPS 无 ICP、不易被发现，规避国内公开服务被网易投诉下架的风险。
- GCP 免费档只有美区 → 到国内车机延迟 200-400ms（点歌慢约半秒）；港/东京 VPS 低延迟更舒服。
- 切歌延迟已消除：前端起播时预取下一首 URL（直链有效期约 20 分钟），方控/自动连播瞬时起播；跨洋 RTT 只剩点播第一首那一跳。
