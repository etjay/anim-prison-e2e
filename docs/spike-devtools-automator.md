# T2.1 Spike 报告：DevTools 自动化（miniprogram-automator）可行性

- 任务：ANIM-7（T2.1）
- 日期：2026-08-24
- 环境：Ubuntu x86_64（用户 magic），Xvfb `:97` headless
- DevTools：**社区移植版** [msojocs/wechat-devtools-linux](https://github.com/msojocs/wechat-devtools-linux) 2.01.2510290（官方 DevTools 仅 macOS/Windows，Linux CI 只能用它）
- 自动化库：`miniprogram-automator@0.12.1` + `jest@29`
- 代码：`e2e/spike/`（spike.test.js / ensure-devtools.js / miniprogram/），入口 `npm run e2e:spike`

## 1. 结论（TL;DR）

**可行（PASS，带适配）**。miniprogram-automator 可以驱动社区移植版 DevTools 完成
「启动 → 导航 → 元素断言 → 交互 → 截图 → 关闭」全循环：

- 单条 Jest 用例全绿，**全流水线（含 IDE 冷重启）~39s，纯测试 ~32s，满足 ≤60s 预算**；
- 失败场景自动截图落盘（`e2e/screenshots/`，390×753 真实设备截图）已验证；
- 需要 4 个适配补丁（§4），其中 **Page.\*/Element.\* 协议通道在移植版上无响应**，
  页面级操作必须走 `evaluate()`（App.callFunction）替代——这是 spike 最大的偏差，
  T2.2 框架设计必须基于「evaluate 优先」而不是 automator 的 Page/Element API。

**CI 建议**：Linux headless（Xvfb + swiftshader），与本机验证环境一致；单轮预算 40s；
每轮测试前干净重启 IDE（§6）。macOS runner（官方 DevTools）作为后续备选，非必需。

## 2. 验证内容与结果

| # | 验证项 | 结果 |
|---|---|---|
| 1 | automator.launch 打开最小原生工程 | ✅ |
| 2 | reLaunch 导航 `/pages/index/index` + currentPage 断言页路径 | ✅ |
| 3 | 断言 "Hello ANIM" 存在（数据层 `data.greeting` + 渲染层 `.hello` 节点 rect） | ✅ |
| 4 | 触发 tap 后断言 `data.count` +1 | ✅（经 evaluate 调页面方法） |
| 5 | 失败时 screenshot 落盘 | ✅（390×753 PNG，已验证） |
| 6 | finally close 关闭 | ✅ |
| 7 | 可重复性 | ✅ 连续 3 轮全绿（每轮 ~39s） |

## 3. 能力矩阵（移植版实测）

| automator 命令 | 底层协议消息 | 结果 |
|---|---|---|
| `Tool.getInfo`（checkVersion 用） | Tool.getInfo | ✅ 返回 `{version}`（**无 `SDKVersion` 字段** → 补丁 A） |
| `Tool.close` | Tool.close | ✅ |
| `App.getCurrentPage` / `getPageStack` | App.getCurrentPage / App.getPageStack | ✅（App 就绪前**挂起不报错**，需轮询） |
| `App.callWxMethod`（reLaunch / systemInfo / navigateTo） | App.callWxMethod | ✅ |
| `App.callFunction`（`miniProgram.evaluate`） | App.callFunction | ✅ **关键替代通道** |
| `App.captureScreenshot`（`miniProgram.screenshot`） | App.captureScreenshot | ✅ 390×753 PNG |
| `App.enableLog` / `App.exit` | App.enableLog / App.exit | ✅ |
| `Page.getData` / `setData` / `callMethod` / `getElement` | Page.\* | ❌ **挂起：无响应、无错误**（补丁 C） |
| `Element.*`（tap/attr/text…） | 依赖 Page.getElement 拿 eid | ❌ 连带不可用 |

## 4. 适配补丁（T2.2 框架必须内置）

### 补丁 A：checkVersion 容错
官方 `Tool.getInfo` 返回 `{SDKVersion}`；移植版返回 `{version}`。automator 内置
`checkVersion` 对 undefined 调 `.split('.')` 直接 TypeError 崩溃。
**处理**：monkey-patch `MiniProgram.prototype.checkVersion` 捕获异常放行（带 10s 超时兜底）。
见 `e2e/spike/spike.test.js` 头部「适配补丁 A」。

### 补丁 B：launch 必须 `trustProject: true`
不传时工程只挂窗不编译：App.* 命令全部无响应（currentPage/reLaunch 永久挂起，
表现为 launch 成功但后续操作超时）。传 `true` 后正常。
**T2.2 建议**：launch 默认带 `trustProject: true`，或首次运行预置
`~/.config/wechat-devtools` 的信任状态。

### 补丁 C：Page.*/Element.\* 挂起 → evaluate 替代（**最大偏差**）
所有 Page.* 命令在移植版上**无响应、无错误**（不是超时报错，是彻底静默）。
定位过程与证据：

1. 裸 ws 探针（绕过 automator）：`Page.getData{pageId:1}` / `callMethod` / `getElement`
   发送后 ws 完全静默（12s 无 response、无 error、无 event），而 App.* 同通道秒回；
2. 反编译 IDE core（`core.wxvpkg` 中的 automation controller）：非 Tool 消息经
   `messenger.triggerOnEvent({eventName:'onAutoMessageReceive', data})` 转发给
   appservice 端，响应经 `sendAutoMessage` 回传——**App.\* 与 Page.\* 走同一条通道**；
3. 反编译 appservice 端自动化宿主（vendor/2.25.3.wxvpkg 内 `WAAutoService.js`）：
   Page.getData/callMethod/getElement 的 handler 都在 `cr` 命令表里，且页面查找失败时
   **会显式回 "page destroyed" 错误**——实测连错误都没有，说明卡点在
   「handler 被调用 → 响应回传」的 appservice 内部路径（App.\* 同路径正常，
   故问题范围收窄到 Page.\* handler 调用链，如页面实例定位/异步调度），
   确切根因待上游确认。

**替代方案（已验证稳定）**：一切页面级操作经 `miniProgram.evaluate`
（App.callFunction，在 app 上下文执行）完成：

```js
// 读当前页 data
const data = await mp.evaluate(() => getCurrentPages()[0].data);
// 触发页面 tap（等价 Element.tap 的页面逻辑效果）
await mp.evaluate(() => { getCurrentPages()[0].onTap(); return true; });
// 渲染层节点探测（替代 getElement 的存在性断言）
const rect = await mp.evaluate(
  (sel) => new Promise((res) => {
    getCurrentPages()[0].createSelectorQuery().select(sel)
      .boundingClientRect().exec((r) => res(r && r.length ? r[0] : null));
  }), '.hello');
```

**代价/限制**（T2.2 需知晓）：
- 文案断言是「数据层值 + 渲染层节点存在/布局非空」，不是渲染层 DOM 文本读取
  （app 上下文拿不到 webview DOM；`createIntersectionObserver` 可再强化，spike 未展开）；
- `Element.tap` 的「真实点击」语义弱化为「调用 bindtap 处理函数」（对纯逻辑回归够用，
  对手势/点击坐标类用例不够）；
- 每个页面操作多一层 evaluate 往返（~百 ms 级，对 40s 预算无感）。

### 补丁 D：auto tunnel 残留 → 干净重启策略
移植版 IDE 的自动化服务是**单例**，且 `cli quit` 杀主进程后 **appservice renderer
会成为孤儿进程继续持有旧 tunnel 端口**（ws 可连但无响应）。automator.launch 的
getPort 会避开被占端口选新口（9421），但 IDE 仍监听旧口（9420）→ 永久连不上，
表现为 launch 超时。这是冷启动不稳定的全部根因。

**处理（已验证）**：
1. `ensure-devtools.js`：每轮测试前 `cli quit` + 等主进程退出 + `pkill` 安装路径下的
   孤儿 renderer → 保证 94xx 端口干净，再冷启 IDE（~15s）；
2. `spike.test.js`：beforeAll 先做**健康** tunnel 探测（ws 连 + Tool.getInfo 探活，
   4s/次）：有健康 tunnel（IDE 自动恢复窗口等场景）→ `Launcher.connect` 直连；
   无 → 正常 `automator.launch`（`timeout: 50000`）；
3. 所有 automator 调用套 `withTimeout` 兜底（防「挂起不报错」型卡死烧掉整个 Jest 超时）。

## 5. 耗时数据（Ubuntu x86_64，Xvfb :97，连续 3 轮均值）

| 阶段 | 耗时 |
|---|---|
| ensure-devtools（quit + 清理孤儿 + Xvfb + IDE 冷启到就绪） | ~7–15s |
| automator.launch（cli auto → tunnel → 连接） | ~17s |
| App 就绪轮询（currentPage，冷编译） | ~4–8s |
| reLaunch + 断言 + tap（6 次 evaluate 往返） | <5s |
| close | ~2s |
| **纯 Jest 测试** | **~32s** |
| **全流水线 `npm run e2e:spike`** | **~39s（预算 60s，余量 35%）** |

首跑（WeappCache 全冷、首次编译模板）会额外 +10s 左右，仍在预算内。

## 6. CI 建议（供 T3.x 决策）

**推荐：Linux headless runner（与本机 spike 环境同构，风险最低）**

1. **OS/工具**：Ubuntu 22.04/24.04（x86_64）+ `Xvfb`（`:97`，`-screen 0 1280x800x24`）
   + `swiftshader`（llvmpipe 软渲染）；spike 用的移植版对这两者无额外要求（`--disable-gpu` 由
   DevTools CLI 自带参数处理）。
2. **DevTools 安装**：移植版 2.01.2510290 deb/tarball 装到
   `~/.config/wechat-devtools` 布局（与本机一致：`app/opt/apps/<app>/files/bin/bin/wechat-devtools-cli`）；
   版本**钉死**，升级需重跑本 spike（§4 的补丁对版本敏感）。
3. **预热/缓存**：缓存 `~/.config/wechat-devtools/WeappCache`（模板/依赖编译缓存，
   首编可省 10s+）；工程代码缓存 `node_modules`。
4. **每轮干净重启 IDE**（补丁 D）：CI 容器本是一次性环境，`pkill` 孤儿 renderer 的
   逻辑保留即可；不要把上一 job 的 IDE 留给下一 job。
5. **超时预算**：Jest 单测 120s（实测 32–40s，3× 余量）；CI job 给 5min 上限。
6. **并发**：automator 端口从 9420 起探测 + 单例 tunnel，同一 runner 上**串行**跑 e2e
   （`--runInBand`）；多 job 并行需各自独立 X display 与端口段。
7. **失败产物**：`e2e/screenshots/*.png` 作为 job artifact 上传。

**备选：macOS runner + 官方 DevTools**：官方自动化链路更「正统」（Page.\* 大概率可用，
§3 的补丁 C 可能消失），但需要 Mac 上 DevTools 的 CLI/签名与 GUI 启动方案
（官方无 Linux 包），环境成本更高。建议 T3.x 先用 Linux headless 落地，
macOS 方案作为 Page.\* 通道修复/上游确认后的升级项。

## 7. 已知风险 / 上游跟踪

| 项 | 说明 | 缓解 |
|---|---|---|
| Page.\*/Element.\* 挂起（补丁 C） | 移植版特有；上游 msojocs issue 区无同款报告（已查 #172 等） | evaluate 替代；上游提 issue 跟踪，修复后回收补丁 |
| 补丁 A 版本敏感 | 若移植版补上 SDKVersion 字段，checkVersion 行为变化 | 保留容错 patch（双兼容） |
| App 就绪前命令挂起（不报错） | 冷编译期 currentPage 静默挂起 | 短轮询 + withTimeout（已内置） |
| 单例 auto tunnel | 跨会话端口残留 | 每轮干净重启（ensure-devtools 已内置） |
| 截图 API 位置 | `screenshot` 在 MiniProgram 上（App.captureScreenshot），非 Page | 文档化；spike 已按此使用 |

## 8. 复现步骤

```bash
# 前置：Xvfb :97 运行中；DevTools 移植版已装于 ~/wechat-devtools（或设 DEVTOOLS_CLI）
npm install            # 仓库根
npm run e2e:spike      # ensure-devtools（干净重启 IDE）+ jest 单用例
# 期望：Tests: 1 passed，~39s；失败时 e2e/screenshots/ 新增 png
```

## 9. 给 T2.2 的交接要点

1. 框架入口封装：`launch`（补丁 A/B 内置 + `timeout: 50000`）+ `ensure-devtools` 等价物；
2. 页面 API 设计为 **evaluate 优先**：`page.data()` / `page.tap(handler)` /
   `page.rect(selector)` 三个原语（对应 §4C 的三段代码）；
3. 全局 `withTimeout` 包裹所有 automator 调用（挂起不报错是移植版常态）；
4. 文案断言原语：数据层 `data.x === '文本'` + 渲染层 `rect(selector) != null && width > 0`；
5. 失败截图：`miniProgram.screenshot({ path })` → `e2e/screenshots/`。