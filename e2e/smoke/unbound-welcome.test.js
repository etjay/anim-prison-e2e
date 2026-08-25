// 异常分支 E2E（T2.4 / ANIM-9，分支 1）：未绑定账号进入欢迎页。
//
// 对齐 docs/api.md（T1.2 断言基准）§1：stub 登录码 `stub-wechat-code` 映射
// fixtures 账号 user_10001（未绑定）→ 登录响应 `bound:false` → 客户端
// login 页按绑定状态跳转，未绑定落地 welcome（欢迎页）。
// welcome onShow 对已绑定用户会自动 reLaunch home——稳定停留在欢迎页即验证
// 「未绑定 → 欢迎页」分支成立。
const e2e = require('../helpers');

// mock-server 地址：默认 127.0.0.1:3000（miniprogram dev baseURL）；本机 3000
// 被占用（如 Multica 平台）时以 `MOCK_PORT=3001 npm run start:dev` 起服务并
// 传 `E2E_MOCK_PORT=3001`，用例据此经 globalData.baseURL 对齐（客户端逻辑不变）。
const MOCK = `http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3000}`;

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

// 测试前置：重置 mock fixtures（user_10001 恢复未绑定），消除套件内其他用例
// 或历史运行留下的已绑定状态（mock-server 进程跨运行驻留，内存态不自动归位）。
async function resetFixtures() {
  const r = await fetch(`${MOCK}/api/reset`, { method: 'POST' });
  if (!r.ok) throw new Error(`resetFixtures: HTTP ${r.status}`);
}

test('未绑定账号 stub 登录后进入欢迎页且核心元素渲染', async () => {
  await resetFixtures();
  // 驱动真实页面逻辑：登录页 onLogin → POST /api/auth/login（需 mock-server 已启动）
  await e2e.setGlobalData({ baseURL: MOCK });
  const landed = await e2e.stubLogin();
  // 未绑定账号（user_10001, bound:false）→ 客户端跳欢迎页
  expect(landed).toBe('pages/welcome/welcome');
  await e2e.expectPage('/pages/welcome/welcome');

  // 数据层：欢迎页 env 标签数据来源
  const data = await e2e.pageData();
  expect(data.env).toBe('dev');

  // 渲染层：欢迎卡片 / 标题 / 绑定按钮（节点挂载且布局非空）
  for (const sel of ['.welcome-card', '.title', '.btn']) {
    const r = await e2e.visible(sel, { label: `欢迎页核心元素 ${sel}` });
    expect(r.width).toBeGreaterThan(0);
  }
});