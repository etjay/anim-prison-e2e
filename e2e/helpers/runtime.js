'use strict';
// E2E 运行时（helper 层核心）：**整个仓库中唯一允许出现 miniprogram-automator
// API 的文件**（用例与其余 helper 一律通过本模块的导出交互，为二期真机/minium
// 迁移留缝——届时只改本文件的实现，用例不动）。
//
// 社区移植版 DevTools（2.01.2510290）的 4 个适配补丁全部内置于此
// （来源：T2.1 spike，详见 docs/spike-devtools-automator.md §4）：
//   A. Tool.getInfo 返回 {version} 而非官方 {SDKVersion} → monkey-patch
//      checkVersion 容错放行（10s 超时兜底）；
//   B. launch 必须带 trustProject: true，否则工程只挂窗不编译、App.* 全部挂起；
//   C. Page.*/Element.* 通道在移植版上静默挂起 → 一切页面级操作走
//      App.callFunction（evaluate，app 上下文）；
//   D. auto tunnel 单例残留 → bootstrap 时探测固定隧道端口（AUTO_PORT）：
//      健康则 Launcher.connect 直连复用，不健康才 launch；所有 automator 调用
//      套 withTimeout 兜底（「挂起不报错」是移植版常态）。
//
// 会话复用模型：Jest 30 下**每个测试文件各自拥有 worker 进程与模块注册表**
//（模块级单例无法跨文件），故 suite 级复用靠固定隧道端口（AUTO_PORT，可用
// E2E_AUTO_PORT 覆盖）：首个测试文件 launch 时 cli auto --auto-port 在 IDE 侧
// 建立隧道（隧道归 IDE 所有，跨 worker 存活），后续文件 bootstrap 直接
// Launcher.connect 同一隧道 —— 全程只开一次 IDE、只跑一次 cli auto。
// 失败重试预算：Jest 30 取消了 config 的 retryTimes/retries 键，改为运行时 API
// jest.retryTimes(1)（本文件模块加载时调用，对每个测试文件统一生效，预算 1 次）。
// suite 结束由 globalTeardown 关闭 IDE（cli quit + pkill 孤儿 renderer），
// worker 侧连接随 jest forceExit 回收。
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const automator = require('miniprogram-automator');
const Launcher = require('miniprogram-automator/out/Launcher').default;
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;

// --- 适配补丁 A：checkVersion 容错（社区移植版 SDKVersion=undefined） ---------
const origCheckVersion = MiniProgram.prototype.checkVersion;
MiniProgram.prototype.checkVersion = async function () {
  try {
    await withTimeout(origCheckVersion.call(this), 10000, 'checkVersion');
  } catch (e) {
    console.warn(`[e2e] checkVersion 容错放行（移植版 Tool.getInfo 无 SDKVersion 字段或超时）：${e.message}`);
  }
};

// --- 路径解析（与 e2e/tools/ensure-devtools.js 同一布局约定） -----------------
function resolveCli() {
  if (process.env.DEVTOOLS_CLI) return process.env.DEVTOOLS_CLI;
  const base = path.join(os.homedir(), 'wechat-devtools', 'app', 'opt', 'apps');
  try {
    for (const app of fs.readdirSync(base)) {
      const cli = path.join(base, app, 'files', 'bin', 'bin', 'wechat-devtools-cli');
      if (fs.existsSync(cli)) return cli;
    }
  } catch (_) {
    /* fallthrough */
  }
  return path.join(base, 'io.github.msojocs.wechat-devtools-linux', 'files', 'bin', 'bin', 'wechat-devtools-cli');
}

const CLI_PATH = resolveCli();
// 框架驱动主工程（miniprogram/），spike 最小工程（e2e/spike/miniprogram/）不参与 suite。
const PROJECT_PATH = path.resolve(__dirname, '..', '..', 'miniprogram');
const SHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
// 全 suite 固定的 auto 隧道端口（suite 级会话复用锚点，见文件头会话复用模型）。
const AUTO_PORT = parseInt(process.env.E2E_AUTO_PORT || '9420', 10);

// 失败重试预算 1 次（Jest 30：config 无 retries/retryTimes 键，改用运行时 API；
// 本文件在每个测试文件的上下文里被 require，模块加载时调用即对该文件生效）。
if (typeof jest !== 'undefined' && typeof jest.retryTimes === 'function') {
  jest.retryTimes(1);
}

// 所有 automator 调用必须经此包装（补丁 D 兜底：防「挂起不报错」烧掉整个 Jest 超时）。
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rj) => setTimeout(() => rj(new Error(`${label || 'op'} 超时（${ms}ms）`)), ms)),
  ]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 适配补丁 D（探活部分）：健康 tunnel 探测 --------------------------------
// 残留 tunnel 的 ws 可连但无响应（偶发健康）。能应答 Tool.getInfo 的 tunnel
// 视为健康，直接 Launcher.connect 复用（不重复跑 cli auto）。
function probeTunnel(port, ms = 4000) {
  return new Promise((res) => {
    let done = false;
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (_) {
      res(false);
      return;
    }
    const to = setTimeout(() => {
      if (!done) {
        done = true;
        try { ws.close(); } catch (_) { /* 不影响判定 */ }
        res(false);
      }
    }, ms);
    ws.on('open', () => ws.send(JSON.stringify({ id: 'probe', method: 'Tool.getInfo', params: {} })));
    ws.on('message', (d) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try { ws.close(); } catch (_) { /* 不影响判定 */ }
      let m;
      try {
        m = JSON.parse(d.toString());
      } catch (_) {
        res(false);
        return;
      }
      res(m.id === 'probe' && !!m.result);
    });
    ws.on('error', () => {
      if (!done) {
        done = true;
        clearTimeout(to);
        res(false);
      }
    });
  });
}

// --- 单例状态（每个测试文件一份；跨文件复用靠 AUTO_PORT 隧道） ----------------
let mp = null; // MiniProgram 实例（本文件内共享）
let booting = null; // 并发 bootstrap 合并
let closing = null;

function requireMp() {
  if (!mp) throw new Error('e2e 运行时未初始化：测试文件需在 beforeAll 调用 await bootstrap()');
  return mp;
}

async function waitForAppReady() {
  // 移植版首屏编译较慢：App 就绪前 currentPage 静默挂起（非报错）。短轮询等就绪
  // （热 IDE 实测 ~8s）。默认上限 30s；CI 冷机首屏编译/重编译更慢，部署侧经
  // E2E_APP_READY_TIMEOUT_MS 放宽（不设则本地默认 30s 不变，向后兼容）。
  const appReadyTimeoutMs = Number(process.env.E2E_APP_READY_TIMEOUT_MS) || 30000;
  const deadline = Date.now() + appReadyTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await withTimeout(mp.currentPage(), 4000, 'currentPage(等待 App 就绪)');
      return;
    } catch (_) {
      await sleep(500);
    }
  }
  throw new Error(`App ${appReadyTimeoutMs}ms 内未就绪（currentPage 轮询超时）`);
}

// bootstrap：幂等（文件内）。suite 级：首文件 launch 建隧道，后续文件直连复用。
async function bootstrap() {
  if (mp) return mp;
  if (booting) return booting;
  booting = (async () => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`CLI 不存在：${CLI_PATH}（先运行 globalSetup/ensure-devtools，或设 DEVTOOLS_CLI）`);
    }
    const t0 = Date.now();
    if (await probeTunnel(AUTO_PORT, 4000)) {
      console.log(`[e2e] 端口 ${AUTO_PORT} 已有健康 auto tunnel，直连复用 suite 会话`);
      mp = await withTimeout(
        new Launcher().connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` }),
        15000,
        'connect(suite tunnel)',
      );
    } else {
      try {
        mp = await automator.launch({
          cliPath: CLI_PATH,
          projectPath: PROJECT_PATH,
          port: AUTO_PORT, // 固定隧道端口：suite 复用锚点（被占则报错而非自选新口）
          trustProject: true, // 适配补丁 B
          timeout: 50000, // 冷 IDE（首次编译）首连可达 40s+，热 IDE 实测 ~10s
        });
      } catch (e) {
        // 端口被占但初探超时（冷 IDE 应答慢）→ 拉长窗口复探后直连。
        if (/port\s+\S+\s+is in use/i.test(e.message) && (await probeTunnel(AUTO_PORT, 15000))) {
          console.warn(`[e2e] launch 报端口被占，复探通过，改直连：${e.message}`);
          mp = await withTimeout(
            new Launcher().connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` }),
            15000,
            'connect(复探)',
          );
        } else if (/port\s+\S+\s+is in use/i.test(e.message)) {
          throw new Error(
            `隧道端口 ${AUTO_PORT} 被占且无应答（半死残留会话？）：重跑 globalSetup 清理 IDE，或临时改 E2E_AUTO_PORT`,
          );
        } else {
          throw e;
        }
      }
    }
    console.log(`[e2e] automator 连接完成，耗时 ${Date.now() - t0}ms（suite 内各文件直连此隧道）`);
    await waitForAppReady();
    console.log('[e2e] App 已就绪');
    return mp;
  })().catch((e) => {
    booting = null;
    mp = null;
    throw e;
  });
  return booting;
}

// close：尽力而为地优雅关闭 automator 会话（App.exit）。suite 结束不强制依赖
// 它——globalTeardown 会直接关 IDE；本函数供显式收尾或二期扩展使用。
async function close() {
  if (!mp) return;
  if (closing) return closing;
  closing = (async () => {
    const cur = mp;
    mp = null;
    try {
      await withTimeout(cur.close(), 15000, 'close');
      console.log('[e2e] automator close 完成');
    } catch (e) {
      console.warn(`[e2e] close 未完成（不阻断）：${e.message}`);
    } finally {
      closing = null;
    }
  })();
  return closing;
}

// --- 页面级原语（适配补丁 C：app 上下文 evaluate 替代 Page.*/Element.*） -------

// 在 app 上下文执行 fn（等价官方文档的 miniProgram.evaluate）。
async function evaluate(fn, ...args) {
  return withTimeout(requireMp().evaluate(fn, ...args), 8000, 'evaluate');
}

// 读当前页 data（渲染文案的数据层来源）。
async function pageData() {
  return evaluate(() => {
    const p = getCurrentPages()[0];
    return p ? p.data : null;
  });
}

// 渲染层节点探测：返回 boundingClientRect（存在且有宽度 = 节点已挂载且布局非空）。
// 移植版拿不到 webview DOM 文本——文案断言 = 数据层值 + 渲染层 rect（spike 报告 §4C）。
async function rect(selector) {
  return evaluate(
    (sel) =>
      new Promise((res) => {
        const p = getCurrentPages()[0];
        p.createSelectorQuery()
          .select(sel)
          .boundingClientRect()
          .exec((r) => res(r && r.length ? r[0] : null));
      }),
    selector,
  );
}

// 触发当前页的 bindtap 等处理函数（等价 Element.tap 的页面逻辑效果；
// 对手势/点击坐标类用例不够，二期真机 minium 迁移时回收）。
async function tapPageHandler(method, ...args) {
  return evaluate(
    (n, a) => {
      const p = getCurrentPages()[0];
      if (!p) throw new Error('无当前页（先 goto 导航）');
      if (typeof p[n] !== 'function') throw new Error(`当前页没有方法 ${n}`);
      const r = p[n](...a);
      return r === undefined ? true : r;
    },
    method,
    args,
  );
}

// 设置当前页 data（如模拟邀请码输入）。
async function setPageData(data) {
  return evaluate(
    (d) => {
      const p = getCurrentPages()[0];
      if (!p) throw new Error('无当前页（先 goto 导航）');
      p.setData(d);
      return true;
    },
    data,
  );
}

// 设置 App.globalData（stub 会话状态）。
async function setGlobalData(data) {
  return evaluate(
    (d) => {
      Object.assign(getApp().globalData, d);
      return true;
    },
    data,
  );
}

// 当前页路径（'pages/xxx/xxx'，无前导斜杠）。
async function currentPath() {
  const cur = await withTimeout(requireMp().currentPage(), 8000, 'currentPage');
  return cur ? cur.path : null;
}

// reLaunch 导航（automator 的 App.callWxMethod 通道，spike 已验证）。
async function reLaunch(route) {
  await withTimeout(requireMp().reLaunch(route), 15000, `reLaunch ${route}`);
}

// --- 用例后截图 ----------------------------------------------------------------
// miniProgram.screenshot（App.captureScreenshot 通道，移植版已验证 390×753 PNG）。
function sanitizeTag(tag) {
  return String(tag || 'shot').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

async function screenshot(tag) {
  const file = path.join(SHOT_DIR, `${sanitizeTag(tag)}-${Date.now()}.png`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await withTimeout(requireMp().screenshot({ path: file }), 10000, 'screenshot');
  return file;
}

// Jest afterEach 钩子：**零参函数**（Jest 30 的 takesDoneCallback(fn) 以
// fn.length>0 判定为 done-callback 风格——即使 async 返回 Promise 也会等 done()，
// 钩子超时才报错；故本函数不声明参数）。每条用例结束后无条件截一张当前页状态：
// 失败时即失败现场截图（断言抛错瞬间的页面状态）；通过时留 post-state 快照便于排查。
let shotSeq = 0;
async function autoShot() {
  if (!mp) return;
  try {
    shotSeq += 1;
    const file = await screenshot(`auto-${shotSeq}`);
    console.log(`[e2e] 用例后状态截图：${file}`);
  } catch (e) {
    console.warn(`[e2e] 用例后截图失败（不阻断）：${e.message}`);
  }
}

module.exports = {
  bootstrap,
  close,
  evaluate,
  pageData,
  rect,
  tapPageHandler,
  setPageData,
  setGlobalData,
  currentPath,
  reLaunch,
  screenshot,
  autoShot,
  withTimeout,
  CLI_PATH,
  PROJECT_PATH,
  SHOT_DIR,
};