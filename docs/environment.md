# 环境搭建与 DevTools 说明（T1.1 环境部分）

本文档覆盖：从零搭建客户端环境、微信开发者工具（DevTools）安装 / 登录 / CLI 路径、版本记录、多环境切换、假设清单、故障排查。

> 需求设计依据：父 issue ANIM-3「需求设计与分阶段任务清单 v0.2」。Q3 两项按“文档化假设”处理。

## 1. 前置依赖

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 18（当前构建机 v22.22.1） | 供 `npm run lint` / `npm run build` 脚本运行 |
| npm | 随 Node 附带（当前 10.9.4） | 安装 eslint 等 devDependencies |
| 微信开发者工具 | **stable**（锁版本，见下节“版本记录”） | 打开 / 构建小程序工程，供 E2E 复用 |
| git | ≥ 2.x | 拉取 / 推送本仓库 |

## 2. 从零搭建（干净机器）

```bash
# 1) 拉取仓库
git clone <本仓库 remote 地址> anim-prison-e2e
cd anim-prison-e2e

# 2) 安装 devDependencies（仅 eslint）
npm install

# 3) 安装社区版 DevTools（Linux；官方当前世代无一方 Linux 包，见第 3 节）：
scripts/install-devtools.sh        # 下载 → sha256 校验 → 解包到 ~/wechat-devtools
#    GUI 扫码登录是手动步骤（见 3.2）；构建/校验（build-npm）无需先登录

# 4) 校验代码
npm run lint          # 期望：0 error

# 5) 用 DevTools CLI 打开工程（手动走通 5 页）
npm run devtools      # 等价于 <cli> open --project miniprogram
# 或在 DevTools GUI 中「导入项目」-> 选择 miniprogram/ 目录

# 6) DevTools CLI 构建
npm run build         # 等价于 <cli> build-npm --project miniprogram

# 7)（可选）启动本地 mock 服务后，页面即可连真实 stub 接口
#    mock-server 由 T1.2 提供，默认端口 dev=3000 / preview=3001
```

## 3. 微信开发者工具（DevTools）

### 3.1 安装

> **实测结论（2026-08-24，客户端开发）**：查询官方下载数据源 `https://devtools.wxqcloud.qq.com.cn/WechatWebDev/nightly/versions/config.json`，当前 **stable = 2.02.2608040（2026-08-18）**，官方下载矩阵仅 **Windows x64 / macOS x64(.pkg) / macOS ARM64(.pkg)**；官方 CLI 文档（`devtools/cli.html`）也只列 macOS 与 Windows 两个 CLI 路径。**当前世代 DevTools 无一方 Linux 安装包**（2.01 之前的旧世代曾提供 Linux `.deb`）。

据此，在**本 Linux 机**上落地 DevTools 有两条路径：

> **已交叉验证（2026-08-24）**：遍历官方全部渠道（stable / rc / nightly / nightly-old / legacy 1.05）的下载矩阵、`download_redirect` 端点的 `type` 取值（`x64`/`ia32`/`darwin`/`arm64`，**无 `linux`**）、可解析的 release 目录（2.02 / 2.01 / 晚 1.06 共用 `be1ec64c…` 目录，均无 `.deb`）与版本历史（`history_stable.json`，含 1.06 系列与 2020–2021 `YYYY.MM.DD` 系列）——**当前世代官方无任何 Linux 安装包**。Linux `.deb` 属旧世代（≤1.06 / 2020–2021）产物；其**确切 `.deb` URL/版本待 owner 确认**（旧世代 release 目录 hash 无法经 `download_redirect` 解析，盲探 dldir1 未命中）。确认后立即下载 → 校验（ar/deb magic）→ 安装 → 锁定。
- **路径 A（本仓库脚本默认目标）**：安装一份可用的 **Linux DevTools `.deb`（旧世代 / 社区维护）**，CLI 位于 `~/.wechatwebdevtools/cli`，并用 `DEVTOOLS_CLI` 显式锁定，锁定版本记入 3.4。
- **路径 B**：DevTools GUI 跑在 **macOS 主机**（2.02 stable，官方首推平台）；Linux 机只承载代码 / mock / e2e，`npm run build` 通过 `DEVTOOLS_CLI` 指向 macOS 上的 CLI（或改为 macOS 上执行）。

> **✅ 已落地（2026-08-24，owner 确认走路径 A）**：选用**社区移植版** [msojocs/wechat-web-devtools-linux](https://github.com/msojocs/wechat-web-devtools-linux)（活跃维护），release **v2.01.2510290-2**（对应上游 DevTools **2.01.2510290**，2026-04-15 发布）。各平台官方安装包：
- **macOS（官方首推）**：stable 2.02.2608040 `.pkg`（下载页/`download_redirect?type=darwin`）。
- **Windows**：stable `.exe`（`download_redirect?type=x64`）。
- **Linux**：当前无一方 stable 包 → **已用路径 A 的社区移植版**（见上方“已落地”），或路径 B 用 macOS。

> ⚠️ 本仓库 CI/构建机为 **Linux**（owner 已确认 dev/test 环境 = 本 Linux 机，见 issue 评论）。脚本已做跨平台 CLI 路径推断，可用 `DEVTOOLS_CLI` 环境变量显式覆盖，避免版本/路径漂移。

### 3.2 登录

1. 启动 DevTools → 用开发者微信号登录（需具备小程序开发者身份，或使用测试号 / 体验 appid）。
2. 骨架工程使用 `appid: touristappid`（测试号），登录后可直接打开，无需正式 appid。
3. 登录状态会持久化；`npm run build` / `npm run devtools` 走 CLI 时复用该登录态。

### 3.3 CLI 路径

| 平台 | 默认 CLI 路径 | 官方文档 |
|------|--------------|---------|
| macOS | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` | 有（`<安装路径>/Contents/MacOS/cli`） |
| Windows | `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` | 有（`<安装路径>/cli.bat`） |
| Linux（社区移植版，本机） | `~/wechat-devtools/app/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli` | 未列（社区移植版；脚本自动发现，可用 `DEVTOOLS_CLI`/`DEVTOOLS_ROOT` 覆盖） |

`scripts/devtools-build.js` 的解析优先级：
1. 环境变量 `DEVTOOLS_CLI` / `DEVTOOLS_ROOT`（可选，显式覆盖）；
2. 自动在 `~/wechat-devtools` 下发现社区移植版布局（含 `nwjs/` 与 `bin/wechat-devtools-cli`）；
3. 按平台默认路径推断（macOS/Windows）。

若都拿不到或路径不存在，脚本**显式报错退出（exit 2）**，不静默绕过——此时按 T1.1 协调约束上报阻塞。

### 3.4 版本记录

| 项 | 值 | 记录时间 | 记录人 |
|----|----|---------|--------|
| DevTools 当前 stable 版本（官方数据源） | **2.02.2608040**（发布 2026-08-18；官方矩阵 Win/macOS，无一方 Linux 包） | 2026-08-24 | 客户端开发 |
| 本机锁定使用的 DevTools 版本 | **WeChat DevTools 2.01.2510290**（经社区移植版 msojocs/wechat-web-devtools-linux **v2.01.2510290-2** 安装，release 2026-04-15）。sha256 锁于 `scripts/install-devtools.sh` | 2026-08-24 | 客户端开发 |
| DevTools CLI 路径 | `~/wechat-devtools/app/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli`（存在性已验证；脚本自动发现，`DEVTOOLS_CLI`/`DEVTOOLS_ROOT` 可覆盖） | 2026-08-24 | 客户端开发 |
| 登录状态 | **未登录**（`wechat-devtools-cli islogin` → `{"login":false}`）；扫码登录为手动步骤：`DISPLAY=:97 wechat-devtools-cli login`。构建/校验（build-npm）无需登录；preview/upload 需先登录 | 2026-08-24 | 客户端开发 |
| Node.js | v22.22.1 | 2026-08-24 | 客户端开发 |
| npm | 10.9.4 | 2026-08-24 | 客户端开发 |
| 构建/开发机 OS | Linux（Ubuntu, x86_64）——owner 已确认为 dev/test 运行机 | 2026-08-24 | 客户端开发 |

> 需求设计锁定 “DevTools stable 锁版本”。因官方 stable 2.02.2608040 无一方 Linux 包，Linux 机锁定 **社区移植版 v2.01.2510290-2（上游 2.01.2510290）**，sha256 锁于 `scripts/install-devtools.sh`，供 stage2/3 与 CI 对齐。

### 3.5 Linux 下运行（Xvfb + IDE + 服务端口）

社区移植版的 GUI 基于 nw.js/Chromium，**必须有一个 X11 显示**；而本机桌面会话是 Wayland（`DISPLAY=:10.0` 是 Wayland 显示，Chromium 的 X11 后端连不上，报 `Unable to open X display`）。因此：

1. **虚拟显示**：`scripts/devtools-build.js` 默认在 `:97` 起一个 **Xvfb**（软件渲染）：`Xvfb :97 -screen 0 1280x800x24`。可用 `WDT_DISPLAY` 环境变量改显示号。
2. **拉起 IDE**：CLI 通过 IDE 的「服务端口」驱动（`--enable-service-port`）。IDE 冷启动较慢（~5–10s），脚本会在 IDE 未运行时自动拉起它并等待其端口文件 `~/.config/wechat-devtools/Default/.ide` 就绪。
3. **无 GPU**：虚拟显示下加 `--disable-gpu` 走软件渲染。
4. **`npm run build` 已自包含**：冷启动（IDE 未运行）下，脚本会自动「起 Xvfb → 拉起 IDE → 等端口 → 调 CLI build-npm」，已验证端到端通过（exit 0）。骨架无 npm 依赖，build-npm 会打印 `__NO_NODE_MODULES__`（无包可打包，属正常），仍以 exit 0 完成工程校验。
5. **手动走通 5 页**：`npm run build -- --open` 会在 `:97` 上打开工程 GUI；可再用 VNC 连入 `:97`（如 `x11vnc -display :97`）操作，或直接把该显示投到某显示器。

> 依赖：`Xvfb`（`apt-get install -y x11vnc xfonts-base` 或 `xvfb`）。本机已安装（`xvfb 21.1.16`）。

## 4. 多环境切换（baseURL）

配置入口：`miniprogram/config/env.js`。

```js
const CURRENT_ENV = 'dev'; // 'dev' | 'preview'
const BASE_URLS = {
  dev: 'http://127.0.0.1:3000',
  preview: 'http://127.0.0.1:3001',
};
```

- 切换环境：改 `CURRENT_ENV` 常量（本地最省事），或为不同 DevTools 编译模式维护不同副本。
- `miniprogram/project.config.json` 中 `setting.urlCheck=false`，允许 `http` 明文请求本地 mock（开发期不校验合法域名）。
- 运行时 baseURL 从 `getApp().globalData.baseURL` 读取（`app.js` 启动时注入 `env.baseURL`），因此运行期也可被覆盖。

## 5. 假设清单（文档化，Q3 两项）

1. **开发机 OS**：owner 已确认 dev/test 运行机 = **本 Linux 机**（Ubuntu x86_64, Node v22.22.1 / npm 10.9.4）。已做跨平台适配，`DEVTOOLS_CLI` 可覆盖。
2. **DevTools 平台矩阵**：官方当前 stable 2.02.2608040 仅 **Win/macOS**，无一方 Linux 包（见 3.1）→ Linux 机已按路径 A 落地为**社区移植版 v2.01.2510290-2（上游 2.01.2510290）**，版本/sha256 锁定于 `scripts/install-devtools.sh`（见 3.5 的 Xvfb/IDE 运行方式）。
3. **无现成 CI 平台**：stage3 默认 GitHub Actions；CI 阶段（T3.x）不在本期验收。
4. 其余：Node ≥ 18；DevTools stable 锁版本；原生小程序；一期不上真机。
5. 客户端与 mock 的接口契约见 `mock-server/README.md`（由 T1.2 实现，错误码约定已在客户端 `bind` / `home` / `canteen` 页面对齐）。

## 6. 故障排查

| 现象 | 排查 |
|------|------|
| `npm run build` 报“未找到 DevTools CLI” | DevTools 未安装 / 未登录 / 路径异常；用 `DEVTOOLS_CLI=/实际路径 npm run build`；仍不行→按协调约束上报阻塞 |
| 页面报 `network error` | mock-server 未启动，或端口与 `BASE_URLS` 不一致；骨架期各页有内置 stub 兜底，可继续手动走通 |
| `http` 跨域/合法域名报错 | 确认 `project.config.json` 的 `urlCheck=false`；或在 DevTools「详情→本地设置」勾选“不校验合法域名” |
| 绑定报错码 `BIND_INVALID` / `BIND_DUPLICATE` | 属预期分支（错误邀请码 / 重复绑定），与 T1.2 API 文档错误码一致，用于 stage2 异常用例 |
| lint 报 `no-undef: wx/App/Page` | 检查 `.eslintrc.cjs` 的 `globals` 是否被误改 |