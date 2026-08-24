// 冒烟用例（T2.2 框架验收用的琐碎用例）：打开欢迎页并断言核心元素。
//
// 编写规范（详见 e2e/README.md）：
// - 只 require('../helpers')，不直接触碰 miniprogram-automator；
// - beforeAll(bootstrap)：全 suite 复用单 DevTools 实例；
// - afterEach(autoShot)：用例后状态截图落 e2e/screenshots/（失败时即失败现场）；
// - 禁固定 sleep，等待一律 waitFor（此处 welcome 为无接口依赖的静态页，
//   goto/visible 内部已用 waitFor 预算轮询）。
const e2e = require('../helpers');

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

test('打开欢迎页并断言核心元素', async () => {
  // 未绑定态直达欢迎页（离线兜底，不依赖 mock-server）
  await e2e.assumeState({ bound: false });
  await e2e.expectPage('/pages/welcome/welcome');

  // 核心元素（渲染层：节点已挂载且布局非空）
  for (const sel of ['.welcome-card', '.title', '.btn']) {
    const r = await e2e.visible(sel, { label: `核心元素 ${sel}` });
    expect(r.width).toBeGreaterThan(0);
  }

  // 数据层：页面 env 标签的数据来源
  const data = await e2e.pageData();
  expect(data).not.toBeNull();
  expect(data.env).toBe('dev');
});