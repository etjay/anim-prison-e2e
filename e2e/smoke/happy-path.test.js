// MVP 正向链路冒烟用例（T2.3）：
//   stub 登录 → 绑定新邀请码 → 首页地图/动物卡片渲染 → 食堂喂食互动 → 评分展示更新
//
// 前置：
// - mock-server 已启动（dev profile；本机 dev baseURL 为 127.0.0.1:3001，
//   与 miniprogram/config/env.js 一致，启动方式见 e2e/README.md）；
// - mock 默认时钟 2026-01-15T12:00:00+08:00 在午间喂食窗口内（11:30–13:00），
//   正向喂食开箱即用，无需 X-Mock-Now；
// - 断言基线对齐 docs/api.md（T1.2）：初始 satisfaction 55 → score 2.8；
//   喂食一次后 satisfaction 61 → score 3.1、count 1、points 6（api.md 交互示例）。
//
// 编写规范（详见 e2e/README.md）：
// - 只 require('../helpers')，不直接触碰 miniprogram-automator；
// - 禁固定 sleep，等待一律 waitFor 预算内轮询；
// - S4 起经 navigateTo 入栈（栈 [home, canteen]）：pageData()/tap() 取栈底 [0]=home，
//   用例内用 topPageData()/topTap()（基于 e2e.evaluate 的栈顶访问）读顶层页；
// - beforeAll(bootstrap) 全 suite 复用单 DevTools 实例；afterEach(autoShot) 留现场；
// - S1/S2 在开头重置 fixtures（T1.2 ops 接口，对 mock 的普通 HTTP 调用，
//   非 automator API），失败重试可整段重放；S3–S6 共享 S2 之后的已绑定链路状态。
const e2e = require('../helpers');

// 与 miniprogram/config/env.js 的 dev baseURL 保持一致。
const MOCK_BASE = 'http://127.0.0.1:3001';

/** 重置 fixtures（POST /api/reset）：账号/邀请码/动物回到默认初始态。 */
async function resetFixtures() {
  const res = await fetch(`${MOCK_BASE}/api/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`fixtures 重置失败: HTTP ${res.status}`);
}

/**
 * 顶层页（栈顶）data 读取。
 * S4 起用例经 home.gotoCanteen 的 navigateTo 进入食堂：页面栈变为
 * [home, canteen]，而框架 pageData()/tap() 取 getCurrentPages()[0]（栈底=home），
 * 与可见页错位；本 helper 取栈顶（T2.2 已知缺口，框架补 topPageData/tapTop 后回收）。
 */
async function topPageData() {
  return e2e.evaluate(() => {
    const ps = getCurrentPages();
    const p = ps[ps.length - 1];
    return { depth: ps.length, data: p ? p.data : null };
  });
}

/** 顶层页（栈顶）指定页面方法调用（如食堂页 onFeed）。 */
function topTap(method, ...args) {
  return e2e.evaluate(
    (n, a) => {
      const ps = getCurrentPages();
      const p = ps[ps.length - 1];
      if (!p) throw new Error('无顶层页');
      if (typeof p[n] !== 'function') throw new Error(`顶层页没有方法 ${n}`);
      const r = p[n](...a);
      return r === undefined ? true : r;
    },
    method,
    args,
  );
}

/** 顶层页（栈顶）节点渲染探测（等价 e2e.visible，但查栈顶页）。 */
async function topVisible(selector, { timeoutMs = 15000 } = {}) {
  const r = await e2e.waitFor(
    () =>
      e2e.evaluate((sel) => {
        const ps = getCurrentPages();
        const p = ps[ps.length - 1];
        if (!p) return new Promise(() => {});
        return new Promise((res) => {
          p.createSelectorQuery().select(sel).boundingClientRect().exec((q) => res(q && q.length ? q[0] : null));
        });
      }, selector),
    { label: `顶层页元素 ${selector} 渲染`, timeoutMs },
  );
  if (!r) throw new Error(`topVisible：${selector} 在预算内无 rect（节点未挂载或查询失败）`);
  return r;
}

beforeAll(e2e.bootstrap);
afterEach(e2e.autoShot);

// —— S1 stub 登录：未绑定账号落地欢迎页 ——
test('S1 stub 登录：未绑定账号落地欢迎页，env 与核心元素正确', async () => {
  await resetFixtures();
  const landed = await e2e.stubLogin();
  expect(landed).toBe('pages/welcome/welcome');

  // 数据层：页面 env 标签（config/env.js，dev）
  const data = await e2e.pageData();
  expect(data.env).toBe('dev');

  // 渲染层：欢迎卡片核心元素
  for (const sel of ['.welcome-card', '.title', '.btn']) {
    const r = await e2e.visible(sel, { label: `欢迎页 ${sel}` });
    expect(r.width).toBeGreaterThan(0);
  }
});

// —— S2 绑定新邀请码：绑定成功跳转首页，动物数据对齐 fixtures ——
test('S2 绑定新邀请码 INVITE-ALPHA：绑定成功跳转首页，动物数据对齐 fixtures', async () => {
  await resetFixtures();
  await e2e.stubLogin(); // reset 后旧会话失效，重新登录换取新 token
  await e2e.bindInvite('INVITE-ALPHA');

  // 首页 onShow → GET /api/animal；等数据落地（loading 结束且动物就位）
  const data = await e2e.waitFor(async () => {
    const d = await e2e.pageData();
    return d && d.animal && !d.loading ? d : null;
  }, { label: '首页动物数据加载' });
  expect(data.error).toBe('');
  expect(data.animal.name).toBe('皮皮');
  expect(data.animal.species).toBe('企鹅');
  expect(data.animal.mood).toBe(55); // fixtures 初始 satisfaction（api.md 基线）
});

// —— S3 首页：动物卡片 + 校园地图渲染（数据对齐 fixtures） ——
test('S3 首页：动物卡片与校园地图渲染（cells 对齐 MAP fixtures）', async () => {
  const data = await e2e.waitFor(async () => {
    const d = await e2e.pageData();
    return d && Array.isArray(d.cells) && d.cells.length > 0 ? d : null;
  }, { label: '首页地图 cells 加载' });
  expect(data.cells).toEqual(['🌳', '🏠', '🍲', '🪺', '🌿', '🛖']); // MAP fixtures（api.md）
  expect(data.animal.emoji).toBe('🐧');

  // 渲染层：动物卡片 + 地图格子
  for (const sel of ['.animal-emoji', '.animal-name', '.map-cell']) {
    const r = await e2e.visible(sel, { label: `首页 ${sel}` });
    expect(r.width).toBeGreaterThan(0);
  }
});

// —— S4 食堂：互动前初始评分展示 ——
test('S4 食堂：互动前评分展示（satisfaction 55 → score 2.8，count 0）', async () => {
  // 自愈守卫：S3 与 S4 之间若 app 被外部重置（同机并行的其他 e2e run 的
  // stopAllIde 杀掉本 IDE），或上次尝试中途崩溃停在食堂页，先归位到首页：
  //   - 登录页（appservice 重启、globalData 丢失）→ 重新 stub 登录；
  //   - 欢迎页（mock 被并行 run 重置为未绑定）→ 重置 fixtures 后重新绑定；
  //   - 其他（如残留的食堂页）→ reLaunch 回首页归一化页面栈。
  let p = await e2e.currentPath();
  if (p === 'pages/login/login') {
    await e2e.stubLogin();
    p = await e2e.currentPath();
    if (p === 'pages/welcome/welcome') {
      await resetFixtures();
      await e2e.stubLogin();
      await e2e.bindInvite('INVITE-ALPHA');
      p = await e2e.currentPath();
    }
  } else if (p !== 'pages/home/home') {
    await e2e.goto('/pages/home/home');
  }
  await e2e.waitFor(async () => {
    const q = await e2e.currentPath();
    if (q !== 'pages/home/home') return null;
    const d = await e2e.pageData();
    return d && d.animal && !d.loading ? true : null;
  }, { label: 'S4 前置：首页就绪', timeoutMs: 20000 });

  await e2e.tap('gotoCanteen');
  await e2e.expectPage('/pages/canteen/canteen');

  // 栈已变为 [home, canteen]：顶层页数据读取（见 topPageData 注释）。
  const { depth, data } = await e2e.waitFor(async () => {
    const t = await topPageData();
    return t.data && t.data.loaded && t.data.rating ? t : null;
  }, { label: '食堂评分加载' });
  expect(depth).toBe(2); // [home, canteen]——佐证 navigateTo 未重置栈
  expect(data.animalName).toBe('皮皮');
  expect(data.error).toBe('');
  expect(data.rating.satisfaction).toBe(55);
  expect(data.rating.score).toBe(2.8); // 55/20 保留一位小数（api.md 评分基线）
  expect(data.rating.count).toBe(0);
});

// —— S5 食堂：喂食互动成功（午间喂食窗口内） ——
test('S5 食堂：喂食互动成功，客户端展示成功反馈', async () => {
  await topTap('onFeed');
  const t = await e2e.waitFor(async () => {
    const r = await topPageData();
    return r.data && r.data.resultMsg ? r : null;
  }, { label: '喂食结果反馈' });
  const { data } = t;
  expect(data.resultMsg).toBe('喂食成功！小动物心情 +10');
  expect(data.error).toBe('');
  expect(data.submitting).toBe(false);
});

// —— S6 食堂：喂食后评分展示更新 ——
test('S6 食堂：喂食后评分展示更新（satisfaction 55→61、score 2.8→3.1、count 0→1）', async () => {
  const t = await e2e.waitFor(async () => {
    const r = await topPageData();
    return r.data && r.data.rating && r.data.rating.satisfaction === 61 ? r : null;
  }, { label: '评分更新到喂食后状态' });
  const { data } = t;
  expect(data.rating.satisfaction).toBe(61); // 55 + ΔS 6（api.md 交互示例）
  expect(data.rating.score).toBe(3.1); // 61/20 保留一位小数
  expect(data.rating.count).toBe(1);
  expect(data.rating.points).toBe(6); // 5 × w_t 1.5 × c_S 0.8
  const r = await topVisible('.success', { label: '喂食成功反馈元素' });
  expect(r.width).toBeGreaterThan(0);
});