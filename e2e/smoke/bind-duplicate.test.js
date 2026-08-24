// 异常分支 E2E（T2.4 / ANIM-9，分支 3）：重复绑定展示已绑定/查重提示。
//
// 对齐 docs/api.md（T1.2 断言基准）§2 错误码：重复绑定 → `BIND_DUPLICATE`
// （HTTP 409），`data.reason` 两个子场景：
//   - `invite_already_bound`：邀请码已被他人绑定（fixture INVITE-BRAVO 预绑
//     user_10002，当前 user_10001 使用）；
//   - `user_already_bound`：当前用户已绑定过动物（user_10001 绑 INVITE-ALPHA
//     成功后再次提交邀请码）。
// 客户端 bind 页对两类 reason 统一展示「该邀请码已绑定过，不可重复使用」，
// 且失败停留在绑定页（不跳 home）——即「已绑定/查重提示」分支。
const e2e = require('../helpers');

// mock-server 地址：默认 127.0.0.1:3000（miniprogram dev baseURL）；本机 3000
// 被占用（如 Multica 平台）时以 `MOCK_PORT=3001 npm run start:dev` 起服务并
// 传 `E2E_MOCK_PORT=3001`，用例据此经 globalData.baseURL 对齐（客户端逻辑不变）。
const MOCK = `http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3000}`;

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

// 测试前置：重置 mock fixtures（user_10001 未绑定、INVITE-BRAVO 预绑 user_10002），
// 使用例与套件内其他用例的执行顺序无关。
async function resetFixtures() {
  const r = await fetch(`${MOCK}/api/reset`, { method: 'POST' });
  if (!r.ok) throw new Error(`resetFixtures: HTTP ${r.status}`);
}

// 等待绑定页错误提示出现（数据层：error/errorMsg，errorMsg 含 [错误码] 前缀）
async function awaitBindError(codePrefix) {
  return e2e.waitFor(
    async () => {
      const d = await e2e.pageData();
      if (d && d.error && String(d.errorMsg).startsWith(codePrefix)) return d;
      return null;
    },
    { label: `绑定页错误提示 ${codePrefix}`, timeoutMs: 15000 },
  );
}

test('重复绑定：已绑定邀请码与已绑定用户均展示 BIND_DUPLICATE 查重提示', async () => {
  await resetFixtures();
  await e2e.setGlobalData({ baseURL: MOCK });
  const landed = await e2e.stubLogin();
  expect(landed).toBe('pages/welcome/welcome');

  // ① 子分支 invite_already_bound：使用已被 user_10002 预绑定的 INVITE-BRAVO
  await e2e.goto('/pages/bind/bind');
  await e2e.setPageData({ code: 'INVITE-BRAVO' });
  await e2e.tap('onConfirm');
  const err1 = await awaitBindError('[BIND_DUPLICATE]');
  expect(err1.error).toBe('该邀请码已绑定过，不可重复使用');
  expect(err1.loading).toBe(false);
  // 查重提示不跳转：停留在绑定页
  await e2e.expectPage('/pages/bind/bind');
  const r1 = await e2e.visible('.error', { label: '查重提示元素（邀请码已绑定）' });
  expect(r1.width).toBeGreaterThan(0);

  // ② 前置：先成功绑定 INVITE-ALPHA（user_10001 由未绑定变为已绑定）
  await e2e.setPageData({ code: 'INVITE-ALPHA' });
  await e2e.tap('onConfirm');
  await e2e.expectPage('/pages/home/home');

  // ③ 子分支 user_already_bound：已绑定用户再次提交邀请码
  await e2e.goto('/pages/bind/bind');
  await e2e.setPageData({ code: 'INVITE-ALPHA' });
  await e2e.tap('onConfirm');
  const err2 = await awaitBindError('[BIND_DUPLICATE]');
  expect(err2.error).toBe('该邀请码已绑定过，不可重复使用');
  await e2e.expectPage('/pages/bind/bind');
  const r2 = await e2e.visible('.error', { label: '查重提示元素（用户已绑定）' });
  expect(r2.width).toBeGreaterThan(0);
});