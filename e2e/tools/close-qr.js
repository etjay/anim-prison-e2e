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
const { spawnSync } = require('child_process');

const PY = path.join(__dirname, 'close-qr.py');

function log(...a) {
  console.log('[close-qr]', ...a);
}

// 返回 { ok, closed, hit, count };失败/未启用返回 { skipped: true }。
function closeLoginWindow() {
  if (process.env.E2E_QR_NOQP) {
    log('E2E_QR_NOQP 已设，跳过关闭浮窗');
    return { skipped: true };
  }
  const action = process.env.E2E_QR_ACTION || 'close';
  let py = null;
  try {
    py = spawnSync(
      'python3',
      [PY, '--' + action],
      { env: { ...process.env }, encoding: 'utf8', timeout: 60000 },
    );
  } catch (e) {
    log('spawn python 失败：', e);
    return { skipped: true, error: String(e) };
  }
  if (py.status !== 0) {
    log(`${action} 异常退出 code=${py.status}（不阻断）`);
    if (py.stderr) log(py.stderr);
    return { ok: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(py.stdout);
  } catch (_) {
    log('未拿到 JSON（不阻断）：', py.stdout && py.stdout.slice(-300));
    return { ok: false };
  }
  if (parsed && parsed.ok) {
    log(`浮窗 ${action}：${parsed.closed ? '已关闭' : '未关闭'} — ${parsed.detail || ''}`);
  }
  return parsed;
}

module.exports = { closeLoginWindow };
