#!/usr/bin/env node
// DevTools CLI 构建脚本（对应 `npm run build`）。
//
// 通过微信开发者工具 CLI 对 miniprogram/ 子工程执行构建/校验。
// 子命令：
//   --open     用 DevTools 打开工程（便于手动走通 5 页）
//   --preview  生成预览
//   --build    （默认）build-npm：编译 miniprogram 的 npm 依赖并校验工程配置
//
// CLI 路径解析优先级：
//   1. 环境变量 DEVTOOLS_CLI（推荐，跨机器/跨版本最稳）
//   2. 按平台默认路径推断（macOS / Linux / Windows）
//
// DevTools 缺失 / 路径异常时：显式报错并给出指引（不静默绕过，见 T1.1 协调约束）。

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MINIPROGRAM_DIR = path.join(ROOT, 'miniprogram');

function defaultCliPath(platform) {
  switch (platform) {
    case 'darwin':
      // 需求文档（Q3）记录的默认 macOS 路径：
      return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    case 'linux':
      // Linux 版 DevTools stable 的 CLI（按官方安装位置推断，可用 DEVTOOLS_CLI 覆盖）：
      return path.join(os.homedir(), '.wechatwebdevtools', 'cli');
    case 'win32':
      return 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
    default:
      return '';
  }
}

function resolveCli() {
  const fromEnv = process.env.DEVTOOLS_CLI;
  if (fromEnv) return { cli: fromEnv, source: 'env:DEVTOOLS_CLI' };
  const inferred = defaultCliPath(process.platform);
  if (!inferred) {
    return { cli: '', source: `platform:${process.platform}(no default)` };
  }
  return { cli: inferred, source: `platform:${process.platform}` };
}

function runCli(cli, args) {
  const res = spawnSync(cli, args, { stdio: 'inherit', cwd: MINIPROGRAM_DIR });
  return res.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--open')
    ? 'open'
    : args.includes('--preview')
      ? 'preview'
      : 'build';

  const { cli, source } = resolveCli();
  console.log(`[devtools-build] mode=${mode}`);
  console.log(`[devtools-build] project=${MINIPROGRAM_DIR}`);

  if (!cli) {
    console.error(
      [
        '',
        '❌ 未找到微信开发者工具 CLI（DevTools）。',
        '   当前平台 ' + process.platform + ' 无默认路径，或默认路径不存在。',
        '   处理：',
        '   1) 安装 WeChat DevTools（stable）并登录开发者账号；',
        '   2) 通过环境变量指定 CLI 实际路径后重试：',
        '        DEVTOOLS_CLI=/path/to/cli npm run build',
        '   详见 docs/environment.md 的“CLI 路径 / 版本记录”。',
      ].join('\n'),
    );
    process.exit(2);
  }

  console.log(`[devtools-build] cli=${cli} (source=${source})`);
  if (!fs.existsSync(cli)) {
    console.error(
      [
        '',
        '❌ DevTools CLI 路径不存在：' + cli,
        '   请用 DEVTOOLS_CLI 覆盖为实际路径后重试（不静默绕过）。',
      ].join('\n'),
    );
    process.exit(2);
  }

  let ok;
  if (mode === 'open') {
    ok = runCli(cli, ['open', '--project', MINIPROGRAM_DIR]);
  } else if (mode === 'preview') {
    ok = runCli(cli, ['preview', '--project', MINIPROGRAM_DIR]);
  } else {
    // build-npm：编译 miniprogram 的 npm 依赖并校验工程配置。
    ok = runCli(cli, ['build-npm', '--project', MINIPROGRAM_DIR]);
  }

  if (!ok) {
    console.error('❌ DevTools 构建失败（见上方 CLI 输出）。');
    process.exit(1);
  }
  console.log(`✅ DevTools ${mode} 成功。`);
}

main();