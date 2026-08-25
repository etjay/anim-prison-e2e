'use strict';
// E2E helper 统一出口：用例文件只 require('../helpers')，不直接触碰
// miniprogram-automator（API 只在 helpers/runtime.js 出现，为二期真机/minium 迁移留缝）。
const runtime = require('./runtime');
const { waitFor } = require('./wait');
const navigation = require('./navigation');
const session = require('./session');

// 元素 helper：visible = waitFor + 渲染层 rect（节点挂载且布局非空）。
// 文案断言模式（spike 补丁 C）：数据层 pageData()[key] === 期望值
// + 渲染层 visible(selector)，见 README「用例编写规范」。
async function visible(selector, opts = {}) {
  const r = await waitFor(() => runtime.rect(selector), {
    label: `元素 ${selector} 渲染`,
    timeoutMs: opts.timeoutMs == null ? 15000 : opts.timeoutMs,
    ...opts,
  });
  if (!r) throw new Error(`visible：${selector} 在预算内无 rect（节点未挂载或查询失败）`);
  return r;
}

module.exports = {
  // 生命周期（每个用例文件：beforeAll(bootstrap) + afterEach(autoShot)）
  bootstrap: runtime.bootstrap,
  close: runtime.close,
  autoShot: runtime.autoShot,
  screenshot: runtime.screenshot,
  // 统一等待（禁用固定 sleep）
  waitFor,
  // 导航
  goto: navigation.goto,
  expectPage: navigation.expectPage,
  currentPath: navigation.currentPath,
  // 元素 / 页面数据
  pageData: runtime.pageData,
  rect: runtime.rect,
  visible,
  tap: runtime.tapPageHandler,
  setPageData: runtime.setPageData,
  setGlobalData: runtime.setGlobalData,
  // 会话（stub 登录 / 邀请码绑定 / 离线兜底）
  stubLogin: session.stubLogin,
  assumeState: session.assumeState,
  bindInvite: session.bindInvite,
  // 环境信息（排查用）
  PROJECT_PATH: runtime.PROJECT_PATH,
  SHOT_DIR: runtime.SHOT_DIR,
};