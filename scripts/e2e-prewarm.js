#!/usr/bin/env node
'use strict';
// E2E CI 预热：跑测试前把「主工程首屏编译」这一最慢步骤先做掉，焐热 **on-disk 编译缓存**
// （~/.config/wechat-devtools/WeappCache/），让测试冷启 IDE 后重编译走热缓存、秒过
// e2e/helpers/runtime.js 的 waitForAppReady（30s 硬上限，测试域，CI 侧不改）。
//
// 为什么需要：社区移植版首屏编译慢，CI 冷机（ubuntu-latest 共享 runner）首屏实测 >30s
// → 冒烟用例报「App 30s 内未就绪」。本地热 IDE 首屏 ~8s，差异全在冷编译缓存。
//
// 机制（关键：完整复刻 e2e globalSetup 的 IDE 启动路径）：
//   1) 复用 e2e/tools/ensure-devtools.js 的 ensureDevtools() 冷启 IDE —— 用 nw 可执行文件
//      直接拉起、等服务端口（实测 ~9-15s）。与测试同一启动路径，确定性高。
//   2) 再用**独立隧道端口 9421**（E2E_PREWARM_PORT）+ automator.launch（cli auto --auto-port 9421）
//      建隧道（IDE 已起，~13s）+ 打开 miniprogram 工程 + 等首屏编译完成
//      → 编译缓存在盘焐热（缓存按工程 hash 存盘，与隧道端口无关）。
//      ※ 若不做第 1 步、只用 automator.launch：其内部 cli auto 须「冷启 IDE + 建隧道」一步完成，
//        CI 冷机实测 >60s 会撞 automator.launch 超时 → 缓存没焐上（run #3 的失败根因）。
//   3) `cli quit` 干净退出主 IDE。持隧道的 appservice renderer 会孤儿化——但它占的是 9421
//      不是测试的 9420，不冲突（见下方「为什么用 9421」）。
//   4) 测试 `npm run e2e` 的 globalSetup 每轮 stopAllIde 冷启**新** IDE（补丁 D），但编译缓存
//      在盘、跨 IDE 重启存活 → 测试 cli auto --auto-port 9420 + 重编译走热缓存，waitForAppReady 秒过。
//
// 为什么用 9421 而不是 9420（与测试 AUTO_PORT 不同端口）：
// 持隧道的 appservice renderer 在 `cli quit` 与 globalSetup 的 stopAllIde pkill 下都会漏杀而
// 孤儿化——其 cmdline 为 `/proc/self/exe --type=renderer ... --nwapp-path=<DT_ROOT>/...`，
// `--type=renderer` 在 DT_ROOT **之前**，故 stopAllIde 的正则 `${DT_ROOT}.*--type=renderer`
// 不匹配。若预热也占 9420，孤儿 renderer 会一直占着 9420，测试 cli auto --auto-port 9420
// 永远监听不上 → automator 连不上。改用 9421：孤儿占 9421，9420 干净留给测试。
//
// 职责边界（部署运维）：只起 IDE / 等编译 / 焐热盘缓存 / 干净退出，不改 e2e/ 用例与 helper，
// 不驱动页面、不断言。对 e2e/tools/ensure-devtools.js 为**只读 import**（复用其经实测的
// IDE 冷启路径），不修改 e2e/ 源码。失败退出非 0（continue-on-error 下测试 bootstrap 仍会自行
// launch 兜底）。
//
// 环境变量：
//   E2E_PREWARM_PORT    预热隧道端口（默认 9421；须不同于测试 AUTO_PORT 9420）
//   E2E_PREWARM_TIMEOUT 首屏就绪轮询上限 ms（默认 90000，冷机给足；超时退出非 0）
//   DEVTOOLS_CLI        显式指定 CLI 路径（默认按 ~/wechat-devtools/app/opt/apps/*/files/bin/bin 探测）
//   WDT_DISPLAY         X11 display（默认 :97；须已由前置 Xvfb 起好，nw 为 GUI 需 DISPLAY）

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const automator = require('miniprogram-automator');
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;
// 只读复用 e2e 域的 IDE 冷启路径：ensureDevtools = stopAllIde + ensureX11Display + ensureIde
// （用 nw 二进制直接拉起 IDE 并等服务端口）。预热仅 import，不改 e2e/ 源码。
const { ensureDevtools } = require('../e2e/tools/ensure-devtools');

// --- 适配补丁 A（与 e2e/helpers/runtime.js 同源）：checkVersion 容错 ---------
// 社区移植版 Tool.getInfo 无 SDKVersion 字段 → 原生 checkVersion 对 undefined .split() 抛错，
// 会被 automator.launch 内部 `await d.checkVersion()` 上抛。runtime.js 在测试域已 monkey-patch；
// 预热是独立进程，须自带同一补丁，否则 launch 失败。移植版 IDE 启动 + 隧道建立本身正常。
const origCheckVersion = MiniProgram.prototype.checkVersion;
MiniProgram.prototype.checkVersion = async function () {
  try {
    await withTimeout(origCheckVersion.call(this), 10000, 'checkVersion');
  } catch (e) {
    console.warn(`[e2e-prewarm] checkVersion 容错放行（移植版无 SDKVersion）：${e && e.message ? e.message : e}`);
  }
};

const PREWARM_PORT = parseInt(process.env.E2E_PREWARM_PORT || '9421', 10);
const READY_TIMEOUT = parseInt(process.env.E2E_PREWARM_TIMEOUT || '90000', 10);
const DISPLAY = process.env.WDT_DISPLAY || ':97';
// 与 runtime.js 一致：框架驱动主工程 miniprogram/（spike 最小工程不参与 suite）。
const PROJECT_PATH = path.resolve(__dirname, '..', 'miniprogram');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 诊断工具（部署运维域）：只读探查 IDE 运行现场，便于定位冷机首屏卡点 -----------
// 全部 best-effort：任何一条探测失败都不影响预热主流程。
function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (_) {
    return '';
  }
}
function q(p) {
  return "'" + String(p).replace(/'/g, "'\"'\"") + "'";
}
function weappCacheDir() {
  return path.join(os.homedir(), '.config', 'wechat-devtools', 'WeappCache');
}
function weappLogDir() {
  return path.join(os.homedir(), '.config', 'wechat-devtools', 'WeappLog', 'logs');
}
function snapshot() {
  const parts = [];
  const procs = sh(`ps -eo comm 2>/dev/null | grep -cE '^(nw|crashpad)' `);
  parts.push('nw_procs=' + (procs || '?'));
  const cache = sh(`du -sh ${q(weappCacheDir())} 2>/dev/null | cut -f1`);
  parts.push('WeappCache=' + (cache || 'none'));
  const latest = sh(`ls -t ${q(weappLogDir())} 2>/dev/null | head -1`);
  parts.push('latestWeappLog=' + (latest || 'none'));
  return parts.join(' ');
}
function dumpDiagnostics(reason) {
  console.log(`[e2e-prewarm][diag] ${reason} —— 现场快照：${snapshot()}`);
  const top = sh('ps -eo pid,pcpu,etimes,comm --sort=-pcpu 2>/dev/null | head -12');
  if (top) console.log('[e2e-prewarm][diag] 进程 top12（pid,pcpu,已运行秒,comm）：\n' + top);
  const latest = sh(`ls -t ${q(weappLogDir())} 2>/dev/null | head -1`);
  if (latest) {
    const tail = sh(`tail -n 80 ${q(path.join(weappLogDir(), latest))} 2>/dev/null`);
    if (tail) {
      console.log(`[e2e-prewarm][diag] 最新小程序日志 ${latest}（末 80 行）：`);
      tail.split('\n').forEach((l) => console.log('[e2e-prewarm][diag]   ' + l));
    } else {
      console.log(`[e2e-prewarm][diag] 最新日志 ${latest} 为空（appservice 尚无输出）`);
    }
  } else {
    console.log('[e2e-prewarm][diag] WeappLog 无日志文件（appservice 未产出日志 → 首屏可能未进入编译阶段）');
  }
}
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rj) => setTimeout(() => rj(new Error(`${label || 'op'} 超时（${ms}ms）`)), ms)),
  ]);
}

function resolveCli() {
  if (process.env.DEVTOOLS_CLI) return process.env.DEVTOOLS_CLI;
  const base = path.join(os.homedir(), 'wechat-devtools', 'app', 'opt', 'apps');
  try {
    for (const app of fs.readdirSync(base)) {
      const cli = path.join(base, app, 'files', 'bin', 'bin', 'wechat-devtools-cli');
      if (fs.existsSync(cli)) return cli;
    }
  } catch (_) {
    /* 目录不存在 → 用默认名，后续 launch 会报清晰错误 */
  }
  return path.join(base, 'io.github.msojocs.wechat-devtools-linux', 'files', 'bin', 'bin', 'wechat-devtools-cli');
}

const CLI_PATH = resolveCli();

// cli quit：干净退出主 IDE（带超时防挂死）。会杀主 IDE；持隧道的 renderer 会孤儿化（占 PREWARM_PORT）。
async function quitCli(cliPath) {
  const q = spawn(cliPath, ['quit'], {
    env: { ...process.env, DISPLAY, WDT_DISPLAY: DISPLAY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  q.stdout.on('data', (d) => (out += d));
  q.stderr.on('data', (d) => (out += d));
  const code = await new Promise((res) => {
    const t = setTimeout(() => res(null), 30000);
    q.on('close', (c) => { clearTimeout(t); res(c); });
    q.on('error', () => { clearTimeout(t); res(null); });
  });
  if (code === 0) {
    console.log('[e2e-prewarm] IDE 主进程已干净退出（cli quit）。');
  } else {
    console.warn(`[e2e-prewarm] cli quit code=${code}（残留进程交给 globalSetup stopAllIde）：${out.trim().slice(-200)}`);
  }
}

async function main() {
  const sock = path.join('/tmp', '.X11-unix', 'X' + DISPLAY.replace(':', ''));
  if (!fs.existsSync(sock)) {
    console.error(`[e2e-prewarm] X11 ${DISPLAY} socket 不存在（${sock}），需先起 Xvfb。退出。`);
    process.exit(1);
  }

  const t0 = Date.now();
  console.log(
    `[e2e-prewarm] 冷启 DevTools 焐热编译缓存（cli=${CLI_PATH}\n` +
      `  project=${PROJECT_PATH}\n` +
      `  port=${PREWARM_PORT} display=${DISPLAY}）...`,
  );

  // 第 1 步：与 e2e globalSetup 同一启动路径冷启 IDE（stopAllIde + ensureX11Display + ensureIde，
  // nw 二进制直接拉起、等服务端口文件，实测 ~9-15s）。同步执行完才继续。
  ensureDevtools();
  console.log(`[e2e-prewarm] IDE 已冷启（复用 e2e ensureDevtools 路径），耗时 ${Date.now() - t0}ms`);

  // 第 2 步：IDE 已在跑，automator.launch 只建隧道（cli auto --auto-port 9421，实测 ~13s）
  // + 打开工程。trustProject: 移植版适配补丁 B（同 e2e/helpers/runtime.js）。
  const mp = await automator.launch({
    cliPath: CLI_PATH,
    projectPath: PROJECT_PATH,
    port: PREWARM_PORT,
    trustProject: true,
    timeout: 60000,
  });
  console.log(`[e2e-prewarm] 隧道已建立（端口 ${PREWARM_PORT}），累计 ${Date.now() - t0}ms`);

  // 等首屏就绪：currentPage 能 resolve 即 App 已可驱动（首屏编译完成 → 编译缓存焐热）。
  // 移植版就绪前 currentPage 静默挂起（非报错），短轮询兜底，上限 READY_TIMEOUT。
  const deadline = Date.now() + READY_TIMEOUT;
  let ready = false;
  let lastDiag = 0;
  while (Date.now() < deadline && !ready) {
    try {
      await withTimeout(mp.currentPage(), 4000, 'currentPage(首屏)');
      ready = true;
    } catch (_) {
      await sleep(500);
    }
    // 诊断：首屏迟迟不 ready 时，每 ~15s 打一次现场（进程/缓存/IDE 日志），便于定位冷机卡点。
    const now = Date.now();
    if (!ready && now - lastDiag >= 15000) {
      lastDiag = now;
      console.log(`[e2e-prewarm][diag] 首屏未就绪（已等 ${Math.round((now - t0) / 1000)}s）：${snapshot()}`);
    }
  }
  if (!ready) {
    dumpDiagnostics(`首屏 ${READY_TIMEOUT}ms 内未就绪（测试 bootstrap 将自行 launch 重试）`);
    console.error(`[e2e-prewarm] 首屏 ${READY_TIMEOUT}ms 内未就绪，退出（测试 bootstrap 将自行 launch 重试）。`);
    process.exit(1);
  }
  console.log(`[e2e-prewarm] 首屏就绪，编译缓存已焐热，总耗时 ${Date.now() - t0}ms。`);
  dumpDiagnostics('首屏就绪');

  // 第 3 步：干净退出主 IDE：把进程留给 globalSetup 的 ensureIde 冷启（补丁 D 每轮冷启，确定性优先）。
  // 编译缓存在盘、不随 cli quit 清除 → 测试冷启新 IDE 后重编译走热缓存。
  await quitCli(CLI_PATH);
  process.exit(0);
}

main().catch((e) => {
  console.error('[e2e-prewarm] 预热失败：', e && e.message ? e.message : e);
  process.exit(1);
});