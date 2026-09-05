'use strict';
// close-qr（ANIM-25）：关闭开发者工具启动后弹出的登录/授权/二维码浮层窗口。
//
// 入口：Jest globalSetup 在 ensureDevtools() 之后调用 closeLoginWindow()（best-effort，
//   关闭失败不阻断测试——录屏「无浮窗」是期望目标，不是套件断言）。
// 实现：调用同目录 close-qr.py（python-xlib），连接 WDT_DISPLAY 上的窗口树，
//   识别登录/二维码相关窗口并请求关闭（WM_DELETE_WINDOW 协议 → 点击关闭钮兜底）。
// 输出：Python 返回 JSON；失败时打警告继续（与 record.js 的「录屏失败不阻断」约定一致）。
//
// 环境变量：
//   E2E_QR_ACTION   close（默认，诊断+关闭）/ diag（只列出窗口树，安全摸结构）
//   E2E_QR_NOQP     任意非空值跳过本模块（临时关闭，供测试/排障）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PY = path.join(__dirname, 'close-qr.py');

function log(...a) {
  console.log('[close-qr]', ...a);
}

// 后台 spawn python 做「等卡片出现→点关闭→确认」。globalSetup 里调用不阻塞：
// 卡片在测试启动 App 之后才弹出，故本进程需与测试并行轮询。detached + stdio inherit
// → 输出直通 CI 日志（此前 spawnSync 吞掉诊断导致 blind 运行）。best-effort，失败不阻断套件。
function closeLoginWindow() {
  if (process.env.E2E_QR_NOQP) {
    log('E2E_QR_NOQP 已设，跳过关闭浮窗');
    return { skipped: true };
  }
  const action = process.env.E2E_QR_ACTION || 'close';
  try {
    const child = spawn('python3', [PY, '--' + action], {
      env: { ...process.env },
      stdio: 'inherit',
      detached: true,
    });
    child.unref();
    log(`已后台启动 close-qr（${action}，pid=${child.pid}）—— 不阻塞 globalSetup，与测试并行`);
    return { spawned: true, pid: child.pid };
  } catch (e) {
    log('spawn python 失败：', e);
    return { skipped: true, error: String(e) };
  }
}

module.exports = { closeLoginWindow };
