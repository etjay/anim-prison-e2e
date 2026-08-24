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

# 3) 安装并登录 DevTools（见第 3 节），确认 CLI 可用

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

- **macOS（需求设计默认平台）**：从官方下载页下载 stable 版 `.dmg`，拖入 `Applications`。
- **Linux**：下载 stable 版 `.deb`，安装后 CLI 位于 `~/.wechatwebdevtools/cli`。
- **Windows**：安装后 CLI 位于 `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`。

> ⚠️ 本仓库当前 CI/构建机为 **Linux**（见“假设清单”），与需求设计默认的 macOS 不同。脚本已做跨平台 CLI 路径推断，可用 `DEVTOOLS_CLI` 环境变量显式覆盖，避免版本/路径漂移。

### 3.2 登录

1. 启动 DevTools → 用开发者微信号登录（需具备小程序开发者身份，或使用测试号 / 体验 appid）。
2. 骨架工程使用 `appid: touristappid`（测试号），登录后可直接打开，无需正式 appid。
3. 登录状态会持久化；`npm run build` / `npm run devtools` 走 CLI 时复用该登录态。

### 3.3 CLI 路径

| 平台 | 默认 CLI 路径 |
|------|--------------|
| macOS | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |
| Linux | `~/.wechatwebdevtools/cli` |
| Windows | `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` |

`scripts/devtools-build.js` 的解析优先级：
1. 环境变量 `DEVTOOLS_CLI`（推荐显式指定，最稳）；
2. 按平台默认路径推断。

若两者都拿不到或路径不存在，脚本**显式报错退出（exit 2）**，不静默绕过——此时按 T1.1 协调约束上报阻塞。

### 3.4 版本记录

| 项 | 值 | 记录时间 | 记录人 |
|----|----|---------|--------|
| DevTools 版本 | **待本机安装后回填**（stable，安装后 `关于` 中记录版本号） | 2026-08-24 | 客户端开发 |
| DevTools CLI 路径 | 见 3.3；当前构建机为 Linux → `~/.wechatwebdevtools/cli`（本机未安装，待 T1.1 环境落地后确认） | 2026-08-24 | 客户端开发 |
| Node.js | v22.22.1 | 2026-08-24 | 客户端开发 |
| npm | 10.9.4 | 2026-08-24 | 客户端开发 |
| 构建机 OS | Linux（Ubuntu, x86_64） | 2026-08-24 | 客户端开发 |

> 需求设计锁定 “DevTools stable 锁版本”。安装后请将具体版本号回填上表并 `git commit`，供 stage2/3 与 CI 对齐。

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

1. **开发机 OS**：需求设计默认 macOS；**当前构建机为 Linux**（已做跨平台适配，`DEVTOOLS_CLI` 可覆盖）。
2. **无现成 CI 平台**：stage3 默认 GitHub Actions；CI 阶段（T3.x）不在本期验收。
3. 其余：Node ≥ 18；DevTools stable 锁版本；原生小程序；一期不上真机。
4. 客户端与 mock 的接口契约见 `mock-server/README.md`（由 T1.2 实现，错误码约定已在客户端 `bind` / `home` / `canteen` 页面对齐）。

## 6. 故障排查

| 现象 | 排查 |
|------|------|
| `npm run build` 报“未找到 DevTools CLI” | DevTools 未安装 / 未登录 / 路径异常；用 `DEVTOOLS_CLI=/实际路径 npm run build`；仍不行→按协调约束上报阻塞 |
| 页面报 `network error` | mock-server 未启动，或端口与 `BASE_URLS` 不一致；骨架期各页有内置 stub 兜底，可继续手动走通 |
| `http` 跨域/合法域名报错 | 确认 `project.config.json` 的 `urlCheck=false`；或在 DevTools「详情→本地设置」勾选“不校验合法域名” |
| 绑定报错码 `BIND_INVALID` / `BIND_DUPLICATE` | 属预期分支（错误邀请码 / 重复绑定），与 T1.2 API 文档错误码一致，用于 stage2 异常用例 |
| lint 报 `no-undef: wx/App/Page` | 检查 `.eslintrc.cjs` 的 `globals` 是否被误改 |