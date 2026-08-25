# E2E 环境交接文档（T2.5 · 一期整体验收节点）

本仓库 `etjay/anim-prison-e2e` 的 **E2E 开发验证环境完整交接**：干净开发机从零搭建、
全量套件运行、故障排查、假设清单、版本记录、FAQ。

> 配套文档：[environment.md](environment.md)（T1.1 客户端环境/DevTools 细节）、
> [api.md](api.md)（mock 接口契约，E2E 断言对齐基准）、
> [spike-devtools-automator.md](spike-devtools-automator.md)（T2.1 可行性 spike + Linux 前置清单）、
> [e2e/README.md](../e2e/README.md)（用例编写规范 + helper 用法 + 排查）。

## 1. 全量套件是什么（一期交付物一览）

| 组件 | 内容 | 所在分支（2026-08-25） |
|------|------|------------------------|
| monorepo + 小程序骨架（5 页）+ mock-server（5 stub API） | T1.1 / T1.2 | `main` @ `e91c8a6` |
| DevTools 自动化 spike 报告 | T2.1 | `main`（`a3d6e01` 及 `docs/`） |
| E2E 框架（Jest 30 + miniprogram-automator，helper 层，E2E_RECORD 录像） | T2.2 | `agent/agent/db00668796a0` @ `0505180` |
| 正向链路冒烟用例（`e2e/smoke/happy-path.test.js`，登录→绑定→首页→食堂喂食→评分） | T2.3 | `agent/agent/e0af70c4e342` @ `f462c62` |
| 异常分支用例（`unbound-welcome` / `bind-invalid-retry` / `bind-duplicate`） | T2.4 | `agent/agent/d71584c409a4` @ `c8976e3` |
| CI 流水线（GitHub Actions · Linux + 录像 artifacts） | T3.1/T3.2 | `agent/agent/691034ea5cfe-t32` @ `d851180`（in_review） |

**「全量套件」= T2.3 正向链路 + T2.4 异常分支（+ T2.2 琐碎用例），一条命令
`npm run e2e` 全绿。** 2026-08-25 实测（见 §5 复现记录）：合并 T2.3+T2.4 两分支后
`E2E_MOCK_PORT=3001 npm run e2e` → **5 suites / 10 tests 全绿，实耗 1m42s（< 5 分钟）**。

> 当前 T2.3/T2.4 用例尚未合入 `main`（各自 in_review/done，合入由小队长组织）。
> 复现全量套件需先把两分支合到同一工作树：
>
> ```bash
> git checkout -b full-suite origin/agent/agent/e0af70c4e342   # T2.2 框架 + T2.3
> git merge origin/agent/agent/d71584c409a4                    # + T2.4（无冲突）
> ```

## 2. 假设清单（设计假设 vs 实际）

| # | 假设（需求阶段记录） | 实际情况 / 偏差处理 |
|---|---------------------|--------------------|
| 1 | 开发机 macOS | 一期**文档目标平台为 macOS（官方 DevTools .pkg）**；本环境验证机为 Linux（owner 确认的 dev/test 运行机），用社区移植版 DevTools（见 §3）。两平台路径均给出，macOS 干净机未实测——验收口径：按 §4 步骤 macOS 估算 ≤30 分钟（实测计时见 §5，Linux 机） |
| 2 | 无现成 CI | 成立；T3.1/T3.2（GitHub Actions hosted Linux）并行交付中（in_review），CI 非本文档范围 |
| 3 | Node ≥ 18 | 实测 Node **v22.22.1** / npm **10.9.4**（满足） |
| 4 | DevTools stable 锁版本 | macOS 锁官方 stable **2.02.2608040**（2026-08-18，无一方 Linux 包）；Linux 锁社区移植版 **msojocs v2.01.2510290-2**（上游 DevTools 2.01.2510290，sha256 已固化在 `scripts/install-devtools.sh`）；CI 锁 vendor 基础库 **2.25.3**。基础库（libVersion）仓库内 pinned **2.25.3**（`project.config.json`；2.25.4 GUI 可选，2.31.0/latest 在移植版 CDN 404） |
| 5 | 原生小程序 | 成立（`miniprogram/` 原生 5 页，无框架） |
| 6 | 一期不上真机 | 成立：automator + Jest 全在 DevTools 内；automator API 隔离在 `e2e/helpers/runtime.js` 一层，二期换 minium/真机只动该文件 |
| 7 | 端口：mock dev=3000 | 本共享机 127.0.0.1:3000 被 Multica 前端容器占用 → **验证期 dev 统一用 3001**（`miniprogram/config/env.js` dev baseURL 已指 3001；T2.3 用例硬编码 3001 基线；T2.4 用例经 `E2E_MOCK_PORT` 对齐，默认 3000）。无冲突的干净机可改回 3000，但 T2.3 基线仍是 3001，故**文档标准路径统一 3001**（§4） |

## 3. 版本记录（实际环境，2026-08-25 复现时点）

| 项 | 版本 / 值 |
|----|----------|
| OS | Linux x64（验证机）；macOS 目标平台未实测 |
| Node / npm | v22.22.1 / 10.9.4 |
| DevTools（Linux） | 社区移植版 msojocs **v2.01.2510290-2**（上游 2.01.2510290）；安装于 `~/wechat-devtools`；CLI=`~/wechat-devtools/app/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli`；未登录（touristappid 无需登录） |
| DevTools（macOS 目标） | 官方 stable **2.02.2608040** `.pkg`；CLI=`/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |
| Xvfb | `:97`（`WDT_DISPLAY` 可覆盖；Linux/CI 需要，macOS 有 GUI 显示可不开） |
| Jest | ^30.4.2；miniprogram-automator ^0.12.1 |
| 基础库 libVersion | 2.25.3（仓库 pinned；CI 另 vendor 预置防升级 2.31.0 卡死） |
| 端口 | X display `:97` · auto 隧道 `9420`（`E2E_AUTO_PORT`）· IDE 远程端口 `9390` · mock `3001`（`E2E_MOCK_PORT`） |
| ffmpeg（可选） | 仅 `E2E_RECORD=1` 录像时需要（PATH 或 `~/.local/bin`/`~/bin`，`E2E_FFMPEG` 覆盖） |

## 4. 干净开发机从零搭建 + 全量套件运行

> 目标：一条命令全量套件全绿（T2.3 + T2.4）。macOS 估算 ≤30 分钟（§5 有实测计时，Linux）。

### 4.1 macOS（官方 DevTools，文档目标平台）

```bash
# 1) Node ≥ 18（Homebrew）                     ~1 min
brew install node
# 2) 微信开发者工具 stable 2.02.2608040 .pkg：官方下载页安装，
#    启动后扫码登录一次（CLI 自动化依赖登录态）          ~5 min
# 3) 克隆仓库 + 依赖                            ~2 min
git clone https://github.com/etjay/anim-prison-e2e.git && cd anim-prison-e2e
git checkout -b full-suite origin/agent/agent/e0af70c4e342   # T2.2 框架 + T2.3（见 §1）
git merge origin/agent/agent/d71584c409a4                    # + T2.4
npm install && cd mock-server && npm install && cd ..
# 4) 启动 mock 服务（dev profile，端口 3001）   ~5 s
MOCK_PROFILE=dev MOCK_PORT=3001 node mock-server/server.js   # 留终端 1 运行
# 5) 全量套件（一条命令，含 DevTools 冷启动）    ~2-3 min
E2E_MOCK_PORT=3001 npm run e2e
#    期望：Test Suites: 5 passed, 10 passed（实测 1m42s）
```

### 4.2 Linux（社区移植版 DevTools，本环境验证平台）

```bash
# 1) 前置：Node ≥18、git、Xvfb（X11 虚拟显示）、curl/dpkg
#    Debian/Ubuntu：sudo apt install xvfb curl   （ffmpeg 仅录像需要）
# 2) 社区版 DevTools（sha256 校验 → 解包 ~/wechat-devtools，免登录可跑 e2e）
scripts/install-devtools.sh
# 3) 克隆 + 依赖 + 合并全量套件分支：同 4.1 步骤 3
# 4) 启动 mock + 运行：同 4.1 步骤 4/5
MOCK_PROFILE=dev MOCK_PORT=3001 node mock-server/server.js
E2E_MOCK_PORT=3001 npm run e2e
```

Linux 前置依赖清单与排查细节见 `docs/spike-devtools-automator.md` §5（T3.1 CI 同款）。

### 4.3 一条命令全量套件（标准路径）

```bash
MOCK_PROFILE=dev MOCK_PORT=3001 node mock-server/server.js &   # 前置：mock 必须先起
E2E_MOCK_PORT=3001 npm run e2e                                  # 全量套件（串行，单 DevTools 实例）
```

- `npm run e2e` = Jest 串行跑 `e2e/smoke/` 全部用例；globalSetup 干净重启 DevTools
  IDE（Xvfb `:97` + 冷启 ~7–20s），globalTeardown 关闭 IDE——**一条命令即完成
  「环境引导 + 全量测试 + 收尾」**，无需手工操作 DevTools。
- 单条用例 Jest 超时 120s；失败自动重试 1 次（helper 层 `jest.retryTimes(1)`）。
- 可选全程录像（排查用）：`E2E_RECORD=1 E2E_MOCK_PORT=3001 npm run e2e`
  → `e2e/artifacts/run-<ts>.mp4`（~15fps，1–2 分钟约几 MB）。

### 4.4 验收自检（可选）

```bash
npm run lint                 # 0 error
cd mock-server && npm run smoke   # mock 5 API 全链路 + 错误码自检（临时端口，独立于 3001）
```

## 5. 复现记录（干净工作树，2026-08-25）

在干净工作区（新 clone、无 node_modules、IDE 由 globalSetup 冷启）执行：

| 步骤 | 命令 | 结果 / 耗时 |
|------|------|------------|
| 合并全量套件 | `git checkout -b full-suite origin/agent/agent/e0af70c4e342 && git merge origin/agent/agent/d71584c409a4` | 无冲突，5s |
| 依赖 | `npm install`（根 + mock-server） | 6.9s |
| mock 自检 | `curl http://127.0.0.1:3001/api/animal` | 200 包络（AUTH_INVALID，符合预期） |
| 全量套件 | `E2E_MOCK_PORT=3001 npm run e2e`（IDE 冷启在内） | **5 suites / 10 tests 全绿，实耗 1m42s**（Jest 报告 82.9s） |
| lint | `npm run lint` | 0 error |

**结论**：机器已装 DevTools/Node 的前提下「clone→依赖→全绿」≈ 2 分钟；
干净 macOS 加上装 Node + DevTools 下载/安装/登录（~6–8 分钟）亦满足 ≤30 分钟预算。
（验证机为 Linux 移植版 DevTools；macOS 干净机计时待小队长验收时补测。）

## 6. 故障排查

**产物位置（排查三件套）**

| 产物 | 位置 | 说明 |
|------|------|------|
| 用例后状态截图（失败现场） | `e2e/screenshots/auto-*.png` | 每条用例后自动截；文件名内嵌用例名/序号，gitignore |
| 全程录像（可选） | `e2e/artifacts/run-*.mp4` | 仅 `E2E_RECORD=1`；覆盖 Xvfb 启动→IDE 冷启→全程测试 |
| Jest 输出 / 日志 | 终端 stdout（建议重定向） | `[e2e]` 前缀=运行时日志，`[ensure-devtools]`=环境引导日志；失败用例名可定位截图 |
| mock 服务日志 | 自定（本环境：`/tmp/mock*.log`） | `MOCK_PROFILE=dev` 启动的 stdout |

**常见问题**

1. **`隧道端口 9420 被占且无应答` / launch 超时**：上一轮半死残留。直接重跑
   `npm run e2e`（globalSetup 会干净重启 IDE）；或临时 `E2E_AUTO_PORT=9430 npm run e2e`；
   预检 `node e2e/tools/ensure-devtools.js`（注意它也会重启 IDE）。
2. **同机并发跑多个 e2e 互杀 IDE**：auto 隧道固定单端口 + 串行设计所致。
   必须各用独立 X display + 隧道端口：
   `WDT_DISPLAY=:98 E2E_AUTO_PORT=9430 E2E_MOCK_PORT=3002 npm run e2e`（mock 同步换端口）。
3. **`fixtures 重置失败: HTTP 500/连接拒绝`**：mock 未起或端口不对——确认
   `3001` 上有 mock（§4.3 前置）且 `E2E_MOCK_PORT` 与 mock 实际端口一致。
4. **文案断言读不到 webview 文本**：移植版已知限制（spike 补丁 C：Page.*/Element.*
   通道静默挂起），文案断言 = 数据层（`pageData`）+ 渲染层（`visible` rect）双层，
   见 `e2e/README.md` §5。
5. **升级 DevTools 后行为异常**：补丁对 2.01.2510290 校准，升级前先跑
   `npm run e2e:spike` 回归。
6. **CI 首屏永久卡死（新 runner）**：基础库被升级到不存在的 2.31.0——CI 已 vendor
   预置 2.25.3（`agent/agent/691034ea5cfe-t32` 分支）；本地不受影响。
7. **`npm run build` 报「未找到 DevTools CLI」**：`DEVTOOLS_CLI=<cli 路径>` 显式指定
   （路径表见根 README / `docs/environment.md`）。

## 7. FAQ

**Q: 为什么 mock 用 3001 而不是约定的 3000？**
本共享机 3000 被 Multica 前端容器占用；且 T2.3 用例以 3001 为断言基线（与
`env.js` dev baseURL 一致）。统一 3001 一条命令即可全绿；干净机想用 3000 需同步改
`env.js` + T2.3 的 `MOCK_BASE`，一期不做。

**Q: 每条用例都重新登录吗？**
否。`beforeAll(e2e.bootstrap)` 幂等：全 suite 首个文件真正 launch 一次 DevTools
（automator 隧道 9420），后续文件直连复用。各用例自行 stub 登录/绑定（`stubLogin`/
`bindInvite`）或离线兜底（`assumeState`），并在开头 `POST /api/reset` 重置 fixtures。

**Q: 用例能并行加速吗？**
一期不能：auto 隧道单端口 + `--runInBand` 串行（~102s 已满足 <5 分钟预算）。
二期如提速：多 X display + 多隧道端口 + mock 多实例（`--maxWorkers=N`），注意
fixtures 是纯内存单例，并行需各自 mock 实例。

**Q: 失败后怎么定位？**
看 `e2e/screenshots/auto-<用例序号>-*.png`（失败现场）+ 终端 `[e2e]` 日志（waitFor
label 写明在等什么）；需要全过程则 `E2E_RECORD=1` 重跑看 `e2e/artifacts/*.mp4`。
helper 层自动重试 1 次，偶发 infra 抖动（如 App 未就绪）首跑失败重跑通常即过。

**Q: macOS 上需要 Xvfb 吗？**
官方 DevTools 有 GUI 显示时可不开 Xvfb；`WDT_DISPLAY` 仍建议显式设（脚本默认 `:97`，
macOS 上该值仅作 env 传递，IDE 走默认显示器）。CI/无头 Linux 必须 Xvfb。

**Q: 为什么 `npm run e2e` 每次都重启 DevTools？**
残留 auto tunnel 会让 automator 选错端口（spike 补丁 D）。干净重启 IDE 是框架的
可靠性设计（~7–20s），换来「一条命令从零可复现」——不要手工预热 IDE 再跑。

**Q: 登录态（扫码）是必须的吗？**
touristappid 工程 + CLI 自动化（build/open/e2e）实测无需登录；GUI 手动使用/预览建议
登录。`scripts/install-devtools.sh` 后的手动登录方式见脚本尾注（`cli login`）。

**Q: 全量套件分支在哪，什么时候进 main？**
T2.3 `agent/agent/e0af70c4e342`（已 done）、T2.4 `agent/agent/d71584c409a4`
（in_review）。合入 main 由小队长组织；合入后本文档 §1/§4 的合并步骤可直接改为
`git checkout main`。

**Q: 一期范围之外（二期）会做什么？**
真机（minium，替换 `e2e/helpers/runtime.js` 一层）、CI 自托管 runner 评估、
端口/并发多机并行、手势/坐标级交互用例。