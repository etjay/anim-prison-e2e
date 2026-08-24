# anim-prison-e2e

动物监狱经营小程序（ANIM-2）的 **E2E 开发验证环境** monorepo（一期）。
本仓库服务于 ANIM-3《搭建微信小程序 E2E 开发验证环境》一期 stage1：
客户端环境与原生小程序骨架（T1.1，本仓库当前已交付）+ 服务端 mock（T1.2）并行。

> 详细环境说明见 [docs/environment.md](docs/environment.md)（含 DevTools 安装/登录/CLI 路径、版本记录、假设清单、故障排查）。

## 目录结构

```
anim-prison-e2e/
├── package.json              # 根脚本：lint / build / devtools
├── .eslintrc.cjs             # ESLint（覆盖 miniprogram/ 与 scripts/ 的 JS）
├── scripts/
│   └── devtools-build.js     # DevTools CLI 构建脚本（跨平台 CLI 路径解析）
├── miniprogram/              # 原生小程序骨架（5 页）
│   ├── app.js / app.json / app.wxss / sitemap.json
│   ├── project.config.json   # DevTools 工程配置（appid: touristappid）
│   ├── config/env.js         # 多环境 baseURL（dev / preview 可切）
│   ├── utils/request.js      # wx.request 封装（baseURL + token 注入）
│   └── pages/
│       ├── login/            # 登录（入口，stub 登录 + 手动走通）
│       ├── welcome/          # 欢迎（未绑定态）
│       ├── bind/             # 邀请码绑定（含错误码分支）
│       ├── home/             # 首页：地图 + 动物卡片
│       └── canteen/          # 食堂：互动提交 + 评分查询
├── mock-server/              # 服务端 mock（T1.2 边界，见其 README 的接口契约）
├── e2e/                      # E2E 框架与用例（stage2 边界，见其 README）
└── docs/
    └── environment.md        # 环境搭建 / DevTools / 版本记录 / 故障排查
```

## 前置依赖

- Node.js ≥ 18（当前构建机 v22.22.1）、npm
- 微信开发者工具 **stable**（锁版本；安装 / 登录 / CLI 路径见下）
- git

## 从零搭建（含 DevTools 安装 / 登录 / CLI 路径）

```bash
git clone <本仓库 remote 地址> anim-prison-e2e && cd anim-prison-e2e
npm install            # 安装 eslint
npm run lint           # 校验代码，期望 0 error
npm run devtools       # 用 DevTools CLI 打开 miniprogram/（手动走通 5 页）
npm run build          # DevTools CLI build-npm（校验/构建 miniprogram 工程）
```

### DevTools 安装 / 登录 / CLI 路径（简版，详见 docs/environment.md）

- **安装**：官方下载页取 **stable** 版（macOS `.dmg` / Linux `.deb` / Windows 安装包）。
- **登录**：启动 DevTools 用开发者微信号登录；本工程用测试 appid（`touristappid`）即可打开。
- **CLI 路径**（`scripts/devtools-build.js` 按此推断，可用 `DEVTOOLS_CLI` 覆盖）：

  | 平台 | CLI 路径 |
  |------|---------|
  | macOS | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |
  | Linux | `~/.wechatwebdevtools/cli` |
  | Windows | `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` |

  ```bash
  DEVTOOLS_CLI=/path/to/cli npm run build   # 显式指定 CLI（推荐，避免路径漂移）
  ```

- **版本记录**：官方当前 stable = **2.02.2608040（2026-08-18，Win/macOS，无一方 Linux 包）**，已记入 `docs/environment.md`；Linux 机按 3.1 路径 A/B 选定具体构建后回填“本机锁定版本”。Node/npm/OS 已记录：v22.22.1 / 10.9.4 / Linux（owner 已确认为 dev/test 运行机）。

## 5 页手动走通（DevTools）

1. 打开工程后，首页即 **登录**（`pages/login`）。
2. 点“微信一键登录”（stub 调 `POST /api/auth/login`）→ 未绑定跳 **欢迎**（`welcome`）。
   - 若未启动 mock-server，登录失败会给出手动入口，可直达欢迎/首页。
3. **欢迎** → “用邀请码绑定小动物” → **邀请码绑定**（`bind`）输入邀请码（stub 调 `POST /api/bind`）。
   - 错误邀请码 → `BIND_INVALID`；重复绑定 → `BIND_DUPLICATE`（错误码对齐 T1.2）。
4. 绑定成功 → **首页**（`home`）：展示动物卡片 + 监狱地图（`GET /api/animal`，离线有内置兜底）。
5. 首页 → “去食堂互动” → **食堂**（`canteen`）：`POST /api/interaction` 喂食 + `GET /api/rating` 评分。

> 未启动 mock-server 时，各页面均有内置 stub 数据兜底，仍可完整手动走通 5 页。

## 多环境切换（dev / preview）

编辑 `miniprogram/config/env.js`：

```js
const CURRENT_ENV = 'dev'; // 'dev' | 'preview'
const BASE_URLS = { dev: 'http://127.0.0.1:3000', preview: 'http://127.0.0.1:3001' };
```

`dev` 指向本地 mock（3000），`preview` 指向另一端口/远程 mock（3001）；运行期 baseURL 亦可在 `getApp().globalData.baseURL` 覆盖。

## 根脚本

| 命令 | 作用 |
|------|------|
| `npm run lint` | ESLint 校验（`miniprogram/` + `scripts/`） |
| `npm run build` | DevTools CLI `build-npm`（校验/构建 miniprogram 工程） |
| `npm run devtools` | DevTools CLI `open`（打开工程，便于手动走通） |

> `npm run e2e` 由 stage2（T2.x）添加；`mock-server` 的运行脚本由 T1.2 提供。

## 边界（T1.1 协调约束）

- 本 issue 仅负责：仓库根 + `miniprogram/` + `docs/`（环境部分）+ `scripts/`。
- `mock-server/`（T1.2）、`e2e/`（stage2）只建目录 + 边界 README，不写其业务代码。
- DevTools 缺失 / 未登录 / CLI 路径异常时，`npm run build` 会显式报错（exit 2）——此时按协调约束上报阻塞，不静默绕过。