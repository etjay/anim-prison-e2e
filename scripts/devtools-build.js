#!/usr/bin/env node
// DevTools 构建脚本（对应 `npm run build`）。
//
// 在本 Linux 机上通过社区移植版微信开发者工具（msojocs/wechat-web-devtools-linux）
// 的 CLI 对 miniprogram/ 子工程执行构建/校验。
//
// 子命令：
//   --open     用 DevTools 打开工程（便于手动走通 5 页；GUI 跑在 X11 虚拟显示上）
//   --preview  生成预览（需已登录）
//   --build    （默认）build-npm：编译 miniprogram 的 npm 依赖并校验工程配置
//
// Linux 上的关键点（本脚本已自动处理，见 docs/environment.md）：
//   1) DevTools GUI（nw.js/Chromium）需要一个 X11 显示。本机桌面是 Wayland，
//      所以默认在 :97 上起一个 Xvfb 软件渲染显示（可用 WDT_DISPLAY 覆盖）。
//   2) CLI 通过「服务端口」驱动 IDE；IDE 冷启动较慢，若 IDE 未在运行，脚本会
//      先拉起 IDE 并等待其端口文件（~/.config/wechat-devtools/Default/.ide）就绪。
//   3) 无 GPU 的虚拟显示下加 --disable-gpu 走软件渲染。
//
// 路径解析优先级：
//   - DEVTOOLS_CLI   指定 CLI 脚本（可选；仅在你已自行启动 IDE 时用）
//   - DEVTOOLS_ROOT  指定 DevTools 安装根目录（含 nwjs/ 与 bin/wechat-devtools-cli）
//   - 默认在 ~/wechat-devtools 下自动发现（社区 .deb 解包布局）
//
// DevTools / CLI 缺失时：显式报错并给出指引（不静默绕过，见 T1.1 协调约束）。

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MINIPROGRAM_DIR = path.join(ROOT, 'miniprogram');
const HOME = os.homedir();

// 无 GPU 虚拟显示下走软件渲染；IDE 已运行时该参数被忽略，不影响热启动。
const GPU_FLAG = ['--disable-gpu'];
// 自动化/CLI 远程端口（与 GUI 无冲突的固定值）。
const REMOTE_PORT = '9390';

// X11 虚拟显示（Xvfb）。本机 Wayland 会话下 GUI 无法直接连 :0，用 Xvfb。
const X11_DISPLAY = process.env.WDT_DISPLAY || ':97';

function log(...a) {
  console.log('[devtools-build]', ...a);
}

function sleep(ms) {
  spawnSync('sleep', [(ms / 1000).toFixed(3)]);
}

// 按进程名（comm，非完整命令行）统计，避免 pgrep -f 匹配到调用它的 wrapper bash 自身。
function pgrepCount(name) {
  const r = spawnSync('bash', ['-lc', `pgrep -c -- "${name}" 2>/dev/null || true`], { encoding: 'utf8' });
  const n = parseInt((r.stdout || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

// ---- DevTools 安装根目录发现（含 nwjs/ 与 bin/wechat-devtools-cli） ----
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
const IDE_PORT_FILE = path.join(
  process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'),
  'wechat-devtools', 'Default', '.ide',
);

function cliPath() {
  if (process.env.DEVTOOLS_CLI) return process.env.DEVTOOLS_CLI;
  return path.join(DT_ROOT, 'bin', 'wechat-devtools-cli');
}

// ---- 1) 确保 X11 显示可用（必要时起 Xvfb） ----
function ensureX11Display() {
  const sock = path.join('/tmp', '.X11-unix', 'X' + X11_DISPLAY.replace(':', ''));
  const up = pgrepCount('Xvfb') > 0 && fs.existsSync(sock);
  if (up) {
    log(`X11 ${X11_DISPLAY} 已在运行（Xvfb）`);
    return;
  }
  log(`启动 Xvfb 于 ${X11_DISPLAY} ...`);
  try { fs.rmSync(sock, { force: true }); } catch (_) { /* ignore */ }
  const x = spawn('Xvfb', [X11_DISPLAY, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
    stdio: 'ignore', detached: true,
  });
  x.unref();
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(sock)) { log(`Xvfb ${X11_DISPLAY} 就绪`); return; }
    sleep(500);
  }
  throw new Error(`Xvfb 未在 ${X11_DISPLAY} 上就绪（20×500ms）。可检查 Xvfb 是否已安装。`);
}

// ---- 2) 确保 DevTools GUI 在运行且服务端口已知 ----
function idePortFile() {
  try { return fs.readFileSync(IDE_PORT_FILE, 'utf8').trim(); } catch (_) { return ''; }
}

function ensureIde() {
  if (idePortFile() && pgrepCount('nw') > 0) {
    log(`DevTools 已在运行，服务端口=${idePortFile()}`);
    return;
  }
  log('拉起微信开发者工具（headless，Xvfb）...');
  const ide = spawn(NW_BIN, [
    '.', '--cli', '--remote-port', REMOTE_PORT,
    '--disable-gpu', '--enable-service-port',
  ], {
    cwd: DT_ROOT,
    env: { ...process.env, DISPLAY: X11_DISPLAY, WECHAT_DEVTOOLS_DIR: path.join(DT_ROOT, 'nwjs') },
    stdio: 'ignore', detached: true,
  });
  ide.unref();
  for (let i = 0; i < 60; i++) {
    if (idePortFile()) { log(`DevTools 就绪，服务端口=${idePortFile()}`); return; }
    sleep(1000);
  }
  throw new Error(`DevTools 未在 60s 内打开服务端口（${IDE_PORT_FILE}）。可先手动跑 `
    + `DISPLAY=${X11_DISPLAY} ${NW_BIN} . --cli --remote-port ${REMOTE_PORT} --disable-gpu --enable-service-port 观察日志。`);
}

function runCli(cli, args) {
  const r = spawnSync(cli, args, {
    stdio: 'inherit', cwd: MINIPROGRAM_DIR,
    env: { ...process.env, DISPLAY: X11_DISPLAY },
  });
  return r.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--open')
    ? 'open'
    : args.includes('--preview')
      ? 'preview'
      : 'build';

  const cli = cliPath();
  log(`mode=${mode}`);
  log(`project=${MINIPROGRAM_DIR}`);
  log(`display=${X11_DISPLAY} root=${DT_ROOT}`);
  log(`cli=${cli}${process.env.DEVTOOLS_CLI ? ' (source=env:DEVTOOLS_CLI)' : ''}`);

  if (!fs.existsSync(cli)) {
    console.error([
      '',
      '❌ 未找到微信开发者工具 CLI。',
      `   期望路径：${path.join(DT_ROOT, 'bin', 'wechat-devtools-cli')}`,
      '   处理：',
      '   1) 安装社区 Linux 版（见 docs/environment.md / scripts/install-devtools.sh）；',
      `   2) 或用环境变量指定：DEVTOOLS_CLI=/path/to/wechat-devtools-cli、DEVTOOLS_ROOT=/path/to/files/bin`,
    ].join('\n'));
    process.exit(2);
  }

  if (mode !== 'open' || !process.env.DEVTOOLS_CLI) {
    // 需要 GUI 参与的命令：确保 X11 显示 + IDE 在运行。
    // （当用户已自行启动 IDE 且设了 DEVTOOLS_CLI 的 open 场景，可跳过自动拉起。）
    ensureX11Display();
    ensureIde();
  }

  let ok;
  if (mode === 'open') {
    ok = runCli(cli, ['open', ...GPU_FLAG, '--project', MINIPROGRAM_DIR]);
  } else if (mode === 'preview') {
    ok = runCli(cli, ['preview', ...GPU_FLAG, '--project', MINIPROGRAM_DIR]);
  } else {
    // build-npm：编译 npm 依赖并校验工程配置。骨架无 npm 依赖时，
    // IDE 会提示 __NO_NODE_MODULES__（无包可打包），但仍以 exit 0 完成（工程校验通过）。
    ok = runCli(cli, ['build-npm', ...GPU_FLAG, '--project', MINIPROGRAM_DIR]);
  }

  if (!ok) {
    console.error('❌ DevTools 构建失败（见上方 CLI 输出）。');
    process.exit(1);
  }
  console.log(`\n✅ DevTools ${mode} 成功。`);
  if (mode === 'build') {
    console.log('   提示：骨架未引入 npm 依赖，build-npm 为工程校验通过（__NO_NODE_MODULES__ 属正常）。');
    console.log(`   手动走通 5 页：npm run build -- --open，然后连入显示 ${X11_DISPLAY}（如 vnc）。`);
  }
}

main();