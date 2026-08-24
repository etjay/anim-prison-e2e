// T2.1 spike：DevTools 自动化最小用例（Jest 单用例）。
//
// 定义来源：父 issue ANIM-3 线程「需求设计与分阶段任务清单 v0.2」第三节。
// 覆盖「启动 → 导航 → 元素断言 → 交互 → 截图 → 关闭」全循环：
//   1) automator.launch() 打开最小原生工程；
//   2) reLaunch('/pages/index/index') + currentPage() 断言页路径；
//   3) 断言文案 "Hello ANIM" 存在（数据层 + 渲染层）；
//   4) 触发 tap 后断言页面 data.count +1；
//   5) 失败时 miniProgram.screenshot() 落盘（e2e/screenshots/）；finally 中 close()。
//
// 社区移植版 DevTools（2.01.2510290）的自动化适配（spike 结论，详见
// docs/spike-devtools-automator.md）：
//   A. Tool.getInfo 返回 {version} 而非官方 {SDKVersion}，automator 内置
//      checkVersion 会 TypeError 崩溃 → 这里 monkey-patch 容错放行。
//   B. launch 必须带 trustProject: true，否则工程只挂窗不编译，App.* 命令
//      （currentPage/reLaunch）无响应永久挂起。
//   C. Page.* / Element.* 通道（getData/setData/callMethod/getElement/tap）
//      在移植版上无响应（无返回、无报错）→ 页面级操作改用 App.callFunction
//      （miniProgram.evaluate）在 app 上下文完成：页面 data、bindtap 处理函数、
//      以及 createSelectorQuery 渲染层节点探测。
//
// 运行：npm run e2e:spike（= ensure-devtools.js 预热 + jest e2e/spike/spike.test.js）
// 验收：全绿、单轮 ≤60s、失败场景产出截图。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');
const automator = require('miniprogram-automator');
const Launcher = require('miniprogram-automator/out/Launcher').default;
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;

// --- 适配补丁 A：checkVersion 容错（社区移植版 SDKVersion=undefined） -----------
const origCheckVersion = MiniProgram.prototype.checkVersion;
MiniProgram.prototype.checkVersion = async function () {
  try {
    await withTimeout(origCheckVersion.call(this), 10000, 'checkVersion');
  } catch (e) {
    console.warn(`[spike] checkVersion 容错放行（移植版 Tool.getInfo 无 SDKVersion 字段或超时）：${e.message}`);
  }
};

// --- CLI 路径解析（与 ensure-devtools.js 同一布局约定） -------------------------
function resolveCli() {
  if (process.env.DEVTOOLS_CLI) return process.env.DEVTOOLS_CLI;
  const HOME = os.homedir();
  const base = path.join(HOME, 'wechat-devtools', 'app', 'opt', 'apps');
  try {
    for (const app of fs.readdirSync(base)) {
      const bin = path.join(base, app, 'files', 'bin');
      const cli = path.join(bin, 'bin', 'wechat-devtools-cli');
      if (fs.existsSync(cli)) return cli;
    }
  } catch (_) {
    /* fallthrough */
  }
  return path.join(base, 'io.github.msojocs.wechat-devtools-linux', 'files', 'bin', 'bin', 'wechat-devtools-cli');
}

const CLI_PATH = resolveCli();
const PROJECT_PATH = path.join(__dirname, 'miniprogram');
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');
// auto 端口用 automator 默认策略（getPort 从 9420 起探测空闲端口）：
// 上一轮会话残留的 tunnel 只会占住某个端口，getPort 会自动选下一个空闲口。

jest.setTimeout(120000);

let miniProgram;
let page;

// 适配补丁 D（spike 记录）：IDE/孤儿 appservice 可能残留 auto tunnel（ws 可连但
// 无响应，或偶发健康）。automator.launch 的 getPort 会避开被占端口选新口，
// 而 IDE 单例自动化服务仍监听旧口 → connectTool 永连不上。解法：先探测「健康」
// tunnel（能应答 Tool.getInfo），有则 Launcher.connect 直连；否则走正常 launch。
async function probeTunnel(port, ms = 4000) {
  return new Promise((res) => {
    let done = false;
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (_) {
      // ws 构造同步失败（极少见）→ 直接判定不健康。
      return res(false);
    }
    const to = setTimeout(() => {
      if (!done) {
        done = true;
        try {
          ws.close();
        } catch (_) {
          // close 失败不影响判定。
        }
        res(false);
      }
    }, ms);
    ws.on('open', () => ws.send(JSON.stringify({ id: 'probe', method: 'Tool.getInfo', params: {} })));
    ws.on('message', (d) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try {
        ws.close();
      } catch (_) {
        // close 失败不影响判定。
      }
      let m;
      try {
        m = JSON.parse(d.toString());
      } catch (_) {
        return res(false);
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

function listTunnelPorts() {
  const r = spawnSync(
    'bash',
    ['-lc', `ss -ltn 2>/dev/null | awk '{print $4}' | grep -oE ':(94[0-9]{2}|95[0-9]{2})' | tr -d ':' | sort -u`],
    { encoding: 'utf8' },
  );
  return (r.stdout || '').trim().split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
}

// 在 timeoutMs 内寻找一个健康 tunnel 端口；找不到返回 null。
async function findHealthyTunnelPort(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const p of listTunnelPorts()) {
      if (await probeTunnel(p)) return p;
    }
    await sleep(500);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 给可能永久挂起的 automator 调用加超时（适配补丁 B/C 的兜底）。
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rj) => setTimeout(() => rj(new Error(`${label || 'op'} 超时（${ms}ms）`)), ms)),
  ]);
}

async function shot(name) {
  // automator 0.12.1 的截图 API 在 MiniProgram 上（App.captureScreenshot），
  // 需求文档中的 page.screenshot() 对应此处 miniProgram.screenshot()。
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}-${Date.now()}.png`);
  await miniProgram.screenshot({ path: file });
  console.log(`[spike] 截图已落盘：${file}`);
  return file;
}

// --- 页面级操作（适配补丁 C：app 上下文 evaluate 替代 Page.*/Element.*） ---------

// 读当前页 data。
const pageData = () =>
  miniProgram.evaluate(() => {
    const p = getCurrentPages()[0];
    return p ? p.data : null;
  });

// 渲染层节点探测：返回 boundingClientRect（存在且有宽度 = 节点已渲染）。
const queryRect = (selector) =>
  miniProgram.evaluate(
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

// 触发当前页的 bindtap 处理函数（等价于 Element.tap 的页面逻辑效果）。
const tapHandler = () =>
  miniProgram.evaluate(() => {
    const p = getCurrentPages()[0];
    if (typeof p.onTap !== 'function') throw new Error('page.onTap 不是函数');
    p.onTap();
    return true;
  });

beforeAll(async () => {
  if (!fs.existsSync(CLI_PATH)) {
    throw new Error(`CLI 不存在：${CLI_PATH}（先跑 npm run e2e:spike 的 ensure 步骤，或设 DEVTOOLS_CLI）`);
  }
  const t0 = Date.now();
  // 干净重启后（ensure-devtools 会杀掉所有 IDE 进程）beforeAll 时点通常没有
  // tunnel → 短窗口（3s）即可；真有健康 tunnel（IDE 自动恢复窗口）时才直连。
  const prePort = await findHealthyTunnelPort(3000);
  if (prePort) {
    console.log(`[spike] 检测到健康 auto tunnel（端口 ${prePort}），直连`);
    miniProgram = await withTimeout(
      new Launcher().connect({ wsEndpoint: `ws://127.0.0.1:${prePort}` }),
      15000,
      'connect(已有 tunnel)',
    );
  } else {
    miniProgram = await automator.launch({
      cliPath: CLI_PATH,
      projectPath: PROJECT_PATH,
      trustProject: true, // 适配补丁 B：无此参数工程不编译，App.* 全部挂起
      timeout: 50000, // 冷 IDE（首次编译）首连可达 40s+，热 IDE 实测 ~10s
    });
  }
  console.log(`[spike] launch 完成，耗时 ${Date.now() - t0}ms`);
  // 移植版首屏编译较慢：App 就绪前 currentPage 会挂起（非报错）。
  // 短轮询等就绪（热 IDE 实测约 8s，上限 30s）。
  const deadline = Date.now() + 30000;
  let cur = null;
  while (Date.now() < deadline) {
    try {
      cur = await withTimeout(miniProgram.currentPage(), 4000, 'currentPage');
      break;
    } catch (_) {
      await sleep(500);
    }
  }
  if (!cur) throw new Error('App 30s 内未就绪（currentPage 轮询超时）');
  page = await withTimeout(miniProgram.reLaunch('/pages/index/index'), 15000, 'reLaunch');
});

afterAll(async () => {
  if (!miniProgram) return;
  try {
    await withTimeout(miniProgram.close(), 15000, 'close');
    console.log('[spike] close 完成');
  } catch (e) {
    console.warn(`[spike] close 未完成（不阻断）：${e.message}`);
  }
});

test('DevTools 自动化全循环：启动→导航→断言文案→tap 后 data 变化', async () => {
  try {
    // (2) 断言当前页路径（reLaunch 返回的 page 对象与 currentPage 双重确认）
    const cur = await withTimeout(miniProgram.currentPage(), 8000, 'currentPage');
    expect(cur.path).toBe('pages/index/index');
    expect(String(page.path)).toContain('pages/index/index');

    // (3) 断言文案 "Hello ANIM" 存在
    // 数据层：页面 data.greeting 即渲染文案来源；
    const data = await withTimeout(pageData(), 8000, 'pageData');
    expect(data).not.toBeNull();
    expect(data.greeting).toBe('Hello ANIM');
    // 渲染层：renderer 返回 .hello 节点 rect（节点真实挂载且布局非空）。
    const helloRect = await withTimeout(queryRect('.hello'), 8000, 'queryRect(.hello)');
    expect(helloRect).not.toBeNull();
    expect(helloRect.width).toBeGreaterThan(0);

    // (4) tap 后断言 data.count +1
    const before = data.count;
    await withTimeout(tapHandler(), 8000, 'tap(onTap)');
    let after = await withTimeout(pageData(), 8000, 'pageData');
    for (let i = 0; i < 10 && after.count === before; i++) {
      await sleep(300);
      after = await withTimeout(pageData(), 8000, 'pageData');
    }
    expect(after.count).toBe(before + 1);
    // 渲染层：tap 后按钮节点仍在（布局未破坏）。
    const btnRect = await withTimeout(queryRect('.tap-btn'), 8000, 'queryRect(.tap-btn)');
    expect(btnRect).not.toBeNull();
    expect(btnRect.width).toBeGreaterThan(0);
  } catch (err) {
    // (5) 失败时截图落盘再抛出
    try {
      await withTimeout(shot('spike-failure'), 10000, 'screenshot');
    } catch (shotErr) {
      console.warn(`[spike] 失败截图也失败：${shotErr.message}`);
    }
    throw err;
  }
});