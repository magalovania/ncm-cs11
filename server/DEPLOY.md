# 部署到 VPS（GCP 免费档 / 港或东京 VPS 通用）

## 先看作者须知（已对照）
- **只自己部署、自己用，别用别人的公开服务**（会泄露账号）。我们是自部署，OK。
- 自己的实例也别公网裸奔：别把地址公开/被搜索引擎收录；GCP 可用防火墙规则限制来源 IP。
- API 的 GET 会被缓存 2 分钟 → 前端已给每次请求加 `_t` 时间戳规避（**二维码登录必须带**，否则拿到旧 key 扫不出）。
- cookie：前端只用 `MUSIC_U`，走同源 `/api` 代理 + `?cookie=` 回放，跨域问题已规避。

## 步骤（Docker）
1. 服务器装好 Docker + Docker Compose（GCP e2-micro 用 Debian/Ubuntu 一键脚本即可）。
2. 把仓库传上去：`git clone <你的仓库>`，或把 `server/ web/ .dockerignore` scp 过去。
3. `cd server && docker compose up -d --build`
4. 放行 8080：
   - GCP：控制台「VPC 网络 → 防火墙」加一条入站规则，来源 `0.0.0.0/0`、协议端口 TCP 8080。
   - 港 VPS：一般默认开；若不开就放行。
5. 车机 APK：「设置 → 修改服务器地址」填 `http://<服务器IP>:8080`，保存即连。

## 官方镜像 vs 自己构建
- 默认用作者官方镜像 `moefurina/ncm-api:latest`，`docker compose up -d` 直拉（省去构建）。
- 想更透明（自己审代码构建）：把 docker-compose.yml 里 `api` 服务的 `image:` 改成
  `build: { context: .., dockerfile: server/Dockerfile.api }`，Dockerfile.api 会 git clone 源码自建。

## 460 cheating（海外部署必看）
网易对「非中国大陆 IP」的请求返回 `460 cheating`。本地（国内 IP）没事；**部署到 GCP 美区 / 港 VPS 必撞**，取歌登录全挂。
解法：docker-compose 已给 api 开 `ENABLE_RANDOM_CN_IP=true`，自动给每个请求套随机国内 IP（设 `X-Real-IP`），网易当作国内放行。无需手动传 `?realIP=`。

## 流量 & 侵权
- **音频直走网易云 CDN**（m801.music.126.net），不经服务器；VPS 只扛 Web UI(~18KB)+API JSON(每次几 KB)，1G/月用不完。
- 单用户私用风险低；海外 VPS 无 ICP、不易被发现，规避国内公开服务被网易投诉下架的风险。
- GCP 免费档只有美区 → 到国内车机延迟 200-400ms（点歌慢约半秒）；港/东京 VPS 低延迟更舒服。