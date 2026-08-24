'use strict';
// 统一等待原语 waitFor（T2.2 要求：禁用固定 sleep，统一预算内轮询）。
//
// 规范：
// - 用例中禁止 `await sleep(2000)` 之类固定 sleep 赌时序——一律 `waitFor(pollFn, { timeoutMs })`：
//   在预算（deadline）内以 pollMs 间隔轮询，pollFn 返回真值即成功返回该值；
// - 每次轮询调用套 8s 兜底超时（移植版 automator 调用可能静默挂起，见 runtime 补丁 D）；
// - 预算耗尽仍失败 → 抛带 label 的错误（失败自动截图由 screenshotIfFailed 接管）；
// - suite 级失败重试预算 1 次由 jest.config.js 的 retryTimes: 1 提供，用例无需自写重试。
const runtime = require('./runtime');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {() => Promise<any>|any} pollFn 轮询函数，返回真值即成功
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=15000] 总预算（毫秒）
 * @param {number} [opts.pollMs=300] 轮询间隔（毫秒，仅轮询节拍，不是“固定 sleep 赌时序”）
 * @param {string} [opts.label] 错误信息前缀（建议写清等什么）
 */
async function waitFor(pollFn, opts = {}) {
  const timeoutMs = opts.timeoutMs == null ? 15000 : opts.timeoutMs;
  const pollMs = opts.pollMs == null ? 300 : opts.pollMs;
  const label = opts.label || 'waitFor';
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  for (;;) {
    try {
      const v = await runtime.withTimeout(Promise.resolve().then(pollFn), 8000, label);
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    if (Date.now() + pollMs > deadline) break;
    await sleep(Math.min(pollMs, Math.max(50, deadline - Date.now())));
  }
  throw new Error(`${label}：${timeoutMs}ms 预算内未满足${lastErr ? `（最后错误：${lastErr.message}）` : ''}`);
}

module.exports = { waitFor };