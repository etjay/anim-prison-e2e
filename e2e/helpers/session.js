'use strict';
// 会话 helper：stub 登录 / 邀请码绑定（驱动真实页面逻辑，非绕过）。
//
// 前置：
// - stubLogin 走登录页 onLogin → wx.request 打 mock-server 的 POST /api/auth/login，
//   故需 mock-server 已启动（`cd mock-server && MOCK_PROFILE=dev MOCK_PORT=3001 node server.js`，
//   与 miniprogram/config/env.js 的 dev baseURL 对齐，见 e2e/README.md）；
// - bindInvite 走绑定页 onConfirm → POST /api/bind，同样需 mock-server
//   （邀请码 fixtures 见 mock-server/README.md 与 docs/api.md，如 ANIM-001）；
// - assumeState 为离线兜底（不经接口，直接设 globalData 并跳转），与登录页
//   「骨架期手动走通」入口等价，供不依赖 mock 的用例使用。
const runtime = require('./runtime');
const { waitFor } = require('./wait');
const { goto, expectPage } = require('./navigation');

// stub 登录：登录页点「微信一键登录」，等按绑定状态跳转（未绑定→welcome，已绑定→home）。
// 返回落地页路径。
async function stubLogin() {
  await goto('/pages/login/login');
  await runtime.tapPageHandler('onLogin');
  const landed = await waitFor(
    async () => {
      const p = await runtime.currentPath();
      return p && p !== 'pages/login/login' ? p : null;
    },
    { label: 'stub 登录跳转（需 mock-server 已启动）', timeoutMs: 20000 },
  );
  return landed;
}

// 离线兜底：不经接口，直接设 globalData.bound 并 reLaunch 到对应页
// （与登录页手动入口 gotoWelcome/gotoHome 的语义一致）。
async function assumeState({ bound = false, token = 'stub-token' } = {}) {
  await runtime.setGlobalData({ bound: !!bound, token });
  await goto(bound ? '/pages/home/home' : '/pages/welcome/welcome');
}

// 邀请码绑定：绑定页填入 code → 确认绑定 → 等跳转 home。
// 错误码分支（BIND_INVALID/BIND_DUPLICATE）会留在绑定页，
// 用例可随后用 expectPage('/pages/bind/bind') + pageData().errorMsg 断言。
async function bindInvite(code) {
  await goto('/pages/bind/bind');
  await runtime.setPageData({ code: String(code) });
  await runtime.tapPageHandler('onConfirm');
  await expectPage('/pages/home/home');
  return 'pages/home/home';
}

module.exports = { stubLogin, assumeState, bindInvite };