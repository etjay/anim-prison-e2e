#!/usr/bin/env node
'use strict';
// E2E CI 预热：跑测试前把「主工程首屏编译」这一最慢步骤先做掉，焐热 **on-disk 编译缓存**
// （~/.config/wechat-devtools/WeappCache/），让测试冷启 IDE 后重编译走热缓存、秒过
// e2e/helpers/runtime.js 的 waitForAppReady（30s 硬上限，测试域，CI 侧不改）。
//
// 为什么需要：社区移植版首屏编译慢，CI 冷机（ubuntu-latest 共享 runner）首屏实测 >30s
// → 冒烟用例报「App 30s 内未就绪」。本地热 IDE 首屏 ~8s，差异全在冷编译缓存。
//
// 关键机制（本脚本刻意「分段」启动 IDE，与测试自己的 globalSetup→bootstrap 保持一致）：
//   automator.launch 内部的 `cli auto` 在冷机上必须「冷启 IDE + 建隧道」一次完成，CI 实测
//   >60s（首版预热直接 launch，冷机撞 60s 超时，见 run #3）。测试自己把它拆成两段：
//     · ensureDevtools()（globalSetup）→ ensureIde() 用 nw 二进制冷启 IDE（CI ~9-15s）
//     · automator.launch()（bootstrap）→ `cli auto` 仅建隧道 + 触发首屏编译（CI ~13s）
//   本脚本复用**同一套** ensureDevtools() 先冷启 IDE（只读 import，不改 e2e/ 源码），
//   再 automator.launch 仅建隧道 + 编译首屏。两段各自都在安全时限内。
//
//   1) ensureDevtools()：stopAllIde + Xvfb（复用已预启的 :97）+ ensureIde 冷启 IDE。
//   2) automator.launch({ port: 9421 })：IDE 已在跑，cli auto 只需建隧道 + 打开 miniprogram
//      工程 + 等首屏编译完成 → 编译缓存在盘焐热（缓存按工程 hash 存盘，与隧道端口无关）。
//   3) stopAllIde() 干净退出主 IDE。持隧道的 appservice renderer 会孤儿化——但它占的是 9421
//      不是测试的 9420，不冲突（见下方「为什么用 9421」）。
//   4) 测试 `npm run e2e` 的 globalSetup 每轮 stopAllIde 冷启**新** IDE（补丁 D），但编译缓存
//      在盘、跨 IDE 重启存活 → 测试 cli auto --auto-port 9420 + 重编译走热缓存，waitForAppReady 秒过。
//
// 为什么用 9421 而不是 9420（与测试 AUTO_PORT 不同端口）：
//   持隧道的 appservice renderer 在 `cli quit` 与 stopAllIde 的 pkill 下都会漏杀而孤儿化——
//   其 cmdline 为 `/proc/self/exe --type=renderer ... --nwapp-path=<DT_ROOT>/...`，
//   `--type=renderer` 在 DT_ROOT **之前**，故 stopAllIde 的正则 `${DT_ROOT}.*--type=renderer`
//   不匹配。若预热也占 9420，孤儿 renderer 会一直占着 9420，测试 cli auto --auto-port 9420
//   永远监听不上 → automator 连不上。改用 9421：孤儿占 9421，9420 干净留给测试。
//
// 职责边界（部署运维）：只起 IDE / 等编译 / 焐热盘缓存 / 干净退出，不改 e2e/ 用例与 helper，
// 不驱动页面、不断言。失败退出非 0（continue-on-error 下测试 bootstrap 仍会自行 launch 兜底）。
//
// 环境变量：
//   E2E_PREWARM_PORT     预热隧道端口（默认 9421；须不同于测试 AUTO_PORT 9420）
//   E2E_PREWARM_TIMEOUT  首屏就绪轮询上限 ms（默认 90000，冷机给足；超时退出非 0）
//   WDT_DISPLAY          X11 display（默认 :97；须已由前置 Xvfb 起好，nw 为 GUI 需 DISPLAY）

const path = require('path');
const automator = require('miniprogram-automator');
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;

// 复用测试域的 IDE 启动/清理逻辑（只读 import，不改 e2e/ 源码）：
//   ensureDevtools() = stopAllIde + ensureX11Display + ensureIde（用 nw 二进制冷启 IDE）。
//   stopAllIde()     = cli quit + 杀孤儿 renderer（与 globalSetup 同一套，收尾确定性一致）。
//   CLI_PATH / X11_DISPLAY 为本机解析出的 CLI 路径与 X11 display。
const { ensureDevtools, stopAllIde, CLI_PATH, X11_DISPLAY } = require('../e2e/tools/ensure-devtools');

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
// automator.launch 超时：IDE 已由 ensureDevtools 冷启，`cli auto` 仅建隧道（CI ~13s），90s 极宽裕。
const LAUNCH_TIMEOUT = 90000;
// 与 runtime.js 一致：框架驱动主工程 miniprogram/（spike 最小工程不参与 suite）。
const PROJECT_PATH = path.resolve(__dirname, '..', 'miniprogram');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
// 注：withTimeout 在文件上部 checkVersion 补丁中先于此处定义处被调用（函数声明提升，可用）。
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rj) => setTimeout(() => rj(new Error(`${label || 'op'} 超时（${ms}ms）`)), ms)),
  ]);
}

async function main() {
  const t0 = Date.now();
  console.log(
    `[e2e-prewarm] 焐热编译缓存（cli=${CLI_PATH}\n` +
      `  project=${PROJECT_PATH}\n  port=${PREWARM_PORT} display=${X11_DISPLAY}）...`,
  );

  // 步骤 1：冷启 IDE（复用测试域 ensureDevtools：stopAllIde + Xvfb 复用 + ensureIde 冷启 nw）。
  // 单独先做，是为了把「冷启」从 automator.launch 的 `cli auto` 里拆出来（见文件头「关键机制」）。
  ensureDevtools();
  console.log(`[e2e-prewarm] IDE 冷启动完成，耗时 ${Date.now() - t0}ms`);

  // 步骤 2：打开工程 + 建隧道（IDE 已在跑，cli auto 只需建隧道 + 触发首屏编译）。
  const t1 = Date.now();
  const mp = await automator.launch({
    cliPath: CLI_PATH,
    projectPath: PROJECT_PATH,
    port: PREWARM_PORT,
    trustProject: true,
    timeout: LAUNCH_TIMEOUT,
  });
  console.log(`[e2e-prewarm] 隧道已建立（端口 ${PREWARM_PORT}），建隧道耗时 ${Date.now() - t1}ms`);

  // 步骤 3：等首屏就绪：currentPage 能 resolve 即 App 已可驱动（首屏编译完成 → 编译缓存焐热）。
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

  // 步骤 4：干净退出主 IDE（stopAllIde = cli quit + 杀孤儿 renderer，与 globalSetup 同一套）。
  // 把冷启交给测试 globalSetup（补丁 D 每轮冷启，确定性优先）；编译缓存在盘、跨重启存活。
  stopAllIde();
  process.exit(0);
}

main().catch((e) => {
  console.error('[e2e-prewarm] 预热失败：', e && e.message ? e.message : e);
  process.exit(1);
});