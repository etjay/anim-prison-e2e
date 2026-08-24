'use strict';
// E2E Jest 配置（单一入口：npm run e2e = `jest -c e2e/jest.config.js --runInBand`）。
//
// 关键约定（依据 spike 报告 docs/spike-devtools-automator.md §4/§6 与 T2.2 任务）：
// - rootDir = e2e/；业务用例只收 e2e/smoke/（spike 用例由 e2e:spike 单独跑）；
// - maxWorkers: 1（固定 auto 隧道端口 9420，同机必须串行；可用 E2E_AUTO_PORT 覆盖）；
// - 失败重试预算 1 次：Jest 30 无 config 重试键，由 helper 层模块加载时调
//   jest.retryTimes(1)（见 e2e/helpers/runtime.js）；用例内部禁用固定 sleep，统一 waitFor 轮询；
// - globalSetup/globalTeardown：全 suite 单 DevTools 实例（启动一次、退出关闭）；
// - forceExit：worker 持有 automator ws 连接，suite 结束后强制退出（IDE 已由
//   globalTeardown 关闭）。
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/smoke/**/*.test.js'],
  globalSetup: '<rootDir>/global.setup.js',
  globalTeardown: '<rootDir>/global.teardown.js',
  maxWorkers: 1,
  testTimeout: 120000,
  // 注意：重试预算不在这里配（Jest 30 取消了 retries/retryTimes 配置键），
  // 由 helper 层 jest.retryTimes(1) 统一提供，见 e2e/helpers/runtime.js。
  forceExit: true,
  verbose: true,
};