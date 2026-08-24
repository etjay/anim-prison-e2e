'use strict';
// Jest globalSetup：全 suite 只启动一次 DevTools（IDE 干净重启 + Xvfb）。
//
// 时序（对应「global setup/teardown：全 suite 复用单 DevTools 实例、退出时关闭」）：
//   globalSetup（本文件）→ 停残留 IDE → 起 Xvfb → 冷启 IDE（~7–20s，一次性）
//   测试进程内            → e2e/helpers 的 bootstrap() 只 launch 一次 automator，
//                           全部测试文件复用同一实例（模块级单例）
//   globalTeardown        → cli quit + 杀孤儿 renderer，关闭 DevTools
//
// 幂等：Xvfb/IDE 已在运行也走统一入口（每轮干净重启 IDE 是 spike 补丁 D 的
// 要求——残留 auto tunnel 会让 automator 端口探测选错端口）。
const { ensureDevtools } = require('./tools/ensure-devtools');

module.exports = async function globalSetup() {
  await ensureDevtools();
};