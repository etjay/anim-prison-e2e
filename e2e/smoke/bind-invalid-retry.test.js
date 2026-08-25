// 异常分支 E2E（T2.4 / ANIM-9，分支 2）：错误邀请码提示失败且可重试。
//
// 对齐 docs/api.md（T1.2 断言基准）§2 错误码：
// - 邀请码格式合法但不存在（`INVITE-NOPE-999`）→ `BIND_INVALID`（HTTP 400）；
// - 客户端 bind 页按错误码显示「邀请码无效，请检查后重试」，失败停留在绑定页
//   （不跳 home）→ 可用正确邀请码重试；
// - 重试正确码（fixture `INVITE-ALPHA`，未绑定）→ 绑定成功 → reLaunch home，
//   首页渲染 fixtures 动物（penguin「皮皮」，docs/api.md Fixtures 清单）。
const e2e = require('../helpers');

// mock-server 地址：默认 127.0.0.1:3000（miniprogram dev baseURL）；本机 3000
// 被占用（如 Multica 平台）时以 `MOCK_PORT=3001 npm run start:dev` 起服务并
// 传 `E2E_MOCK_PORT=3001`，用例据此经 globalData.baseURL 对齐（客户端逻辑不变）。
const MOCK = `http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3000}`;

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

// 测试前置：重置 mock fixtures（user_10001 未绑定、INVITE-ALPHA 未绑定），
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

test('错误邀请码提示 BIND_INVALID 失败，且可用正确邀请码重试成功', async () => {
  await resetFixtures();
  await e2e.setGlobalData({ baseURL: MOCK });
  const landed = await e2e.stubLogin();
  expect(landed).toBe('pages/welcome/welcome');

  // ① 输入不存在的邀请码（格式合法）→ 绑定失败
  await e2e.goto('/pages/bind/bind');
  await e2e.setPageData({ code: 'INVITE-NOPE-999' });
  await e2e.tap('onConfirm');
  const err = await awaitBindError('[BIND_INVALID]');
  expect(err.error).toBe('邀请码无效，请检查后重试');
  expect(err.loading).toBe(false);
  // 失败不跳转：停留在绑定页 → 可重试
  await e2e.expectPage('/pages/bind/bind');
  // 渲染层：错误提示节点已挂载
  const r = await e2e.visible('.error', { label: '绑定页错误提示元素' });
  expect(r.width).toBeGreaterThan(0);

  // ② 重试：正确邀请码 → 绑定成功 → home，首页渲染 fixtures 动物
  await e2e.setPageData({ code: 'INVITE-ALPHA' });
  await e2e.tap('onConfirm');
  await e2e.expectPage('/pages/home/home');
  const home = await e2e.waitFor(
    async () => {
      const d = await e2e.pageData();
      return d && d.animal && d.loading === false ? d : null;
    },
    { label: '首页动物数据加载完成', timeoutMs: 15000 },
  );
  expect(home.animal.name).toBe('皮皮');
  // docs/api.md §3：/api/animal 的 animal 同时含 type（fixture 键）与 species（展示名）
  expect(home.animal.type).toBe('penguin'); // fixture 身份：INVITE-ALPHA → penguin
  expect(home.animal.species).toBe('企鹅'); // 渲染层展示名（home.wxml 物种行）
});