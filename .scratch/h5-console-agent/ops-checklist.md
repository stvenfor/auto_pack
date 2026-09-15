# Build Host 外网访问方案（H5 Console + Agent + Tunnel）

本文说明：如何让**手机 / 外网电脑**通过公网 HTTPS 访问共享 macOS Build Host 上的 Auto Pack H5 Console，并触发本机构建。

相关决策见 `docs/adr/0009-h5-via-local-agent-and-ops-tunnel.md`、`CONTEXT.md`（Build Host / Agent / Access Token / Tunnel / H5 Console）。

---

## 1. 目标与边界

### 要达成什么

- 团队成员用手机或外网浏览器打开一个 **HTTPS 公网地址**
- 输入共享 **Access Token** 后，使用与桌面 Console **基本对等**的能力（Readiness、Branch、多 Target Run、日志、安装结果）
- 实际打包仍在 **Build Host 本机**执行（App Root、签名、Fastlane、Flutter）

### 明确不做

| 不做 | 原因 |
|------|------|
| Auto Pack 内置 cpolar / 一键开隧道 | Tunnel 属运维层（ADR 0009） |
| Agent 默认监听 `0.0.0.0` | 缩小暴露面；外网只经 Tunnel |
| Windows Build Host | 本阶段不做 |
| 个人账号 / SSO | 仅共享 Access Token |
| 构建排队 | 忙则拒绝 |

---

## 2. 架构（谁连谁）

```
[手机 / 外网浏览器]
        │  HTTPS
        ▼
[cpolar 等公网入口]  ──隧道──►  127.0.0.1:8787
                                      │
                                      ▼
                         [Auto Pack Agent]
                         · 静态 H5（/）
                         · API（/api/*，需 Bearer Token）
                                      │
                                      ▼
                         [ConsoleControl → Fastlane / Flutter]
                         · 读写 App Root、artifacts、.env
```

要点：

1. **Agent 只绑 loopback**（`127.0.0.1`），本机以外直连不到。
2. **Tunnel** 把「公网 HTTPS」映射到「本机 8787」；Auto Pack 不管理 Tunnel。
3. **鉴权**在 Agent：没有正确 `Authorization: Bearer <AGENT_ACCESS_TOKEN>`，`/api/*` 返回 401。
4. 桌面 Electron Console 仍可本机使用；与 Agent **共享构建互斥锁**（同时只能有一个构建类 Run）。

---

## 3. 角色与物料

| 角色 | 职责 |
|------|------|
| Build Host 管理员 | 维护 Mac、工具链、`.env`、启动 Agent、维护 Tunnel、保管 Token |
| 远端使用者 | 打开公网 URL、输入 Token、触发打包 / 看结果 |

| 物料 | 说明 |
|------|------|
| 共享 macOS | 已装 Flutter/FVM、Fastlane、Xcode、Android SDK、DevEco（按需） |
| `auto_pack` 仓库 | 含 `bin/agent`、`h5/` |
| `.env` | 至少：`APP_ROOT`、`AGENT_ACCESS_TOKEN`；上传还需 `PGYER_API_KEY` 等 |
| cpolar（或 ngrok 等）账号 | 在 [cpolar 控制台](https://dashboard.cpolar.com/get-started) 注册并本机安装客户端 |

---

## 4. Build Host 一次性准备

### 4.1 配置 `.env`

在 `auto_pack/.env` 中（**勿把真实 Token / Key 提交到 git**）：

```bash
APP_ROOT=/absolute/path/to/your-flutter-app

# 必填：团队共享口令（建议长随机串）
AGENT_ACCESS_TOKEN=请换成足够长的随机字符串

# 可选
# AGENT_PORT=8787
# AGENT_HOST=127.0.0.1   # 不要改成 0.0.0.0

PGYER_API_KEY=...
# PGYER_MERGED_INSTALL_URL=...
```

生成 Token 示例：

```bash
uuidgen | tr '[:upper:]' '[:lower:]'
```

把生成结果写入 `AGENT_ACCESS_TOKEN`，并只通过安全渠道发给要用的同事。

### 4.2 安装并登录 cpolar

1. 打开 [cpolar 控制台](https://dashboard.cpolar.com/get-started)，注册 / 登录。
2. 按官网说明在 **Build Host（这台 Mac）** 安装 cpolar CLI 或桌面客户端并完成登录。
3. 确认本机可执行 `cpolar version`（或客户端已登录）。

（若改用 ngrok / Cloudflare Tunnel，映射目标同样是 `127.0.0.1:8787`，步骤类比即可。）

### 4.3 确认本机可访问 Agent（隧道前自检）

```bash
cd /path/to/auto_pack
npm run agent
```

期望日志：

```text
[agent] listening on http://127.0.0.1:8787 (loopback only)
```

另开终端：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/api/readiness
# 期望 401（未带 Token）

curl -s -H "Authorization: Bearer 你的AGENT_ACCESS_TOKEN" \
  http://127.0.0.1:8787/api/readiness | head
# 期望 JSON，含 appRoot / canBuild 等
```

本机浏览器打开 `http://127.0.0.1:8787/`，输入 Token，能进主界面后再开隧道。

---

## 5. 每次开机 / 需要外网访问时的启动顺序

**顺序固定：先 Agent，再 Tunnel。**

### 步骤 A — 启动 Agent

```bash
cd /path/to/auto_pack
npm run agent
```

保持该终端不关（或用 `launchd` / `tmux` 常驻，由运维自行选择）。

### 步骤 B — 启动 Tunnel（映到 8787）

任选一种方式。

**方式 1：命令行（适合临时）**

```bash
cpolar http 8787
```

终端会打印类似：

```text
Forwarding    https://xxxx.cpolar.cn -> http://127.0.0.1:8787
```

把 **`https://xxxx.cpolar.cn`**（以你屏幕上为准）发给使用者。

**方式 2：cpolar 控制台固定隧道（适合团队长期用）**

1. 登录 [cpolar 控制台](https://dashboard.cpolar.com/get-started)
2. 创建 / 编辑隧道：
   - 协议：HTTP
   - 本地地址：`127.0.0.1:8787`（或 `8787`）
   - 域名：按套餐选择临时域名或保留域名
3. 本机启动该隧道（客户端或 `cpolar start <隧道名>`，以你安装的客户端文档为准）
4. 在控制台「状态 / 在线隧道」复制 **公网 HTTPS URL**

注意：

- 免费临时域名**重启后可能变化**；长期给团队用建议固定域名或每次广播新 URL。
- **不要**把 `AGENT_HOST` 改成公网网卡地址来「省掉隧道」。

### 步骤 C — 健康检查（外网侧）

在**另一台网络**的机器或手机（不要只测本机）打开公网 URL：

1. 能加载 H5 登录页 → 隧道通、静态资源通  
2. 输入 Token 能进主界面 → API 鉴权通  
3. 能看到 Readiness → Agent 与 App Root 配置基本正常  

---

## 6. 手机 / 外网电脑如何使用（使用者视角）

### 6.1 打开

1. 用系统浏览器（iOS Safari / Android Chrome / 电脑 Chrome 等）打开管理员发来的 **HTTPS** 链接。  
2. 应看到标题类似「Auto Pack · H5 Console」和 Access Token 输入框。  
3. **不要**用 IP + 随机端口瞎猜；只用管理员给的完整 `https://…` URL。

### 6.2 登录

1. 输入管理员提供的 Access Token（与 Build Host `.env` 中 `AGENT_ACCESS_TOKEN` 相同）。  
2. 点「保存并连接」。  
3. 成功后 Token 保存在该浏览器的 `sessionStorage`（关标签后通常还在；清站点数据或换浏览器需重输）。

失败对照：

| 提示 / 现象 | 处理 |
|-------------|------|
| Token 无效 / 401 | Token 抄错、前后空格、或 Agent 用的不是这份 `.env` |
| 一直转圈 / 无法连接 | Tunnel 或 Agent 挂了；找管理员 |
| 能开页但点按钮全失败 | 多半 API 未到 Agent（映错端口） |

### 6.3 日常操作建议顺序

1. 看 **Readiness**（App Root、检查项、当前 Branch）。  
2. 需要时：**设置 App Root（绝对路径）** —— 路径是 Build Host 磁盘上的路径，不是手机本地路径。  
3. 需要时：**切换 Branch**（工作区干净且无构建进行中）。  
4. 勾选 **Targets**（android / ios / harmony × mode）。  
5. 可选填写 **Install Note**、勾选 PRODUCT。  
6. 点 **构建** / **上传** / **构建并上传**。  
7. 下方看 **Run 日志**；结束后在 **安装结果** 看 Merged 链接或各端二维码。  

约束（与桌面一致）：

- 已有构建类 Run 时，再点构建会被拒绝（提示忙），**不会排队**。  
- Harmony release 可构建，通常不能上传蒲公英。  
- 取消只作用于**当前 Agent 进程内**认识的 Run。

### 6.4 手机使用注意

- 建议竖屏；页面已按窄屏排布。  
- 保持屏幕常亮或勿杀浏览器，长构建时日志靠 SSE；断线可刷新页面并重新连接（Token 仍在则可自动进主界面）。  
- 二维码在结果区展示；用**另一台手机**扫码安装更方便。  
- 蜂窝网络即可，**不要求**与 Build Host 同一 Wi‑Fi。

---

## 7. 安全与权限约定

1. **公网 URL ≈ 半公开入口**：依赖 Token；URL 仍应尽量只发给需要的人。  
2. **Token 轮换**：人员变动或怀疑泄露时，改 `.env` 中 `AGENT_ACCESS_TOKEN` 并重启 Agent，通知全员换新 Token。  
3. **HTTPS**：优先用 cpolar 提供的 https 域名；避免明文 http 公网。  
4. **不要**在群里同时发 URL + Token 长期置顶；Token 单独私发更稳妥。  
5. Build Host 上 Electron 与 Agent 勿同时开两个构建；互斥锁会挡，但操作上约定「以一台机、一个入口为主」更清晰。

---

## 8. 日常运维 / 故障排查

| 现象 | 排查顺序 |
|------|----------|
| 外网打不开 | ① Agent 是否在听 8787 ② cpolar 是否在线 ③ URL 是否最新 |
| 本机 `127.0.0.1:8787` 都打不开 | 只查 Agent / 端口占用：`lsof -iTCP:8787 -sTCP:LISTEN` |
| 401 | Token；`.env` 是否被 Agent 进程加载到 |
| 忙 / already active | 是否 Electron 或另一终端已在构建；看 `artifacts/.build-run.lock` |
| Branch 切换失败 | App Root 是否 git、工作区是否脏、是否在构建中 |
| 能构建不能上传 | `PGYER_API_KEY`；Target 是否含不可上传组合 |
| 日志不刷新 | 刷新页面重连 SSE；检查隧道是否缓冲/中断长连接（换隧道产品或套餐） |

停止外网访问时建议顺序：先停 Tunnel，再停 Agent（或反之亦可，但先停 Tunnel 可立刻切断公网）。

---

## 9. 最小检查清单（可打印）

管理员每日 / 每次开放外网：

- [ ] `.env` 中 `APP_ROOT`、`AGENT_ACCESS_TOKEN` 正确  
- [ ] `npm run agent` 日志为 loopback 8787  
- [ ] 本机 curl Readiness（带 Token）成功  
- [ ] cpolar 映到 `127.0.0.1:8787` 且状态在线  
- [ ] 复制 **HTTPS** 公网 URL 发给使用者  
- [ ] 用手机试开：Token → 见 Readiness  

使用者：

- [ ] 打开 HTTPS 链接  
- [ ] 输入 Token 并连接  
- [ ] 勾选 Target 后触发一次构建或构建并上传  
- [ ] 能看日志与安装结果  

---

## 10. 与产品命令对照

| 动作 | 命令 / 位置 |
|------|-------------|
| 启 Agent | `npm run agent`（或 `node bin/agent`） |
| 默认地址 | `http://127.0.0.1:8787/` |
| Token 环境变量 | `AGENT_ACCESS_TOKEN` |
| 端口 | `AGENT_PORT`（默认 8787） |
| 隧道示例 | `cpolar http 8787` |
| 桌面 Console（本机） | `npm start`（不经隧道） |

---

**一句话**：外网访问 = **Build Host 上 Agent（127.0.0.1:8787）+ 运维隧道给出的 HTTPS URL + 浏览器里填 Access Token**；手机和外网电脑都只做「打开链接 → 填 Token → 操作 Console」。
