// T3.2 门禁拦截验证用例：故意失败（只存在于验证分支，不合并入 main）。
// 目的：验证「套件红 → 门禁红（拦截合入）」+ 失败截图/Jest JSON 产物可在 CI 下载。
const e2e = require('../helpers');

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

test('gate demo: 故意失败断言', async () => {
  // 正常走通前置（欢迎页可打开），随后断言一个必然不成立的值 → 用例红。
  await e2e.assumeState({ bound: false });
  await e2e.expectPage('/pages/welcome/welcome');
  const data = await e2e.pageData();
  expect(data.env).toBe('gate-demo-wrong-value'); // 故意失败
});
