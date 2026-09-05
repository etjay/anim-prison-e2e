'use strict';
// E2E 全程录屏（可选：E2E_RECORD=1 开启，默认关闭、零开销）。
//
// 用途（T3.x 云 CI 方案，owner 已拍板）：GitHub Actions hosted runner 不能暴露
// 端口，测试运行期间用 ffmpeg x11grab 全程录 WDT_DISPLAY（默认 :97），产出全程
// mp4（约 40-60s 几 MB），随 Jest JSON / 失败截图一起上传为 job artifact ——
// 失败时「回看录像」定位，无需开端口、无需装客户端。
//
// 接线（两个入口）：
//   npm run e2e（T2.2 框架入口）：
//     global.setup.js    -> await startRecording(globalConfig)（在 ensureDevtools 之前，
//                           录像覆盖 Xvfb 启动、IDE 冷启、打开工程编译、全程测试）
//     global.teardown.js -> await stopRecording(globalConfig)（在 stopAllIde 之前，
//                           避免录像以进程被杀的黑屏收尾）
//   npm run e2e:spike（T2.1 历史入口，Xvfb 已由前置 ensure 启动）：
//     jest --globalSetup=e2e/tools/record.setup.js --globalTeardown=e2e/tools/record.teardown.js
//
// globalSetup 与 globalTeardown 运行在不同进程，状态经状态文件
// e2e/artifacts/.record.json 传递（Jest 30 的 globalConfig 被 freeze，不可直接挂属性）。
// 状态文件同时是孤儿防护：进程被 SIGKILL 时，下轮 ensure 可凭它清理未退出的 ffmpeg。
//
// 行为约定：
// - E2E_RECORD 未设/非 '1'：完全 no-op（不探 X socket、不 spawn 进程）；
// - 开启但 ffmpeg 缺失/X socket 未就绪：打警告继续跑 suite（录屏失败不阻断测试）；
// - 录像产物：e2e/artifacts/run-<时间戳>.mp4（目录已 gitignore）。
//
// 环境变量：
//   E2E_RECORD       =1 开启（默认关）
//   E2E_FFMPEG       ffmpeg 路径（默认按 PATH → ~/.local/bin/ffmpeg → ~/bin/ffmpeg 找）
//   E2E_RECORD_SIZE  录像尺寸（默认 1280x800，与 ensure-devtools 的 Xvfb 屏幕一致）
//   E2E_RECORD_MASK  二维码悬浮卡片遮罩框 X0:Y0:X1:Y1（像素，含边界）；默认 1005:135:1185:315
//                     （见下方 QR 卡片遮罩说明），设 none/空 关闭
//   E2E_RECORD_LOGIN_MASK  登录/授权浮层兑底遮罩框（ANIM-25 T3）。默认 auto：由
//                     globalSetup 在 seedLoginStub 之后传入「冷启前未登录」判定结果
//                     自动开关；none/0 强制关；X0:Y0:X1:Y1 强制开（几何覆盖默认值）。
//
// 二维码悬浮卡片遮罩（ANIM-3 缺陷修复，方案③ 兜底）：
//   DevTools 社区移植版在首屏编译成功后会弹出一张固定的「预览二维码」悬浮卡片
//   （约 152×152px，1280×800 布局下 x≈1010-1180, y≈140-310），覆盖模拟器面板右上、
//   持续到录制结束、遮挡全程录像。它是 IDE **运行时态**（redux window.previewComponent.show，
//   由 WINDOW_SET_PREVIEW_COMPONENT 动作置位），**不受持久化设置门控**——实测
//   autoPreview/keepPreviewQRCode 默认均为 false 但卡片仍弹出，故方案①（配置预设）
//   无法可靠消除；方案②（xdotool 点击关闭）依赖精确像素 + 时序、易误点模拟器。
//   故选方案③：在 ffmpeg x11grab 管道上加 drawbox 对固定区域加不透明遮罩——对测试
//   逻辑零影响（只改录像滤镜）、本地与 CI 同为固定 1280×800 Xvfb 布局故卡片位置确定、
//   确定性可验证（跑一次 E2E_RECORD=1 即可确认）。遮罩色取 IDE 暗色主题面板色，视觉
//   上与空面板融合。若 IDE 版本漂移导致卡片移位，调大 E2E_RECORD_MASK 即可，无需改代码。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const X11_DISPLAY = process.env.WDT_DISPLAY || ':97';
const RECORD_SIZE = process.env.E2E_RECORD_SIZE || '1280x800';
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');
const STATE_FILE = path.join(ARTIFACTS_DIR, '.record.json');

// 二维码悬浮卡片默认遮罩框（X0:Y0:X1:Y1，1280×800 布局）。实测卡片 x≈1022-1173、
// y≈150-301；留 ~10px 边距全盖住卡片 + 阴影。模拟器左侧与底部操作区不在此框内。
const DEFAULT_RECORD_MASK = '1005:135:1185:315';
// 遮罩填充色：DevTools 暗色主题面板色（近黑深灰），使遮罩区视觉同于空面板。
const RECORD_MASK_COLOR = '0x20242b';

// 登录/授权浮层兑底遮罩（ANIM-25 T3，默认几何 1280×800 布局，见下方说明）。
// 实测（本机 msojocs 社区版，项目 appid="touristappid"）：冷启后 IDE 在编辑器区
// 中央弹「更改 AppID 失败 (touristappid) / Error: tourist appid」对话框
// （x≈443-818，y≈48-192）；未登录时同区域还会出现登录/扫码浮层。两者都不遮挡
// 右侧模拟器预览区（x≈880 起），仅在录像中构成视觉干扰。取对话框外扩 ~13px：
// x0=430, y0=40, x1=830, y1=205。
const DEFAULT_LOGIN_MASK = '430:40:830:205';

// 解析 E2E_RECORD_MASK。返回 { x0, y0, x1, y1 }（合法）/ null（关闭）/ { error }（格式错）。
function parseRecordMask() {
  return parseMaskBox(process.env.E2E_RECORD_MASK || DEFAULT_RECORD_MASK);
}

// 通用遮罩框解析。返回 { x0, y0, x1, y1 }（合法）/ null（关闭）/ { error }（格式错）。
function parseMaskBox(raw) {
  const s = (raw || '').trim();
  if (!s || /^none$/i.test(s) || /^0$/.test(s)) return null;
  const parts = s.split(':');
  if (parts.length !== 4) return { error: `格式应为 X0:Y0:X1:Y1，实际="${s}"` };
  const nums = parts.map((t) => parseInt(t.trim(), 10));
  if (nums.some((n) => Number.isNaN(n))) return { error: `数值无效，实际="${s}"` };
  const [x0, y0, x1, y1] = nums;
  if (x1 <= x0 || y1 <= y0) return { error: `X1/Y1 须大于 X0/Y0，实际="${s}"` };
  if (x0 < 0 || y0 < 0 || x1 > 1280 || y1 > 800) return { error: `越界（0..1280 / 0..800），实际="${s}"` };
  return { x0, y0, x1, y1 };
}

// 登录浮层遮罩决策：E2E_RECORD_LOGIN_MASK=auto（默认）时取 opts.loginMask
// （globalSetup 在 seedLoginStub 后传入「冷启前未登录」）；none/0 强制关；坐标强制开。
function resolveLoginMask(opts) {
  const env = (process.env.E2E_RECORD_LOGIN_MASK || 'auto').trim();
  if (/^none$/i.test(env) || /^0$/.test(env)) return null;
  if (env === 'auto') return (opts && opts.loginMask) ? DEFAULT_LOGIN_MASK : null;
  return env;
}

function log(...a) {
  console.log('[e2e-record]', ...a);
}

function xSocket() {
  return path.join('/tmp', '.X11-unix', 'X' + X11_DISPLAY.replace(':', ''));
}

function resolveFfmpeg() {
  const candidates = [];
  if (process.env.E2E_FFMPEG) candidates.push(process.env.E2E_FFMPEG);
  candidates.push(
    path.join(os.homedir(), '.local', 'bin', 'ffmpeg'),
    path.join(os.homedir(), 'bin', 'ffmpeg'),
  );
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (_) {
      /* ignore */
    }
  }
  const r = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  const p = (r.stdout || '').trim();
  return p || null;
}

async function sleepMs(ms) {
  await new Promise((res) => setTimeout(res, ms));
}

function tsName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

// 在 globalSetup 调用（ensureX11Display 之后、ensureIde 之前；X socket 已就绪）。
// opts.loginMask：ANIM-25「冷启前未登录」判定（globalSetup 在 seedLoginStub 后传入），
// 控制登录浮层兑底遮罩的 auto 开关。返回 state（{ pid, out }）或 null。
async function startRecording(opts) {
  if (process.env.E2E_RECORD !== '1') return null;
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) {
    log(`⚠️ E2E_RECORD=1 但未找到 ffmpeg（试过 PATH / ~/.local/bin / ~/bin，可用 E2E_FFMPEG 指定），本轮不录像`);
    return null;
  }
  // Xvfb 由 ensureDevtools 稍后拉起：轮询等 X socket（15×500ms），
  // 保证录像从 Xvfb 创建、IDE 冷启开始。
  for (let i = 0; i < 30 && !fs.existsSync(xSocket()); i++) {
    await sleepMs(500);
  }
  if (!fs.existsSync(xSocket())) {
    log(`⚠️ X socket ${xSocket()} 未就绪（15s），本轮不录像`);
    return null;
  }
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  // 孤儿防护：上轮录像进程若仍在（如 suite 崩在 globalSetup、globalTeardown
  // 没跑完），先停掉，避免两个 ffmpeg 同录一屏。
  try {
    const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (prev && pidAlive(prev.pid)) {
      spawnSync('kill', ['-TERM', String(prev.pid)], { encoding: 'utf8' });
      await sleepMs(1000);
      if (pidAlive(prev.pid)) {
        spawnSync('kill', ['-9', String(prev.pid)], { encoding: 'utf8' });
      }
      log(`已停掉上轮残留录像进程 pid=${prev.pid}`);
    }
  } catch (_) {
    /* 无上一轮状态文件属正常 */
  }
  const out = path.join(ARTIFACTS_DIR, `run-${tsName()}.mp4`);
  // 二维码悬浮卡片遮罩（方案③）：在 x11grab 管道上加 drawbox 覆盖固定区域。
  // 只改录像滤镜、不触碰测试逻辑；掩码无效时降级为「不遮罩但继续录像」（录屏失败不阻断测试）。
  const filters = [];
  let maskLog = '';
  let mask = null;
  const parsed = parseRecordMask();
  if (parsed && parsed.error) {
    log(`⚠️ E2E_RECORD_MASK 无效（${parsed.error}），本轮不加遮罩`);
  } else if (parsed) {
    mask = parsed;
    const w = mask.x1 - mask.x0;
    const h = mask.y1 - mask.y0;
    filters.push(`drawbox=x=${mask.x0}:y=${mask.y0}:w=${w}:h=${h}:color=${RECORD_MASK_COLOR}:t=fill`);
    maskLog = `（QR 卡片遮罩 ${mask.x0}:${mask.y0}→${mask.x1}:${mask.y1}）`;
  }
  // 登录/授权浮层兑底遮罩（ANIM-25 T3）：冷启前未登录（含 stub 写入）时开启——
  // 主修复（login-stub）失效/IDE 版本漂移时，浮层仍会被这块不透明遮罩盖住。
  const loginRaw = resolveLoginMask(opts);
  if (loginRaw) {
    const lp = parseMaskBox(loginRaw);
    if (lp && lp.error) {
      log(`⚠️ E2E_RECORD_LOGIN_MASK 无效（${lp.error}），本轮不加登录浮层遮罩`);
    } else if (lp) {
      filters.push(`drawbox=x=${lp.x0}:y=${lp.y0}:w=${lp.x1 - lp.x0}:h=${lp.y1 - lp.y0}:color=${RECORD_MASK_COLOR}:t=fill`);
      maskLog += `（登录浮层遮罩 ${lp.x0}:${lp.y0}→${lp.x1}:${lp.y1}）`;
    }
  }
  const maskFilter = filters.join(',');
  const child = spawn(
    ffmpeg,
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'x11grab',
      '-video_size', RECORD_SIZE,
      '-framerate', '15',
      '-i', X11_DISPLAY,
      ...(maskFilter ? ['-vf', maskFilter] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-an',
      out,
    ],
    { stdio: 'ignore', detached: true },
  );
  child.unref();
  const state = { pid: child.pid, out, ffmpeg };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  log(
    `全程录像开始（E2E_RECORD=1）：DISPLAY=${X11_DISPLAY} → ${out}（pid=${state.pid}）` +
      (maskLog || ''),
  );
  return state;
}

// 在 globalTeardown 调用（stopAllIde 之前）。SIGTERM ffmpeg 并等 trailer 落盘。
async function stopRecording() {
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    state = null;
  }
  if (!state) return;
  if (pidAlive(state.pid)) {
    spawnSync('kill', ['-TERM', String(state.pid)], { encoding: 'utf8' });
    for (let i = 0; i < 10 && pidAlive(state.pid); i++) {
      await sleepMs(500);
    }
    if (pidAlive(state.pid)) {
      spawnSync('kill', ['-9', String(state.pid)], { encoding: 'utf8' });
    }
  }
  try {
    fs.rmSync(STATE_FILE, { force: true });
  } catch (_) {
    /* ignore */
  }
  let size = 0;
  try {
    size = fs.statSync(state.out).size;
  } catch (_) {
    /* 录像文件缺失（ffmpeg 启动失败）不报错，只提示 */
  }
  log(`全程录像结束：${state.out}（${(size / 1024 / 1024).toFixed(1)} MB）—— 与失败截图/Jest JSON 一并上传 job artifact`);
}

module.exports = { startRecording, stopRecording };