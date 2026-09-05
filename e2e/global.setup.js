'use strict';
// Jest globalSetup：全 suite 只启动一次 DevTools（IDE 干净重启 + Xvfb）。
//
// 时序（对应「global setup/teardown：全 suite 复用单 DevTools 实例、退出时关闭」）：
//   globalSetup（本文件）→ 停残留 IDE → 起 Xvfb → 登录态 stub（ANIM-25 主修复）
//   → 录像（E2E_RECORD=1）→ 冷启 IDE（~7–20s，一次性）
//   测试进程内            → e2e/helpers 的 bootstrap() 只 launch 一次 automator，
//                           全部测试文件复用同一实例（模块级单例）
//   globalTeardown        → cli quit + 杀孤儿 renderer，关闭 DevTools
//
// 幂等：Xvfb/IDE 已在运行也走统一入口（每轮干净重启 IDE 是 spike 补丁 D 的
// 要求——残留 auto tunnel 会让 automator 端口探测选错端口）。
//
// ANIM-25（登录/授权浮层）时序说明：
//   1) 先停旧 IDE：除干净重启外，还释放 Local Storage leveldb 写锁
//      （登录态 stub 只能在 IDE 停止后写入）；
//   2) seedLoginStub() 在冷启前执行：已登录则零干扰，未登录则注入 stub 登录态，
//      使冷启动水合出已登录用户、未登录浮层不出现（主修复，e2e/tools/login-stub.js）；
//   3) startRecording 此时才启动（X socket 已就绪）：未登录态（含 stub 写入）时
//      追加登录浮层 ffmpeg drawbox 兜底遮罩（T3，遮罩主开关见 e2e/tools/record.js）。
const { stopAllIde, ensureX11Display, ensureIde } = require('./tools/ensure-devtools');
const { startRecording } = require('./tools/record');
const { seedLoginStub } = require('./tools/login-stub');

module.exports = async function globalSetup() {
  stopAllIde();
  ensureX11Display();
  const stub = await seedLoginStub();
  await startRecording({ loginMask: !stub.loggedInBefore });
  ensureIde();
};