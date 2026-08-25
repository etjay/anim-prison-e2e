#!/usr/bin/env node
// E2E 环境引导脚本（T2.2 框架共享，源自 T2.1 spike 的 ensure-devtools.js）。
//
// 职责：确保 X11 虚拟显示（Xvfb）与 DevTools IDE（服务端口）就绪，且每轮
// 干净重启 IDE（spike 报告 §4 补丁 D：auto tunnel 单例残留 → 孤儿 appservice
// renderer 占旧 tunnel 端口 → automator 永久连不上）。
//
//   1) 无 X11 显示时在本机起 Xvfb（:97，可用 WDT_DISPLAY 覆盖）；
//   2) 停止所有 IDE 进程（cli quit + 杀孤儿 renderer），保证 94xx 端口干净；
//   3) 冷启 IDE（--disable-gpu --enable-service-port）并等待服务端口文件。
//
// 用法：
//   - 直接运行（npm run e2e / e2e:spike 的前置步骤）：node e2e/tools/ensure-devtools.js
//   - 模块方式（Jest globalSetup）：require('./tools/ensure-devtools').ensureDevtools()
//
// 注意：本脚本只做 IDE/显示的前置条件，不代替 automator 打开工程；
// automator.launch 由 e2e/helpers/runtime.js 在测试进程内完成。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const X11_DISPLAY = process.env.WDT_DISPLAY || ':97';
const REMOTE_PORT = '9390';
const IDE_PORT_FILE = path.join(
  process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'),
  'wechat-devtools', 'Default', '.ide',
);

function log(...a) {
  console.log('[ensure-devtools]', ...a);
}

function sleep(ms) {
  spawnSync('sleep', [(ms / 1000).toFixed(3)]);
}

function pgrepCount(name) {
  const r = spawnSync('bash', ['-lc', `pgrep -c -- "${name}" 2>/dev/null || true`], { encoding: 'utf8' });
  const n = parseInt((r.stdout || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function devtoolsRoot() {
  if (process.env.DEVTOOLS_ROOT) return process.env.DEVTOOLS_ROOT;
  const base = path.join(HOME, 'wechat-devtools');
  const apps = path.join(base, 'app', 'opt', 'apps');
  try {
    for (const app of fs.readdirSync(apps)) {
      const bin = path.join(apps, app, 'files', 'bin');
      if (fs.existsSync(path.join(bin, 'package.nw')) && fs.existsSync(path.join(bin, 'bin', 'wechat-devtools-cli'))) {
        return bin;
      }
    }
  } catch (_) {
    /* not the extracted-deb layout */
  }
  return path.join(base, 'files', 'bin');
}

const DT_ROOT = devtoolsRoot();
const NW_BIN = path.join(DT_ROOT, 'nwjs', 'nw');
const CLI = process.env.DEVTOOLS_CLI || path.join(DT_ROOT, 'bin', 'wechat-devtools-cli');

// 残留自动化状态的彻底清理：`cli quit` 只杀主进程，上一轮会话的
// appservice renderer 可能成为孤儿进程、继续持有旧 tunnel 端口（ws 可连但
// 无响应）。IDE 的自动化服务是单例，旧 tunnel 占着时新一轮 cli auto 的新
// --auto-port 永远不监听 → automator 连不上。策略：每轮都干净重启 IDE。
function stopAllIde() {
  const mainAlive = pgrepCount('nw') > 0;
  if (mainAlive) {
    log('停止 DevTools（清理残留自动化会话）...');
    try {
      spawnSync(CLI, ['quit'], { env: { ...process.env, DISPLAY: X11_DISPLAY }, encoding: 'utf8', timeout: 15000 });
    } catch (_) {
      /* CLI 退出失败不阻断，后面有兜底 */
    }
  }
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (pgrepCount('nw') === 0) break;
    sleep(500);
  }
  // 孤儿 renderer 兜底：按安装路径精确匹配，全部杀掉。
  spawnSync(
    'bash',
    ['-lc', `pkill -9 -f "${DT_ROOT.replace(/\//g, '\\/')}.*--type=renderer" 2>/dev/null || true`],
  );
  const start2 = Date.now();
  while (Date.now() - start2 < 5000) {
    if (pgrepCount('nw') === 0) {
      if (mainAlive) log('DevTools 已完全退出');
      return;
    }
    sleep(500);
  }
  log('警告：仍有 nw 进程未退出，继续');
}

function ensureX11Display() {
  const sock = path.join('/tmp', '.X11-unix', 'X' + X11_DISPLAY.replace(':', ''));
  if (pgrepCount('Xvfb') > 0 && fs.existsSync(sock)) {
    log(`X11 ${X11_DISPLAY} 已在运行（Xvfb）`);
    return false;
  }
  log(`启动 Xvfb 于 ${X11_DISPLAY} ...`);
  try {
    fs.rmSync(sock, { force: true });
  } catch (_) {
    /* ignore */
  }
  const x = spawn('Xvfb', [X11_DISPLAY, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
    stdio: 'ignore',
    detached: true,
  });
  x.unref();
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(sock)) {
      log(`Xvfb ${X11_DISPLAY} 就绪`);
      return true;
    }
    sleep(500);
  }
  throw new Error(`Xvfb 未在 ${X11_DISPLAY} 上就绪（20×500ms）`);
}

function ensureIde() {
  const portFile = () => {
    try {
      return fs.readFileSync(IDE_PORT_FILE, 'utf8').trim();
    } catch (_) {
      return '';
    }
  };
  // stopAllIde 后总是冷启动（确定性优先；冷启动实测 ~15s）。
  if (portFile()) {
    try {
      fs.rmSync(IDE_PORT_FILE);
    } catch (_) {
      /* ignore */
    }
  }
  log('拉起微信开发者工具（headless，Xvfb）...');
  const ide = spawn(
    NW_BIN,
    ['.', '--cli', '--remote-port', REMOTE_PORT, '--disable-gpu', '--enable-service-port'],
    {
      cwd: DT_ROOT,
      env: { ...process.env, DISPLAY: X11_DISPLAY, WECHAT_DEVTOOLS_DIR: path.join(DT_ROOT, 'nwjs') },
      stdio: 'ignore',
      detached: true,
    },
  );
  ide.unref();
  for (let i = 0; i < 60; i++) {
    if (portFile()) {
      log(`DevTools 就绪，服务端口=${portFile()}`);
      return true;
    }
    sleep(1000);
  }
  throw new Error(`DevTools 未在 60s 内打开服务端口（${IDE_PORT_FILE}）`);
}

// 幂等：Xvfb/IDE 已在运行时走热启动路径，不重复冷启。
// 供 Jest globalSetup 调用；npm 入口（ensure 作为独立前置步骤）也调用同一入口。
function ensureDevtools() {
  if (!fs.existsSync(CLI)) {
    console.error(`[ensure-devtools] ❌ 未找到 CLI：${CLI}\n   用 scripts/install-devtools.sh 安装，或设 DEVTOOLS_CLI/DEVTOOLS_ROOT。`);
    process.exit(2);
  }
  if (!fs.existsSync(NW_BIN)) {
    console.error(`[ensure-devtools] ❌ 未找到 nwjs：${NW_BIN}\n   用 scripts/install-devtools.sh 安装，或设 DEVTOOLS_ROOT。`);
    process.exit(2);
  }
  // 每轮干净重启 IDE，避免残留 auto tunnel 干扰 automator 端口探测（补丁 D）。
  stopAllIde();
  const x = ensureX11Display();
  const i = ensureIde();
  log(`CLI=${CLI}`);
  log(`DISPLAY=${X11_DISPLAY}（测试进程请带此 DISPLAY 运行）`);
  if (x || i) log('冷启动完成。');
  else log('均为热启动（Xvfb/IDE 已在运行）。');
}

function main() {
  ensureDevtools();
}

if (require.main === module) {
  main();
}

module.exports = {
  ensureDevtools,
  stopAllIde,
  ensureX11Display,
  ensureIde,
  main,
  CLI_PATH: CLI,
  X11_DISPLAY,
};