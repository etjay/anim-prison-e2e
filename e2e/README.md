# e2e（E2E 自动化框架 · T2.2 定稿）

微信小程序 E2E 框架（**方案 A：官方 miniprogram-automator + Node + Jest**，选型定稿依据
T2.1 spike 报告 `docs/spike-devtools-automator.md`）。本文是**用例编写规范 + helper 用法**，
T2.3/T2.4 的业务用例按此编写。

> 边界（协调约束）：本目录由 stage2（测试工程师 / T2.x）负责；automator API 只出现在
> `helpers/runtime.js`（为二期真机/minium 迁移留缝——届时替换该文件实现，用例不动）。

## 1. 目录结构

```
e2e/
  jest.config.js        # Jest 配置（rootDir=e2e/；smoke 用例；串行）
  global.setup.js       # globalSetup：全 suite 干净启动 DevTools（一次）
  global.teardown.js    # globalTeardown：suite 结束关闭 DevTools（cli quit + 杀孤儿 renderer）
  helpers/              # ★ helper 层：automator API 仅出现在 runtime.js
    runtime.js          #   运行时单例：launch/补丁 A–D/evaluate 原语/失败截图（唯一 automator 入口）
    wait.js             #   waitFor 统一等待（预算内轮询，禁固定 sleep）
    navigation.js       #   goto / expectPage / currentPath
    session.js          #   stubLogin / bindInvite / assumeState（stub 登录、邀请码绑定）
    index.js            #   统一出口（用例只 require 它）
  smoke/                # ★ 冒烟/业务用例（T2.3/T2.4 落位处）
    welcome.test.js     #   T2.2 验收琐碎用例：打开欢迎页并断言核心元素
  tools/
    ensure-devtools.js  #   环境引导：Xvfb + DevTools IDE 干净重启（globalSetup 与手动预检共用）
    record.js           #   全程录像（E2E_RECORD=1 开启）：ffmpeg x11grab 录 :97 → e2e/artifacts/*.mp4
    record.setup.js     #   录像 globalSetup 独立入口（e2e:spike 挂接用）
    record.teardown.js  #   录像 globalTeardown 独立入口（e2e:spike 挂接用）
  spike/                # T2.1 spike（历史留档，独立入口 npm run e2e:spike）
  screenshots/          # 用例后状态截图（gitignore，失败现场 / job artifact 来源）
```

## 2. 运行

```bash
# 前置（一次性）：Node ≥18、社区移植版 DevTools（scripts/install-devtools.sh）、Xvfb
npm install
npm run e2e            # 单一入口：globalSetup 干净启 IDE → 跑 e2e/smoke/ 全部用例 → globalTeardown 关 IDE
```

- 环境变量：`WDT_DISPLAY`（Xvfb display，默认 `:97`）、`DEVTOOLS_CLI` / `DEVTOOLS_ROOT`
  （DevTools 路径覆盖）、`E2E_AUTO_PORT`（auto 隧道端口，默认 `9420`）；
- **全程录像（T3.x CI 排查用，可选）**：`E2E_RECORD=1 npm run e2e`（`e2e:spike` 同理）
  会在测试运行期间用 ffmpeg x11grab 全程录 `WDT_DISPLAY` 桌面，产物
  `e2e/artifacts/run-<时间戳>.mp4`（~15fps，40-60s 约几 MB，gitignore）。默认关闭零开销；
  录像从 globalSetup 的 Xvfb 启动开始（覆盖 IDE 冷启 + 打开工程编译 + 全程测试），
  在 globalTeardown 杀 IDE 之前收尾；录屏失败（ffmpeg 缺失等）只警告、不阻断 suite。
  可选变量：`E2E_FFMPEG`（ffmpeg 路径，默认 PATH → `~/.local/bin` → `~/bin`）、
  `E2E_RECORD_SIZE`（默认 `1280x800`，与 Xvfb 屏幕一致）。
  登录/授权浮层不再用 drawbox 遮罩掩盖（owner 已拍板「摘掉各种遮罩」），由
  `e2e/tools/login-stub.js` 冷启前注入登录态根修保证浮层不出现。CI 上传 artifact
  时与失败截图、Jest JSON 一并上传（T3.1/T3.2 消费）。
- 耗时预算：全 suite（含 IDE 冷启动）~40s 量级（spike 实测单用例全流水线 ~39s）；
  单用例 Jest 超时 120s；
- **DevTools 实例语义**：globalSetup 干净重启 IDE 一次；auto 隧道用**固定端口 9420**：
  suite 内首个测试文件 `launch` 时在 IDE 侧建立隧道，后续文件 bootstrap 探测到健康
  隧道后直接 `Launcher.connect` 复用（Jest 每个测试文件是独立 worker 进程，跨文件
  复用只能靠 IDE 侧隧道，不能靠进程内单例）——全程只开一次 IDE、只跑一次 `cli auto`；
  suite 结束 globalTeardown 关闭 IDE。因此必须串行（`--runInBand` + `maxWorkers: 1`）；
- 依赖 mock-server 的用例需先启动：**`cd mock-server && MOCK_PROFILE=dev MOCK_PORT=3001 node server.js`**
  （dev profile 行为不变，仅换端口；与 `miniprogram/config/env.js` 当前 dev baseURL
  `127.0.0.1:3001` 对齐。原因：共享开发机 127.0.0.1:3000 被 Multica 前端容器占用，
  无冲突机器上可改回 `npm run start:dev`（3000）并同步 env.js）。

## 3. 用例编写规范

1. **只 require helper**：`const e2e = require('../helpers');`——用例文件里不出现
   `miniprogram-automator`、`miniProgram.*`、`mp.evaluate` 等 automator API。
2. **固定两行钩子**（每个用例文件）：
   ```js
   beforeAll(e2e.bootstrap);       // 幂等：全 suite 首个文件触发 launch，其余复用
   afterEach(e2e.autoShot);        // 用例后状态截图 → e2e/screenshots/（失败时即失败现场）
   ```
   ⚠️ 钩子函数必须**零参**（Jest 30 的 `takesDoneCallback(fn)` 以 `fn.length>0` 判定为
done-callback 风格，即使 async 也会等 `done()` 直到钩子超时）——不要自己包一层带参函数。
3. **禁固定 sleep**：不写 `await sleep(2000)` 赌时序；一切异步条件用
   `e2e.waitFor(pollFn, { timeoutMs, label })`（预算内轮询，label 写清等什么，便于失败定位）。
   失败重试预算 1 次由 helper 层自动提供（require helper 时 `jest.retryTimes(1)`，
   Jest 30 已无 config 重试键），用例不自写重试循环。
4. **文案断言双层**（spike 补丁 C：移植版 Page.*/Element.* 通道静默挂起，读不到
   webview DOM 文本）：
   - 数据层：`const data = await e2e.pageData(); expect(data.someKey).toBe('文案值');`
   - 渲染层：`const r = await e2e.visible('.some-class'); expect(r.width).toBeGreaterThan(0);`
     （节点已挂载且布局非空；`.visible()` 已含 waitFor，超预算自动抛错 + 失败截图）
5. **交互**：`await e2e.tap('onConfirm')` 调用当前页的 bindtap 处理函数
   （等价 Element.tap 的页面逻辑效果；手势/点击坐标类用例留给二期真机）。
   ⚠️ **页面栈语义（T2.3 实测）**：`pageData()`/`tap()`/`visible()` 取
   `getCurrentPages()[0]`（**栈底**）。经 `reLaunch` 导航（栈恒为 1）时
   栈底=顶层，无感；但页面内 `navigateTo` 入栈后（如 home→canteen，
   栈 [home, canteen]）栈底≠可见页，需改用 `e2e.evaluate` 取栈顶：
   ```js
   const d = await e2e.evaluate(() => {
     const ps = getCurrentPages(); return ps[ps.length - 1].data;
   });
   await e2e.evaluate((n) => {
     const p = getCurrentPages().slice(-1)[0]; p[n]();
   }, 'onFeed');
   ```
   详见 smoke/happy-path.test.js 的 topPageData/topTap/topVisible 范式；
   框架补 topPageData/tapTop 后回收。
6. **导航**：`await e2e.goto('/pages/bind/bind')`（reLaunch 清栈 + 等待落地）；
   `await e2e.expectPage('/pages/home/home')`（纯等待断言，不触发跳转）。
   ⚠️ 跳转前先对齐 app 状态：部分页面 onShow 会按 globalData 自动重定向
   （如 welcome 对已绑定用户跳 home），`goto` 后路径会立即离开目标 → 先
   `assumeState`/stub 登录把状态切对，再 goto/expectPage。
7. **一个用例一个测试文件**：`e2e/smoke/<场景>.test.js`；文件命名即场景名，
   失败截图文件名内嵌用例名可回溯。

## 4. helper API（`require('../helpers')`）

| API | 说明 |
|---|---|
| `bootstrap()` | 幂等初始化（launch automator + 等 App 就绪）。全 suite 只真正执行一次 |
| `autoShot()` | 作为**零参** `afterEach` 传入；每条用例结束后截当前页状态到 `e2e/screenshots/auto-*.png`（失败时即失败现场截图） |
| `screenshot(tag)` | 手动截图（返回落盘路径） |
| `close()` | 尽力而为关闭 automator 会话（suite 结束不依赖它，globalTeardown 关 IDE） |
| `waitFor(fn, { timeoutMs=15000, pollMs=300, label })` | 统一等待：预算内轮询 fn 至真值；超时抛带 label 错误 |
| `goto(route)` | reLaunch 导航并等待落地页路径切换完成 |
| `expectPage(route)` | 等待当前页为指定路径（不触发跳转） |
| `currentPath()` | 当前页路径（`pages/xxx/xxx`） |
| `pageData()` | 当前页 data（文案断言的数据层来源） |
| `visible(selector, { timeoutMs })` | 渲染层断言：waitFor + 节点 rect（挂载且宽度 >0），返回 rect |
| `rect(selector)` | 裸渲染层探测（boundingClientRect 或 null） |
| `tap(method, ...args)` | 触发当前页处理函数（bindtap 等）；⚠️ 取栈底 [0]，见 §3.5 栈语义 |
| `evaluate(fn, ...args)` | 在 appservice 上下文执行任意函数（T2.3 起公开，用于栈顶页访问等底层需求） |
| `setPageData(obj)` | 设当前页 data（如模拟输入：`{ code: 'ANIM-001' }`） |
| `setGlobalData(obj)` | 设 App.globalData |
| `stubLogin()` | 登录页 onLogin → 等跳转（需 mock-server）；返回落地页路径 |
| `bindInvite(code)` | 绑定页填码 + onConfirm → 等跳转 home（需 mock-server） |
| `assumeState({ bound, token })` | 离线兜底：直接设 globalData.bound 并跳到 welcome/home（不依赖 mock） |

### 用例示例（登录 → 绑定 → 首页，T2.3 参考）

```js
const e2e = require('../helpers');
beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

test('stub 登录后未绑定用户进入欢迎页', async () => {
  const landed = await e2e.stubLogin();
  expect(landed).toBe('pages/welcome/welcome');
  const data = await e2e.pageData();
  expect(data.env).toBe('dev');
});

test('邀请码绑定后进入首页', async () => {
  await e2e.stubLogin();
  await e2e.bindInvite('ANIM-001');
  const r = await e2e.visible('.home-title');
  expect(r.width).toBeGreaterThan(0);
});
```

## 5. 已知限制（源自 spike 报告 §4/§7，编写用例前必读）

| 限制 | 影响 | 对策 |
|---|---|---|
| Page.*/Element.* 通道静默挂起（补丁 C） | 文案断言 = 数据层 + 渲染层 rect；tap = 调处理函数 | 双层断言模式（§3.4）；真机 minium 二期回收 |
| App 就绪前命令挂起不报错 | 冷编译期 currentPage 静默 | bootstrap/waitFor 已内置轮询 + 8s 兜底超时 |
| auto tunnel 单例残留（补丁 D） | 脏端口 → automator 连不上 | 每轮 suite 干净重启 IDE（globalSetup）+ 固定隧道端口 9420 健康探测直连/占用报错 |
| 固定隧道端口 9420 | 同机并发多个 e2e 互踩；端口被半死残留占住时 launch 报错 | 必须串行（`--runInBand`）；多机/并行各需独立 X display + `E2E_AUTO_PORT`；报错时按提示重跑 globalSetup |
| 移植版版本敏感 | 补丁对 DevTools 2.01.2510290 校准 | 升级 DevTools 前重跑 spike（`npm run e2e:spike`） |

## 6. 排查

- **launch 超时 / currentPage 轮询超时**：确认 `pgrep nw` 只有本轮 IDE；手动
  `node e2e/tools/ensure-devtools.js` 预检（注意它也会干净重启 IDE）；
- **「隧道端口 9420 被占且无应答」报错**：半死残留会话，重跑一次 `npm run e2e`
  （globalSetup 会干净重启 IDE），或临时 `E2E_AUTO_PORT=9430 npm run e2e`；
- **失败截图**：`e2e/screenshots/auto-*.png`（每条用例后状态；CI 作 job artifact 上传）；
- **日志**：`[ensure-devtools]`（环境）、`[e2e]`（运行时）前缀可过滤；
- **spike 回归**：`npm run e2e:spike`（最小工程全循环，独立于本框架）。

## 7. 登录态与浮层（ANIM-25）

DevTools 冷启后未登录时，预览/编辑器区会弹登录/授权浮层（本项目表现为
「更改 AppID 失败 (touristappid) / Error: tourist appid」对话框 + 登录扫码浮层，
IDE 每 2s 轮询登录态直到登录）。修复分两层，均在 e2e/ 域内：

**主修复（T2，`e2e/tools/login-stub.js`，globalSetup 自动执行）**：
IDE 停止后、冷启前，向 DevTools 的 Chromium Local Storage leveldb
（`~/.config/wechat-devtools/Default/Local Storage/leveldb/`）预注入一份「已登录」
状态（`userInfo_*` + `reduxPersist:user`，值编码 `0x01`=UTF-8 / `0x00`=UTF-16LE，
key = `<origin>\x00\x01<key>`，origin 动态发现 + 默认值兜底）。幂等：
已有有效登录态（SUCCESS 且签名有效期 > now+24h）则零写入；未登录/过期/全新机器则写入
stub（openid `oe2estub…`，有效期 365 天）。写失败不阻断（打印 `[login-stub]` 警告，
降级到 T3 遮罩）。

- `WDT_LOGIN_STUB`：`auto`（默认，缺登录态才写）/ `0`（只读不写，排障对比）/ `force`（无条件重写）；
- `WDT_LS_DIR` / `WDT_LS_ORIGIN`：leveldb 目录与 origin 前缀覆盖（版本漂移时）；
- 验证当前登录态：`node -e "require('./e2e/tools/login-stub').readLoginState().then(s=>console.log(s))"`
  （IDE 须已停止，否则 leveldb 被锁）。

> 注：此前「兑底遮罩」（drawbox 录像遮罩）已按 owner 决策「摘掉各种遮罩」移除——
> 登录/授权浮层不再靠 ffmpeg 遮罩掩盖，登录态由 login-stub 根修保证不出现。

注意：stub 依赖 root `package.json` 的 `classic-level`（纯预编译、无 node-gyp），
CI `npm ci` 即可；lazy require，不写 leveldb 时零原生模块开销。