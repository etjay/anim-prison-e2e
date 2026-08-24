#!/usr/bin/env node
'use strict';
// E2E CI 预热：跑测试前把「主工程首屏编译」这一最慢步骤先做掉，焐热 **on-disk 编译缓存**
// （~/.config/wechat-devtools/WeappCache/），让测试冷启 IDE 后重编译走热缓存、秒过
// e2e/helpers/runtime.js 的 waitForAppReady（30s 硬上限，测试域，CI 侧不改）。
//
// 为什么需要：社区移植版首屏编译慢，CI 冷机（ubuntu-latest 共享 runner）首屏实测 >30s
// → 冒烟用例报「App 30s 内未就绪」。本地热 IDE 首屏 ~8s，差异全在冷编译缓存。
//
// 机制（关键，与早期「留热隧道」设想不同）：
//   1) 本脚本用**独立隧道端口 9421**（E2E_PREWARM_PORT）冷启 IDE + 打开 miniprogram 工程
//      + 等首屏编译完成 → 编译缓存在盘焐热（缓存按工程 hash 存盘，与隧道端口无关）。
//   2) `cli quit` 干净退出主 IDE。持隧道的 appservice renderer 会孤儿化——但它占的是 9421
//      不是测试的 9420，不冲突（见下方「为什么用 9421」）。
//   3) 测试 `npm run e2e` 的 globalSetup 每轮 stopAllIde 冷启**新** IDE（补丁 D），但编译缓存
//      在盘、跨 IDE 重启存活 → 测试 cli auto --auto-port 9420 + 重编译走热缓存，waitForAppReady 秒过。
//
// 为什么用 9421 而不是 9420（与测试 AUTO_PORT 不同端口）：
//   持隧道的 appservice renderer 在 `cli quit` 与 globalSetup 的 stopAllIde pkill 下都会漏杀而
//   孤儿化——其 cmdline 为 `/proc/self/exe --type=renderer ... --nwapp-path=<DT_ROOT>/...`，
//   `--type=renderer` 在 DT_ROOT **之前**，故 stopAllIde 的正则 `${DT_ROOT}.*--type=renderer`
//   不匹配。若预热也占 9420，孤儿 renderer 会一直占着 9420，测试 cli auto --auto-port 9420
//   永远监听不上 → automator 连不上。改用 9421：孤儿占 9421，9420 干净留给测试。
//
// 职责边界（部署运维）：只起 IDE / 等编译 / 焐热盘缓存 / 干净退出，不改 e2e/ 用例与 helper，
// 不驱动页面、不断言。失败退出非 0（continue-on-error 下测试 bootstrap 仍会自行 launch 兜底）。
//
// 环境变量：
//   E2E_PREWARM_PORT    预热隧道端口（默认 9421；须不同于测试 AUTO_PORT 9420）
//   E2E_PREWARM_TIMEOUT 首屏就绪轮询上限 ms（默认 90000，冷机给足；超时退出非 0）
//   DEVTOOLS_CLI        显式指定 CLI 路径（默认按 ~/wechat-devtools/app/opt/apps/*/files/bin/bin 探测）
//   WDT_DISPLAY         X11 display（默认 :97；须已由前置 Xvfb 起好，nw 为 GUI 需 DISPLAY）

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const automator = require('miniprogram-automator');
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;

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
// 与 runtime.js 一致：框架驱动主工程 miniprogram/（spike 最小工程不参与 suite）。
const PROJECT_PATH = path.resolve(__dirname, '..', 'miniprogram');
// IDE 单例端口文件（同 ensure-devtools.js 的 IDE_PORT_FILE）：陈旧 .ide 会让 cli auto 连死 IDE。
const IDE_PORT_FILE = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'wechat-devtools', 'Default', '.ide',
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
// 注：withTimeout 在文件上部 checkVersion 补丁中已先于此处使用（函数声明提升，可用）。
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rj) => setTimeout(() => rj(new Error(`${label || 'op'} 超时（${ms}ms）`)), ms)),
  ]);
}

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
    console.error(`[e2e-prewarm] X11 ${DISPLAY} socket 不存在（${sock}），需先起 Xvfb :97。退出。`);
    process.exit(1);
  }
  // 清陈旧单例端口文件，保证干净冷启（否则 cli auto 可能连到上一轮残留的死 IDE）。
  try { fs.unlinkSync(IDE_PORT_FILE); } catch (_) { /* 不存在则忽略 */ }

  const t0 = Date.now();
  console.log(
    `[e2e-prewarm] 冷启 DevTools 焐热编译缓存（cli=${CLI_PATH}\n` +
      `  project=${PROJECT_PATH}\n  port=${PREWARM_PORT} display=${DISPLAY}）...`,
  );

  // 冷启 IDE + 打开工程 + 建隧道（trustProject: 移植版适配补丁 B）。用独立端口 9421。
  const mp = await automator.launch({
    cliPath: CLI_PATH,
    projectPath: PROJECT_PATH,
    port: PREWARM_PORT,
    trustProject: true,
    timeout: 60000,
  });
  console.log(`[e2e-prewarm] 隧道已建立（端口 ${PREWARM_PORT}），耗时 ${Date.now() - t0}ms`);

  // 等首屏就绪：currentPage 能 resolve 即 App 已可驱动（首屏编译完成 → 编译缓存焐热）。
  // 移植版就绪前 currentPage 静默挂起（非报错），短轮询兜底，上限 READY_TIMEOUT。
  const deadline = Date.now() + READY_TIMEOUT;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      await withTimeout(mp.currentPage(), 4000, 'currentPage(首屏)');
      ready = true;
    } catch (_) {
      await sleep(500);
    }
  }
  if (!ready) {
    console.error(`[e2e-prewarm] 首屏 ${READY_TIMEOUT}ms 内未就绪，退出（测试 bootstrap 将自行 launch 重试）。`);
    process.exit(1);
  }
  console.log(`[e2e-prewarm] 首屏就绪，编译缓存已焐热，总耗时 ${Date.now() - t0}ms。`);

  // 干净退出主 IDE：把进程留给 globalSetup 的 ensureIde 冷启（补丁 D 每轮冷启，确定性优先）。
  // 编译缓存在盘、不随 cli quit 清除 → 测试冷启新 IDE 后重编译走热缓存。
  await quitCli(CLI_PATH);
  process.exit(0);
}

main().catch((e) => {
  console.error('[e2e-prewarm] 预热失败：', e && e.message ? e.message : e);
  process.exit(1);
});